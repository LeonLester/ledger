import { create } from "zustand";
import { db } from "./db";
import { markAllDirty, resetRemote } from "./sync";
import { setFormulas } from "./lib/formulas";
import seedJson from "./data/seed.json";
import { cancelRest, primeAlarm, scheduleRest } from "./native";
import { linkPrev, relabel, runs } from "./lib/groups";
import type { Adjustment, BodyWeight, ExerciseDef, ExLog, Feedback, Meso, Seed, Session, Settings, SetLog, Unit } from "./types";
import { defaultIncrement, isoDate, uid, worked } from "./lib/math";
import { coarse, guessMuscle } from "./lib/muscles";
import { effectiveSessions, feedbackDelta, mrvFor, suggestTarget, weekTarget } from "./lib/progression";
import { lastLog, mesoNum } from "./lib/selectors";
import { CAT, LIFT_NAME } from "./data/catalog";
import type { Generated } from "./data/templates";

const seed = seedJson as unknown as Seed;
const ATHLETE = "me";
const DEFAULTS: Settings = {
  athleteId: ATHLETE, mode: "feedback", unit: "kg", bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], restSec: 150,
  theme: "auto", mesoStart: null, activeMeso: "m3", week: 1, effort: "rir",
};

/** standard exercises are always available to add or swap in */
function ensureCatalog(lib: Record<string, ExerciseDef>) {
  const out = { ...lib };
  const add = (name: string, base: string) => {
    const c = CAT[base];
    if (c && !out[name]) out[name] = { name, muscle: c.muscle, unit: c.unit ?? "kg", increment: c.inc ?? defaultIncrement("kg") };
  };
  for (const n of Object.keys(CAT)) add(n, n);
  for (const n of Object.values(LIFT_NAME)) add(n + " (T2)", n);
  return out;
}

interface State {
  ready: boolean; settings: Settings; mesos: Meso[]; sessions: Session[]; feedback: Feedback[]; adjustments: Adjustment[];
  bodyweight: BodyWeight[]; library: Record<string, ExerciseDef>; targets: Seed["targets"]; landmarks: Seed["landmarks"]; split: Seed["split"];
  openSession: string | null; update: import("./native").UpdateInfo | null; updateNote: string; rest: { until: number; total: number } | null; toast: string | null;
  init(): Promise<void>;
  clear(): void;
  saveSplit(split: Seed["split"]): void;
  addLibrary(names: string[]): void;
  sheetSets(mesoId: string, week: number, name: string, exercise: string, sets: SetLog[]): void;
  saveMeso(meso: Meso): void;
  deleteMeso(id: string): void;
  loadSample(): Promise<void>;
  createProgram(build: (id: string) => Generated): Promise<void>;
  setSettings(p: Partial<Settings>): void;
  muscleOf(ex: string): string;
  startSession(week: number, name: string): string;
  closeSession(): void;
  updateEx(sessionId: string, idx: number, fn: (e: ExLog) => ExLog): void;
  toggleSet(sessionId: string, exIdx: number, setIdx: number): void;
  addExercise(sessionId: string, name: string, link?: boolean): void;
  linkExercise(sessionId: string, idx: number, link: boolean): void;
  removeExercise(name: string): void;
  finishSession(id: string, fb: Record<string, { pump: number; workload: number }>): void;
  reopenSession(id: string): void;
  deleteSession(id: string): void;
  setSoreness(fbId: string, soreness: number): void;
  resolveFeedback(fbId: string, accept: boolean): void;
  addBodyweight(kg: number, date?: string): void;
  applyMealcost(list: { date: string; kg: number }[]): number;
  setExercise(name: string, patch: Partial<ExerciseDef>): void;
  startRest(sec?: number): void; stopRest(): void; say(msg: string): void;
  exportAll(): Promise<string>; importAll(json: string): Promise<void>; resetAll(): Promise<void>;
}

const persistSession = (s: Session) => void db.sessions.put(s);

