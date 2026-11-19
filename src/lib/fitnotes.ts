import type { ExerciseDef, ExLog, Meso, PlanWeek, Session, SetLog, Unit } from "../types";
import { CAT } from "../data/catalog";
import { guessMuscle } from "./muscles";
import { defaultIncrement } from "./math";

/** FitNotes CSV export: Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time[,Comment] */
export interface FnRow { date: string; exercise: string; category: string; weight: number; unit: Unit; reps: number; comment: string }
export interface FnParse { rows: FnRow[]; skipped: { cardio: number; empty: number; bad: number }; total: number }

export const FN_MESO = "FitNotes import";
export const FN_PREFIX = "fn";

/** minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF, BOM */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], f = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0] !== "") out.push(row); row = []; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); out.push(row); }
  return out;
}

const KG_PER_LB = 0.45359237;
const toUnit = (u: string): Unit => (/^lb/i.test(u.trim()) ? "lb" : "kg");

export function parseFitNotes(text: string): FnParse {
  const t = parseCsv(text);
  const head = (t[0] ?? []).map((h) => h.trim().toLowerCase());
  const ix = (n: string) => head.indexOf(n);
  const [d, e, c, w, wu, r, dist, tm, cm] = ["date", "exercise", "category", "weight", "weight unit", "reps", "distance", "time", "comment"].map(ix);
  if (d < 0 || e < 0 || w < 0 || r < 0) throw new Error("This is not a FitNotes export. Expected the columns Date, Exercise, Weight and Reps.");
  const rows: FnRow[] = [];
  const skipped = { cardio: 0, empty: 0, bad: 0 };
  for (const x of t.slice(1)) {
    const date = (x[d] ?? "").trim().slice(0, 10);
    const exercise = (x[e] ?? "").trim().replace(/\s+/g, " ");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !exercise) { skipped.bad++; continue; }
    const weight = parseFloat(x[w] ?? "");
    const reps = parseFloat(x[r] ?? "");
    const timed = (dist >= 0 && parseFloat(x[dist] ?? "") > 0) || (tm >= 0 && (x[tm] ?? "").trim() !== "" && (x[tm] ?? "").trim() !== "0");
    if (!(reps > 0)) { if (timed) skipped.cardio++; else skipped.empty++; continue; }
    rows.push({ date, exercise, category: (x[c] ?? "").trim(), weight: Number.isFinite(weight) ? weight : 0, unit: toUnit(x[wu] ?? "kgs"), reps: Math.round(reps), comment: cm >= 0 ? (x[cm] ?? "").trim() : "" });
  }
  return { rows, skipped, total: Math.max(0, t.length - 1) };
}

const CAT_MUSCLE: Record<string, string> = {
  chest: "Chest", back: "Mid Back", lats: "Mid Back", shoulders: "Shoulders (lateral)", biceps: "Biceps", triceps: "Triceps (long head)",
  quads: "Quads", legs: "Quads", hams: "Hamstrings", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves", forearms: "Wrist Flexors",
  abs: "Abs", core: "Abs", adductors: "Glutes", abductors: "Glutes",
};
export function muscleFor(name: string, category: string): string {
  const c = CAT[name]?.muscle;
  if (c) return c;
  const g = guessMuscle(name);
  if (g !== "Unknown") return g;
  return CAT_MUSCLE[category.toLowerCase()] ?? "Unknown";
}

const dayNum = (iso: string) => Math.floor(Date.parse(iso + "T12:00:00Z") / 864e5);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface FnSummary { sessions: number; sets: number; exercises: number; added: number; from: string; to: string; weeks: number; skipped: FnParse["skipped"] }
export interface FnBuild { meso: Meso; sessions: Session[]; library: Record<string, ExerciseDef>; summary: FnSummary }

