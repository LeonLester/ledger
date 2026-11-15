import type { Adjustment, ExLog, ExerciseDef, Feedback, Meso, PlanItem, PlanSession, Session } from "../types";
import { defaultIncrement, topSet, workedSets } from "./math";
import { coarse } from "./muscles";

export interface Target { weight: number | null; reps: number | null; note: string }

/** Double progression: hit the top of the rep range at the planned RIR, then add load and restart at the bottom. */
export function suggestTarget(item: PlanItem, last: ExLog | null, def: ExerciseDef | undefined): Target {
  const inc = def?.increment ?? defaultIncrement(def?.unit ?? "kg");
  if (!last) return { weight: null, reps: item.repLo, note: "No history yet" };
  const top = topSet(last);
  if (!top) return { weight: null, reps: item.repLo, note: "No history yet" };
  const hi = item.repHi ?? 12, lo = item.repLo ?? 6;
  const done = workedSets(last);
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
