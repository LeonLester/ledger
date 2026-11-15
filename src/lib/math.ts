import type { ExLog, SetLog, Unit } from "../types";
import { DEFAULT_WARM, effReps, est1rm, formulas } from "./formulas";

export const round = (n: number, step = 0.5) => Math.round(n / step) * step;
export const fmtW = (n: number | null | undefined) => (n == null ? "" : Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const unitLabel = (u: Unit | null | undefined) => (u === "lb" ? "lb" : u === "pin" ? "pin" : "kg");
export const defaultIncrement = (u: Unit) => (u === "lb" ? 5 : u === "pin" ? 0.5 : 2.5);

export const worked = (s: SetLog) => s.reps != null && s.reps > 0;
export const workedSets = (e: ExLog) => e.sets.filter(worked);

/** estimated 1RM in kg for a logged exercise; pin loads have no absolute weight */
export function bestE1rm(e: ExLog): number | null {
  if (e.unit === "pin") return null;
  let best: number | null = null;
  for (const s of e.sets) {
    if (s.weight == null || !worked(s)) continue;
    const w = e.unit === "lb" ? s.weight * 0.45359 : s.weight;
    const v = est1rm(w, effReps(s));
    if (best == null || v > best) best = v;
  }
  return best;
}
export function topSet(e: ExLog): SetLog | null {
  let top: SetLog | null = null;
  for (const s of e.sets) {
    if (s.weight == null || !worked(s)) continue;
    if (!top || s.weight > top.weight! || (s.weight === top.weight && s.reps! > top.reps!)) top = s;
  }
  return top;
}

export const PLATE_COLORS: Record<number, string> = { 25: "#e5483c", 20: "#3d7bff", 15: "#f2c230", 10: "#35b36b", 5: "#e9e7e0", 2.5: "#4a4f57", 1.25: "#9aa0a8", 0.5: "#cfd2d6" };
export function plateLoad(target: number, bar: number, plates: number[]) {
  let side = (target - bar) / 2;
  const out: number[] = [];
  if (side <= 0) return { out, rest: 0 };
  for (const p of [...plates].sort((a, b) => b - a)) { while (side + 1e-6 >= p) { out.push(p); side -= p; } }
  return { out, rest: +side.toFixed(2) };
}
export function warmups(work: number, inc: number) {
  if (!work || work < 20) return [];
  const steps: [number, number][] = formulas().warm?.length ? formulas().warm! : DEFAULT_WARM;
  return steps.map(([p, r]) => ({ weight: Math.max(inc, Math.round((work * p) / inc) * inc), reps: r }));
}
export function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