/** Group rows into finished sessions, one per training date, inside a flexible meso. Existing library exercises are matched by name, ignoring case. */
export function buildFitNotes(p: FnParse, library: Record<string, ExerciseDef>, opts: { athleteId: string; mesoId: string }): FnBuild {
  if (!p.rows.length) throw new Error("No sets with reps found in this file.");
  const byLower = new Map(Object.keys(library).map((k) => [k.toLowerCase(), k]));
  const dates = [...new Set(p.rows.map((r) => r.date))].sort();
  const d0 = dayNum(dates[0]);
  const monday = d0 - ((d0 + 3) % 7); // 1970-01-01 was a Thursday
  const unitOf = new Map<string, Unit>();
  const cnt: Record<string, Record<string, number>> = {};
  for (const r of p.rows) { const o = (cnt[r.exercise] ??= {}); o[r.unit] = (o[r.unit] ?? 0) + 1; }
  for (const [n, o] of Object.entries(cnt)) unitOf.set(n, (o.lb ?? 0) > (o.kg ?? 0) ? "lb" : "kg");

  const lib: Record<string, ExerciseDef> = {};
  const nameOf = new Map<string, string>();
  const cat = new Map<string, string>();
  for (const r of p.rows) {
    if (nameOf.has(r.exercise)) continue;
    const hit = byLower.get(r.exercise.toLowerCase());
    nameOf.set(r.exercise, hit ?? r.exercise);
    cat.set(r.exercise, r.category);
    if (!hit) { const u = unitOf.get(r.exercise) ?? "kg"; lib[r.exercise] = { name: r.exercise, muscle: muscleFor(r.exercise, r.category), unit: u, increment: CAT[r.exercise]?.inc ?? defaultIncrement(u) }; }
  }

  const sessions: Session[] = [];
  const planWeeks = new Map<number, PlanWeek>();
  const usedNames = new Map<string, number>();
  let sets = 0;
  for (const date of dates) {
    const rows = p.rows.filter((r) => r.date === date);
    const order: string[] = [];
    for (const r of rows) if (!order.includes(r.exercise)) order.push(r.exercise);
    const week = Math.floor((dayNum(date) - monday) / 7) + 1;
    const cats = [...new Set(order.map((n) => cat.get(n) || "Mixed"))].slice(0, 2).join(" & ") || "Session";
    const key = `${week}|${cats}`;
    const k = (usedNames.get(key) ?? 0) + 1; usedNames.set(key, k);
    const name = k > 1 ? `${cats} ${k}` : cats;
    const exercises: ExLog[] = order.map((n, i) => {
      const unit = unitOf.get(n) ?? "kg";
      const comments = rows.filter((r) => r.exercise === n && r.comment).map((r) => r.comment);
      const ss: SetLog[] = rows.filter((r) => r.exercise === n).map((r) => {
        const w = r.unit === unit ? r.weight : unit === "kg" ? r.weight * KG_PER_LB : r.weight / KG_PER_LB;
        return { weight: r2(w), reps: r.reps, myo: [], done: true };
      });
      sets += ss.length;
      return { letter: i < 26 ? String.fromCharCode(65 + i) : String(i + 1), exercise: nameOf.get(n)!, unit, rir: null, sets: ss, note: comments.length ? [...new Set(comments)].join("; ") : null };
    });
    const started = Date.parse(date + "T12:00:00Z");
    sessions.push({ id: `${FN_PREFIX}${date}`, athleteId: opts.athleteId, meso: opts.mesoId, week, name, date, status: "done", exercises, started, finished: started + 3600e3 });
    const pw = planWeeks.get(week) ?? { week, sessions: [] };
    pw.sessions.push({ name, items: exercises.map((x) => ({ letter: x.letter, exercise: x.exercise, sets: x.sets.length, repLo: null, repHi: null, rir: null })) });
    planWeeks.set(week, pw);
  }
  const last = Math.max(...planWeeks.keys());
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= last; w++) weeks.push(planWeeks.get(w) ?? { week: w, sessions: [] });
  const meso: Meso = { id: opts.mesoId, name: FN_MESO, weeks, flexible: true };
  const summary: FnSummary = { sessions: sessions.length, sets, exercises: order0(p), added: Object.keys(lib).length, from: dates[0], to: dates[dates.length - 1], weeks: last, skipped: p.skipped };
  return { meso, sessions, library: lib, summary };
}
const order0 = (p: FnParse) => new Set(p.rows.map((r) => r.exercise.toLowerCase())).size;
