import type { Adjustment, ExLog, ProgKind, ExerciseDef, Feedback, Meso, PlanItem, PlanSession, Session } from "../types";
import { defaultIncrement, topSet, workedSets } from "./math";
import { coarse } from "./muscles";

export interface Target {
  weight: number | null; reps: number | null; note: string;
  /** sets to do, when the scheme changes the count */ sets?: number;
  /** a weight and reps for each set, when the sets progress on their own */ perSet?: { weight: number | null; reps: number | null }[];
  /** the last set is taken to failure */ amrapLast?: boolean;
}

export const PROG_INFO: Record<ProgKind, { label: string; text: string }> = {
  double: { label: "Double progression", text: "Add reps until every set hits the top of the range, then add load and start at the bottom." },
  dynamic: { label: "Dynamic double progression", text: "Each set progresses on its own: a set that hits the top of the range gets heavier next time, the others add a rep." },
  triple: { label: "Triple progression", text: "Add reps, then add sets up to a limit, then add load and go back to the base sets." },
  linear: { label: "Linear progression", text: "Add load every session in which all sets reach the target reps. Repeat the weight after a miss." },
  step: { label: "Step loading", text: "Stay on one load for several sessions, building reps, then step up by a larger jump." },
  amrap: { label: "Last set AMRAP", text: "Fixed reps on every set but the last, which is taken to failure. Hitting the top of the range on it adds load." },
  pct: { label: "Fixed percentage", text: "Load is a set percentage of a reference 1RM, taken from the log or entered." },
};

const e1 = (w: number, r: number) => w * (1 + r / 30);
const snap = (n: number, inc: number) => Math.round(n / inc) * inc;

/** Next target for an exercise from its last log and history, following the progression scheme chosen in the library. Double progression by default. */
export function suggestTarget(item: PlanItem, last: ExLog | null, def: ExerciseDef | undefined, hist?: ExLog[]): Target {
  const inc = def?.increment ?? defaultIncrement(def?.unit ?? "kg");
  const p = def?.prog;
  const hi = item.repHi ?? 12, lo = item.repLo ?? 6;
  const history = hist ?? (last ? [last] : []);
  if (p?.kind === "pct") {
    const pct = p.pct ?? 75;
    let ref = p.ref ?? null;
    if (ref == null) for (const h of history) for (const s of workedSets(h)) if (s.weight != null && s.reps != null && s.reps <= 12) ref = Math.max(ref ?? 0, e1(s.weight, s.reps));
    if (ref == null) return { weight: null, reps: lo, note: "Enter a reference 1RM in the exercise settings, or log a set first" };
    return { weight: Math.max(0, snap((pct / 100) * ref, inc)), reps: lo, note: `${pct}% of ${Math.round(ref * 10) / 10}` };
  }
  const amrapNew = p?.kind === "amrap" ? { amrapLast: true } : {};
  if (!last) return { weight: null, reps: lo, note: "No history yet", ...amrapNew };
  const top = topSet(last);
  if (!top || top.weight == null) return { weight: null, reps: lo, note: "No history yet", ...amrapNew };
  const done = workedSets(last).filter((s) => s.weight != null);
  const w = top.weight;

  if (p?.kind === "linear") {
    const target = item.repHi ?? item.repLo ?? 5;
    if (done.every((s) => (s.reps ?? 0) >= target)) return { weight: +(w + inc).toFixed(2), reps: target, note: "All reps hit. Add load." };
    return { weight: w, reps: target, note: "Missed reps. Repeat the weight." };
  }
  if (p?.kind === "step") {
    const hold = p.hold ?? 3, step = p.step ?? inc * 2;
    let n = 0;
    for (const h of history) { const t = topSet(h); if (t?.weight === w) n++; else break; }
    if (n >= hold && done.every((s) => (s.reps ?? 0) >= lo)) return { weight: +(w + step).toFixed(2), reps: lo, note: `Held ${n} sessions. Step up.` };
    return { weight: w, reps: Math.min(hi, (top.reps ?? lo) + 1), note: `Hold the weight, session ${Math.min(n + 1, hold)} of ${hold}.` };
  }
  if (p?.kind === "dynamic" && done.length) {
    const count = Math.max(1, item.sets);
    const perSet = Array.from({ length: count }, (_, j) => {
      const s = done[Math.min(j, done.length - 1)];
      return (s.reps ?? 0) >= hi ? { weight: +(s.weight! + inc).toFixed(2), reps: lo } : { weight: s.weight, reps: Math.min(hi, (s.reps ?? lo) + 1) };
    });
    return { weight: perSet[0].weight, reps: perSet[0].reps, perSet, note: "Each set moves on its own." };
  }
  if (p?.kind === "triple") {
    const n = done.length, base = Math.max(1, item.sets), maxS = Math.max(base, p.maxSets ?? base + 2);
    const allTop = done.length > 0 && done.every((s) => s.weight === w && (s.reps ?? 0) >= hi);
    if (allTop && n < maxS) return { weight: w, reps: lo, sets: n + 1, note: `Top reps hit. Add a set (${n + 1} of ${maxS}).` };
    if (allTop) return { weight: +(w + inc).toFixed(2), reps: lo, sets: base, note: "Most sets and top reps hit. Add load and drop to the base sets." };
    return { weight: w, reps: Math.min(hi, (top.reps ?? lo) + 1), sets: Math.max(n, base), note: "Beat last time by a rep." };
  }
  if (p?.kind === "amrap") {
    const finalSet = done[done.length - 1];
    const aHi = item.repHi ?? lo + 3;
    if ((finalSet.reps ?? 0) >= aHi) return { weight: +(w + inc).toFixed(2), reps: lo, note: `AMRAP set reached ${finalSet.reps}. Add load.`, ...amrapNew };
    return { weight: w, reps: lo, note: `AMRAP set reached ${finalSet.reps ?? 0}. Beat ${aHi - 1} to add load.`, ...amrapNew };
  }

  // double progression
  const allAtTop = done.length > 0 && done.every((s) => s.weight === top.weight && (s.reps ?? 0) >= hi);
  if (top.reps! >= hi && allAtTop) return { weight: +(top.weight! + inc).toFixed(2), reps: lo, note: "Top of range hit. Add load." };
  if (top.reps! >= hi) return { weight: top.weight, reps: hi, note: "Match every set at the top first." };
  return { weight: top.weight, reps: Math.min(hi, top.reps! + 1), note: "Beat last time by a rep." };
}

