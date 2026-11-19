import type { ExLog, Session } from "../types";
import { setCredit, workedSets, type MyoCfg } from "./math";

const SPLIT = ["Upper 2", "Upper A (Mon)", "Upper 1 (Mon)", "Legs 1", "Lower 1", "Upper 3", "Legs 2", "Lower 2", "Upper 1", "Upper A", "Misc"];
export const mesoNum = (id: string) => Number(id.replace(/\D/g, "")) || 0;
export const orderKey = (s: Pick<Session, "meso" | "week" | "name" | "started"> & { date?: string | null }) => {
  const i = SPLIT.indexOf(s.name);
  // the date only breaks ties between sessions of one week, so it stays below 1
  const d = s.date ? ((Date.parse(s.date + "T12:00:00Z") / 864e5) % 1e5) / 1e5 : 0;
  return mesoNum(s.meso) * 1e9 + s.week * 1e6 + (s.started ? 5e5 : 0) + (i < 0 ? 9 : i) + (Number.isFinite(d) ? d : 0);
};
export const sortSessions = (xs: Session[]) => [...xs].sort((a, b) => orderKey(a) - orderKey(b));

/** the most recent earlier log of an exercise with real working sets */
export function lastLog(exercise: string, sessions: Session[], before?: Session): ExLog | null {
  const pool = sortSessions(sessions.filter((s) => s.status === "done" || s.id !== before?.id)).filter((s) => !before || orderKey(s) < orderKey(before));
  for (let i = pool.length - 1; i >= 0; i--) {
    const e = pool[i].exercises.find((x) => x.exercise === exercise && workedSets(x).length > 0);
    if (e) return e;
  }
  return null;
}
/** every earlier worked log of an exercise, newest first */
export function exHistory(exercise: string, sessions: Session[], before?: Session): ExLog[] {
  const pool = sortSessions(sessions.filter((s) => s.status === "done" || s.id !== before?.id)).filter((s) => !before || orderKey(s) < orderKey(before));
  const out: ExLog[] = [];
  for (let i = pool.length - 1; i >= 0; i--) { const e = pool[i].exercises.find((x) => x.exercise === exercise && workedSets(x).length > 0); if (e) out.push(e); }
  return out;
}
export function repsText(s: { reps: number | null; myo: number[] }) {
  if (s.reps == null) return "";
  return String(s.reps) + s.myo.filter((m) => m > 0).map((m) => "+" + m).join("");
}
export function parseReps(t: string): { reps: number | null; myo: number[] } | null {
  const v = t.trim();
  if (v === "") return { reps: null, myo: [] };
  if (!/^\d+(\+\d+)*$/.test(v)) return null;
  const [a, ...r] = v.split("+").map(Number);
  return { reps: a, myo: r };
}
/** hard sets per muscle for a week. A contributor earns its share of each set, so a bench set also counts a third toward triceps. */
export function setsPerMuscle(sessions: Session[], meso: string, week: number, weightsOf: (e: string) => [string, number][], myo?: MyoCfg) {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.meso !== meso || s.week !== week) continue;
    for (const e of s.exercises) { const n = workedSets(e).reduce((a, x) => a + setCredit(x, myo), 0); if (n) for (const [m, f] of weightsOf(e.exercise)) out[m] = (out[m] ?? 0) + n * f; }
  }
  return out;
}
export const fmtSets = (n: number) => { const r = Math.round(n * 2) / 2; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
export function sessionDate(s: Session, mesoStart: string | null, split: { day: string; session: string }[]): string | null {
  if (s.date) return s.date;
  if (!mesoStart) return null;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const name = s.name === "Lower 1" ? "Legs 1" : s.name === "Lower 2" ? "Legs 2" : s.name;
  const row = split.find((x) => x.session === name);
  const start = new Date(mesoStart + "T12:00:00");
  const base = new Date(start); base.setDate(base.getDate() + (s.week - 1) * 7);
  const want = row ? days.indexOf(row.day) : base.getDay();
  const diff = (want - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  return base.toISOString().slice(0, 10);
}

/** Short label for a mesocycle chip: "PPL, block 3" becomes "Block 3". */
export const mesoLabel = (name: string) => { const t = name.includes(", ") ? name.slice(name.lastIndexOf(", ") + 2) : name; return t.charAt(0).toUpperCase() + t.slice(1); };