export const useStore = create<State>((set, get) => ({
  ready: false, settings: DEFAULTS, mesos: [], sessions: [], feedback: [], adjustments: [], bodyweight: [],
  library: {}, targets: seed.targets, landmarks: seed.landmarks, split: [], openSession: null, update: null, updateNote: "", rest: null, toast: null,

  clear() { set({ ready: false, settings: DEFAULTS, mesos: [], sessions: [], feedback: [], adjustments: [], bodyweight: [], library: {}, split: [], openSession: null, rest: null }); },
  saveSplit(split) { set({ split }); void db.kv.put({ key: "split", value: split }); },
  addLibrary(names) {
    const lib = { ...get().library }; let n = 0;
    for (const name of names) {
      if (!name || lib[name]) continue;
      const base = CAT[name.replace(/ \(T2\)$/, "")];
      lib[name] = { name, muscle: base?.muscle ?? guessMuscle(name), unit: base?.unit ?? "kg", increment: base?.inc ?? defaultIncrement("kg") }; n++;
    }
    if (n) { set({ library: lib }); void db.kv.put({ key: "library", value: lib }); }
  },
  /** Spreadsheet-style entry: replaces the sets of one exercise in a session, creating the session as logged when it does not exist. */
  sheetSets(mesoId, week, name, exercise, sets) {
    const { sessions, mesos, settings, library } = get();
    const id = `${mesoId}w${week}-${name}`;
    const found = sessions.find((s) => s.id === id);
    const planned = mesos.find((m) => m.id === mesoId)?.weeks.find((w) => w.week === week)?.sessions.find((s) => s.name === name);
    const fresh = (): Session => ({ id, athleteId: settings.athleteId, meso: mesoId, week, name, date: null, status: "done", exercises: [], finished: Date.now() });
    const base = found ?? fresh();
    const has = base.exercises.some((e) => e.exercise === exercise);
    const plannedItem = planned?.items.find((i) => i.exercise === exercise);
    const exercises = has ? base.exercises.map((e) => (e.exercise === exercise ? { ...e, sets } : e))
      : [...base.exercises, { letter: plannedItem?.letter ?? String.fromCharCode(65 + base.exercises.length), exercise, unit: library[exercise]?.unit ?? "kg", rir: plannedItem?.rir ?? null, note: null, sets } as ExLog];
    const next: Session = { ...base, exercises: exercises.filter((e) => e.sets.length > 0 || e.exercise !== exercise) };
    set({ sessions: found ? sessions.map((s) => (s.id === id ? next : s)) : [...sessions, next] });
    persistSession(next);
  },
  saveMeso(meso) {
    const row = { ...meso, athleteId: get().settings.athleteId };
    set({ mesos: get().mesos.some((m) => m.id === meso.id) ? get().mesos.map((m) => (m.id === meso.id ? row : m)) : [...get().mesos, row] });
    void db.mesos.put(row);
  },
  deleteMeso(id) { set({ mesos: get().mesos.filter((m) => m.id !== id) }); void db.mesos.delete(id); },

  async init() {
    let st = await db.settings.get("main");
    if (!st) {
      await db.settings.put({ ...DEFAULTS, onboarded: false, key: "main" });
      st = await db.settings.get("main");
    } else if (st.onboarded === undefined) {
      st = { ...st, onboarded: true };
      await db.settings.put(st);
    }
    const [mesos, sessions, feedback, adjustments, bodyweight, lib, sp] = await Promise.all([
      db.mesos.toArray(), db.sessions.toArray(), db.feedback.toArray(), db.adjustments.toArray(), db.bodyweight.toArray(), db.kv.get("library"), db.kv.get("split"),
    ]);
    const { key: _k, ...loaded } = st as Settings & { key: string };
    let settings: Settings = loaded;
    // repair a settings row that points at a block or week that does not exist, which would leave Train, Plan and Volume empty
    if (mesos.length) {
      const m = mesos.find((x) => x.id === settings.activeMeso) ?? [...mesos].sort((a, b) => mesoNum(b.id) - mesoNum(a.id))[0];
      const weeks = m.weeks.map((w) => w.week);
      const week = weeks.includes(settings.week) ? settings.week : weeks[0];
      if (m.id !== settings.activeMeso || week !== settings.week) { settings = { ...settings, activeMeso: m.id, week }; await db.settings.put({ ...settings, key: "main" }); }
    }
    const stored = (lib?.value as Record<string, ExerciseDef>) ?? {};
    const library = ensureCatalog(stored);
    if (Object.keys(library).length !== Object.keys(stored).length) void db.kv.put({ key: "library", value: library });
    setFormulas(settings.fx);
    set({ ready: true, settings, mesos, sessions, feedback, adjustments, bodyweight, library, split: (sp?.value as Seed["split"]) ?? (settings.onboarded && mesos.length ? seed.split : []) });
  },

  /** Three real mesocycles of logged training, for exploring the app. */
  async loadSample() {
    const sessions: Session[] = seed.sessions.map((s) => ({ ...s, athleteId: ATHLETE, status: "done" as const }));
    const maxWeek = Math.max(...sessions.filter((s) => s.meso === DEFAULTS.activeMeso).map((s) => s.week));
    await db.transaction("rw", [db.settings, db.mesos, db.sessions, db.kv, db.feedback, db.adjustments, db.bodyweight], async () => {
      await Promise.all([db.mesos.clear(), db.sessions.clear(), db.feedback.clear(), db.adjustments.clear(), db.bodyweight.clear()]);
      await db.mesos.bulkPut(seed.mesos.map((m) => ({ ...m, athleteId: ATHLETE })));
      await db.sessions.bulkPut(sessions);
      const lib: Record<string, ExerciseDef> = {};
      for (const [name, m] of Object.entries(seed.library)) {
        const muscle = m === "Unknown" ? guessMuscle(name) : m;
        lib[name] = { name, muscle, unit: "kg", increment: defaultIncrement("kg"), guessed: m === "Unknown" };
      }
      await db.kv.put({ key: "library", value: lib });
      await db.kv.put({ key: "split", value: seed.split });
      await db.settings.put({ ...DEFAULTS, week: maxWeek, onboarded: true, key: "main" });
    });
    await markAllDirty();
    await get().init();
  },

  async createProgram(build) {
    const { mesos, library, settings } = get();
    const id = `m${Math.max(0, ...mesos.map((m) => mesoNum(m.id))) + 1}`;
    const g = build(id);
    const lib = { ...library };
    for (const w of g.meso.weeks) for (const sess of w.sessions) for (const it of sess.items) {
      if (lib[it.exercise]) continue;
      const base = CAT[it.exercise.replace(/ \(T2\)$/, "")];
      lib[it.exercise] = { name: it.exercise, muscle: base?.muscle ?? guessMuscle(it.exercise), unit: "kg", increment: base?.inc ?? defaultIncrement("kg") };
    }
    const row = { ...g.meso, athleteId: settings.athleteId };
    const next: Settings = { ...settings, activeMeso: id, week: 1, onboarded: true, mode: g.mode ?? settings.mode, effort: g.effort ?? settings.effort, tms: g.tms ?? settings.tms };
    await db.mesos.put(row);
    await db.kv.put({ key: "library", value: lib });
    await db.kv.put({ key: "split", value: g.split });
    await db.settings.put({ ...next, key: "main" });
    set({ mesos: [...mesos, row], library: lib, split: g.split, settings: next, openSession: null });
  },

  setSettings(p) {
    const settings = { ...get().settings, ...p };
    if ("fx" in p) setFormulas(settings.fx);
    set({ settings });
    void db.settings.put({ ...settings, key: "main" });
  },
  muscleOf(ex) { return get().library[ex]?.muscle ?? guessMuscle(ex); },

  startSession(week, name) {
    const { mesos, settings, sessions, library } = get();
    const id = `${settings.activeMeso}w${week}-${name}`;
    if (sessions.some((s) => s.id === id)) { set({ openSession: id }); return id; }
    const meso = mesos.find((m) => m.id === settings.activeMeso)!;
    const planned = meso.weeks.find((w) => w.week === week)?.sessions.find((s) => s.name === name);
    const effective = effectiveSessions(meso, week, get().adjustments, get().muscleOf).find((s) => s.name === name);
    const tms = settings.tms ?? {};
    const exercises: ExLog[] = (effective?.items ?? planned?.items ?? []).map((it) => {
      const def = library[it.exercise];
      const tm = it.lift ? tms[it.lift] : undefined;
      const wFor = (pct: number) => (tm ? Math.round((tm * pct) / 2.5) * 2.5 : null);
      let sets: SetLog[];
      if (it.scheme) {
        sets = it.scheme.map((sc) => ({ weight: wFor(sc.pct), reps: null, myo: [], tr: sc.reps, amrap: !!sc.amrap }));
      } else {
        const tgt = suggestTarget(it, lastLog(it.exercise, sessions), def);
        const w = it.pct != null && tm ? wFor(it.pct) : tgt.weight;
        sets = Array.from({ length: Math.max(1, it.sets) }, () => ({ weight: w, reps: null, myo: [] }));
      }
      return { letter: it.letter, exercise: it.exercise, unit: def?.unit ?? "kg", rir: it.rir, note: null, sets };
    });
    const s: Session = { id, athleteId: settings.athleteId, meso: settings.activeMeso, week, name, date: isoDate(new Date()), status: "active", exercises, started: Date.now() };
    set({ sessions: [...sessions, s], openSession: id });
    persistSession(s);
    return id;
  },
  closeSession() { set({ openSession: null }); },

  updateEx(sessionId, idx, fn) {
    const sessions = get().sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const next = { ...s, exercises: s.exercises.map((e, i) => (i === idx ? fn(e) : e)) };
      persistSession(next);
      return next;
    });
    set({ sessions });
  },
  linkExercise(sessionId, idx, link) {
    const sessions = get().sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const next = { ...s, exercises: linkPrev(s.exercises, idx, link) };
      persistSession(next);
      return next;
    });
    set({ sessions });
  },
  removeExercise(name) {
    const library = { ...get().library }; delete library[name];
    set({ library }); void db.kv.put({ key: "library", value: library });
  },
  addExercise(sessionId, name, link) {
    const { sessions, library } = get();
    const lg = lastLog(name, sessions);
    const w = lg?.sets[0]?.weight ?? null;
    const next = sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const ex: ExLog = { letter: "~", exercise: name, unit: library[name]?.unit ?? "kg", rir: 2, note: null, sets: [{ weight: w, reps: null, myo: [] }, { weight: w, reps: null, myo: [] }] };
      const all = [...s.exercises, ex];
      const n = { ...s, exercises: link && s.exercises.length ? linkPrev(all, all.length - 1, true) : relabel(all) };
      persistSession(n);
      return n;
    });
    set({ sessions: next });
  },
  toggleSet(sessionId, exIdx, setIdx) {
    let started = false;
    const list = get().sessions.find((x) => x.id === sessionId)?.exercises ?? [];
    const lastOfGroup = runs(list)[exIdx]?.last ?? true;
    get().updateEx(sessionId, exIdx, (e) => ({
      ...e, sets: e.sets.map((s, i) => {
        if (i !== setIdx) return s;
        const done = !s.done; started = done;
        return { ...s, done };
      }),
    }));
    if (started && lastOfGroup) get().startRest();
  },

  finishSession(id, fb) {
    const { sessions, feedback, settings, adjustments } = get();
    const sess = sessions.find((s) => s.id === id)!;
    const cleaned: Session = { ...sess, status: "done", finished: Date.now(),
      exercises: sess.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: s.done || worked(s) })) })).filter((e) => e.sets.some(worked)) };
    const rows: Feedback[] = Object.entries(fb).map(([muscle, v]) => ({
      id: `${id}:${muscle}`, athleteId: settings.athleteId, sessionId: id, meso: sess.meso, week: sess.week, muscle,
      pump: v.pump, workload: v.workload, soreness: null, delta: null, state: "pending" as const,
    }));
    const keep = feedback.filter((f) => f.sessionId !== id);
    set({ sessions: sessions.map((s) => (s.id === id ? cleaned : s)), feedback: [...keep, ...rows], openSession: null });
    persistSession(cleaned);
    void db.feedback.bulkPut(rows);
    void adjustments;
  },
  reopenSession(id) {
    const sessions = get().sessions.map((s) => (s.id === id ? { ...s, status: "active" as const } : s));
    set({ sessions, openSession: id });
    persistSession(sessions.find((s) => s.id === id)!);
  },
  deleteSession(id) {
    set({ sessions: get().sessions.filter((s) => s.id !== id), openSession: null });
    void db.sessions.delete(id);
  },

  /** Soreness is rated when the muscle is next trained. It completes the pump + soreness pair and yields a set suggestion. */
  setSoreness(fbId, soreness) {
    const { feedback, settings, sessions, targets, landmarks } = get();
    const f = feedback.find((x) => x.id === fbId);
    if (!f) return;
    let delta = feedbackDelta(f.pump, soreness, f.workload);
    const nextWeek = f.week + 1;
    const meso = get().mesos.find((m) => m.id === f.meso);
    if (!meso?.weeks.some((w) => w.week === nextWeek)) delta = 0;
    // do not exceed MRV for the next week
    const base = weekTarget(f.muscle, nextWeek, targets) ?? weekTarget(coarse(f.muscle), nextWeek, targets);
    const mrv = mrvFor(f.muscle, landmarks);
    if (delta > 0 && base != null && mrv != null && base + delta > mrv) delta = Math.max(0, mrv - base);
    const next: Feedback = { ...f, soreness, delta, state: settings.mode === "auto" ? "applied" : "pending" };
    set({ feedback: feedback.map((x) => (x.id === fbId ? next : x)) });
    void db.feedback.put(next);
    void sessions;
    if (settings.mode === "auto") get().resolveFeedback(fbId, true);
  },
  resolveFeedback(fbId, accept) {
    const { feedback, adjustments, settings } = get();
    const f = feedback.find((x) => x.id === fbId);
    if (!f) return;
    const next: Feedback = { ...f, state: accept ? "applied" : "skipped" };
    const fbs = feedback.map((x) => (x.id === fbId ? next : x));
    let adj = adjustments;
    if (accept && f.delta) {
      const a: Adjustment = { id: `adj:${fbId}`, athleteId: settings.athleteId, meso: f.meso, week: f.week + 1, muscle: f.muscle, delta: f.delta, source: "feedback" };
      adj = [...adjustments.filter((x) => x.id !== a.id), a];
      void db.adjustments.put(a);
    }
    set({ feedback: fbs, adjustments: adj });
    void db.feedback.put(next);
  },

  addBodyweight(kg, date = isoDate(new Date())) {
    const row: BodyWeight = { id: uid(), athleteId: get().settings.athleteId, date, kg };
    set({ bodyweight: [...get().bodyweight, row].sort((a, b) => a.date.localeCompare(b.date)) });
    void db.bodyweight.put(row);
  },
  /** Weigh-ins from Mealcost. Entries you typed here win for the same day, and entries that left Mealcost are removed. */
  applyMealcost(list) {
    const { bodyweight, settings } = get();
    const manual = new Set(bodyweight.filter((b) => b.src !== "mealcost").map((b) => b.date));
    const want = new Map(list.filter((w) => !manual.has(w.date)).map((w) => [w.date, w.kg]));
    const have = new Map(bodyweight.filter((b) => b.src === "mealcost").map((b) => [b.date, b]));
    const puts: BodyWeight[] = [], drops: string[] = [];
    for (const [date, kg] of want) { const cur = have.get(date); if (!cur || cur.kg !== kg) puts.push({ id: `mc:${date}`, athleteId: settings.athleteId, date, kg, src: "mealcost" }); }
    for (const [date, b] of have) if (!want.has(date)) drops.push(b.id);
    if (!puts.length && !drops.length) return 0;
    const next = [...bodyweight.filter((b) => !drops.includes(b.id) && !puts.some((p) => p.id === b.id)), ...puts].sort((a, b) => a.date.localeCompare(b.date));
    set({ bodyweight: next });
    void db.bodyweight.bulkPut(puts); void db.bodyweight.bulkDelete(drops);
    return puts.length + drops.length;
  },
  setExercise(name, patch) {
    const library = { ...get().library, [name]: { ...get().library[name], name, ...patch, guessed: false } as ExerciseDef };
    set({ library });
    void db.kv.put({ key: "library", value: library });
  },

  startRest(sec) {
    const total = sec ?? get().settings.restSec;
    const until = Date.now() + total * 1000;
    set({ rest: { until, total } });
    void primeAlarm().then(() => scheduleRest(until));
  },
  stopRest() { set({ rest: null }); void cancelRest(); },
  say(msg) { set({ toast: msg }); setTimeout(() => get().toast === msg && set({ toast: null }), 2600); },

  async exportAll() {
    const s = get();
    return JSON.stringify({ app: "ledger", version: 1, exported: new Date().toISOString(), settings: s.settings, mesos: s.mesos, sessions: s.sessions, feedback: s.feedback, adjustments: s.adjustments, bodyweight: s.bodyweight, library: s.library }, null, 1);
  },
  async importAll(json) {
    const d = JSON.parse(json);
    if (d.app !== "ledger") throw new Error("This file is not a Ledger backup.");
    await resetRemote();
    await db.delete(); await db.open();
    await db.settings.put({ ...d.settings, key: "main" });
    await db.mesos.bulkPut(d.mesos); await db.sessions.bulkPut(d.sessions); await db.feedback.bulkPut(d.feedback ?? []);
    await db.adjustments.bulkPut(d.adjustments ?? []); await db.bodyweight.bulkPut(d.bodyweight ?? []); await db.kv.put({ key: "library", value: d.library });
    await get().init();
  },
  async resetAll() { await resetRemote(); await db.delete(); await db.open(); set({ sessions: [], mesos: [], feedback: [], adjustments: [], bodyweight: [] }); await get().init(); },
}));

export type { SetLog, Unit };