/** Soreness: 0 never sore, 1 healed early, 2 healed just in time, 3 still sore. Pump and workload: 0 low .. 2 high. */
export function feedbackDelta(pump: number, soreness: number, workload: number): number {
  let d = [2, 1, 0, -1][soreness];
  if (pump === 0 && soreness <= 1) d += 1;
  if (pump === 2 && soreness === 3) d -= 1;
  if (workload === 2) d = Math.min(d, 0);
  if (workload === 2 && soreness === 3) d = -2;
  return Math.max(-2, Math.min(3, d));
}

export const sorenessLabels = ["Never sore", "Healed early", "Healed just in time", "Still sore"];
export const pumpLabels = ["Low", "Good", "Great"];
export const workloadLabels = ["Easy", "Right", "Too much"];

/** Apply set adjustments from feedback to the planned week. Adds to later exercises of the muscle first, trims from the last. */
export function effectiveSessions(meso: Meso, week: number, adjustments: Adjustment[], muscleOf: (ex: string) => string): PlanSession[] {
  const w = meso.weeks.find((x) => x.week === week);
  if (!w) return [];
  const sessions: PlanSession[] = w.sessions.map((s) => ({ name: s.name, items: s.items.map((i) => ({ ...i })) }));
  const byMuscle: Record<string, number> = {};
  for (const a of adjustments) if (a.meso === meso.id && a.week === week) byMuscle[a.muscle] = (byMuscle[a.muscle] ?? 0) + a.delta;
  for (const [muscle, delta] of Object.entries(byMuscle)) {
    const items = sessions.flatMap((s) => s.items).filter((i) => muscleOf(i.exercise) === muscle);
    if (!items.length) continue;
    let left = Math.abs(delta), idx = items.length - 1, guard = 0;
    while (left > 0 && guard++ < 60) {
      const it = items[idx % items.length];
      if (delta > 0) { it.sets += 1; left--; } else if (it.sets > 1) { it.sets -= 1; left--; }
      idx = idx - 1 < 0 ? items.length - 1 : idx - 1;
    }
  }
  return sessions;
}

export function weekTarget(muscle: string, week: number, targets: Record<string, (number | null)[]>): number | null {
  const row = targets[muscle];
  if (!row) return null;
  const v = row[Math.min(week, 6) - 1];
  return v ?? null;
}
export function mrvFor(muscle: string, landmarks: Record<string, { mrv: number | null }>) {
  return landmarks[coarse(muscle)]?.mrv ?? null;
}
export function pendingFeedbackFor(fb: Feedback[], muscles: string[]) {
  return fb.filter((f) => f.soreness == null && f.state === "pending" && muscles.includes(f.muscle));
}
export type { Session };
