import type { BodyWeight, ExLog, Session } from "../types";
import { fmtW, worked } from "./math";
import { effReps, est1rm, weightForReps } from "./formulas";
import { orderKey, sessionDate } from "./selectors";

const LB = 0.45359;
export type PrKind = "weight" | "rep" | "e1rm" | "bwband" | "relative";
export interface Pr { kind: PrKind; exercise: string; ex: number; set: number; text: string; e1?: number; prev?: number }
export const PR_LABEL: Record<PrKind, string> = { weight: "Weight PR", rep: "Rep PR", e1rm: "e1RM PR", bwband: "At this bodyweight", relative: "Relative PR" };

interface Row { w: number; ow: number; reps: number; e1: number | null; bw: number | null }
const kgOf = (e: ExLog, w: number) => (e.unit === "lb" ? w * LB : w);

export function bwAt(bodyweight: BodyWeight[], date: string | null): number | null {
  if (!date || !bodyweight.length) return null;
  let v: number | null = null;
  for (const b of [...bodyweight].sort((a, c) => a.date.localeCompare(c.date))) { if (b.date <= date) v = b.kg; else break; }
  return v;
}
function rowsOf(e: ExLog, bw: number | null, onlyDone: boolean): { r: Row; i: number }[] {
  const out: { r: Row; i: number }[] = [];
  e.sets.forEach((s, i) => {
    if (!worked(s) || s.weight == null || (onlyDone && !s.done)) return;
    const w = kgOf(e, s.weight);
    out.push({ i, r: { w, ow: s.weight, reps: s.reps!, e1: e.unit === "pin" || s.reps! > 12 ? null : est1rm(w, effReps(s)), bw } });
  });
  return out;
}

/** Compare a session with everything logged before it. Pass onlyDone for a live view of ticked sets. */
export function sessionPrs(
  sess: Session, sessions: Session[], bodyweight: BodyWeight[],
  ctx: { mesoStart: string | null; split: { day: string; session: string }[] }, onlyDone = false,
): Pr[] {
  const k = orderKey(sess);
  const prior = sessions.filter((s) => s.status === "done" && s.id !== sess.id && orderKey(s) < k);
  const bwNow = bwAt(bodyweight, sessionDate(sess, ctx.mesoStart, ctx.split));
  const out: Pr[] = [];
  sess.exercises.forEach((e, ei) => {
    const hist: Row[] = [];
    for (const p of prior) {
      const bw = bwAt(bodyweight, sessionDate(p, ctx.mesoStart, ctx.split));
      for (const x of p.exercises) if (x.exercise === e.exercise) hist.push(...rowsOf(x, bw, false).map((q) => q.r));
    }
    if (!hist.length) return;
    const unit = e.unit === "lb" ? "lb" : e.unit === "pin" ? "pin" : "kg";
    const maxW = Math.max(...hist.map((h) => h.w));
    const maxE = Math.max(0, ...hist.map((h) => h.e1 ?? 0));
    const bandBest = bwNow == null ? 0 : Math.max(0, ...hist.filter((h) => h.bw != null && Math.abs(h.bw - bwNow) <= 1.5).map((h) => h.e1 ?? 0));
    const relBest = Math.max(0, ...hist.filter((h) => h.bw && h.e1).map((h) => h.e1! / h.bw!));
    const best: Partial<Record<PrKind, Pr & { score: number }>> = {};
    const put = (kind: PrKind, score: number, pr: Omit<Pr, "kind" | "exercise" | "ex">) => {
      if (!best[kind] || score > best[kind]!.score) best[kind] = { ...pr, kind, exercise: e.exercise, ex: ei, score };
    };
    for (const { r, i } of rowsOf(e, bwNow, onlyDone)) {
      if (r.w > maxW + 0.01) put("weight", r.w, { set: i, text: `Heaviest yet: ${fmtW(r.ow)} ${unit} x ${r.reps} (was ${fmtW(maxW / (unit === "lb" ? LB : 1))})` });
      else {
        const same = hist.filter((h) => h.w >= r.w - 0.01);
        const bestReps = same.length ? Math.max(...same.map((h) => h.reps)) : 0;
        if (same.length && r.reps > bestReps) put("rep", r.reps, { set: i, text: `${r.reps} reps at ${fmtW(r.ow)} ${unit}, previous best ${bestReps}` });
      }
      if (r.e1 && maxE > 0 && r.e1 > maxE + 0.4) put("e1rm", r.e1, { set: i, e1: r.e1, prev: maxE, text: `Predicts a ${r.e1.toFixed(1)} kg 1RM, up ${(r.e1 - maxE).toFixed(1)}` });
      if (r.e1 && bwNow != null && bandBest > 0 && r.e1 > bandBest + 0.4) put("bwband", r.e1, { set: i, e1: r.e1, prev: bandBest, text: `Best e1RM at about ${fmtW(Math.round(bwNow * 2) / 2)} kg bodyweight: ${r.e1.toFixed(1)} kg` });
      if (r.e1 && bwNow != null && relBest > 0 && r.e1 / bwNow > relBest + 0.01) put("relative", r.e1 / bwNow, { set: i, e1: r.e1, text: `${(r.e1 / bwNow).toFixed(2)} x bodyweight, was ${relBest.toFixed(2)}` });
    }
    for (const v of Object.values(best)) { const { score: _s, ...pr } = v!; out.push(pr); }
  });
  return out;
}

/** weight for n reps at an estimated 1RM, from the selected formula */
export const repMax = weightForReps;
/** relative intensity of a set against the best e1RM known at that time, as a fraction */
export const intensity = (w: number, e1: number) => (e1 > 0 ? w / e1 : 0);
