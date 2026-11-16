import type { PlanItem, PlanSession } from "../types";

/** [muscle, share of a set] for an exercise: the primary muscle at 1, then contributors at their fraction. */
export type Weights = (exercise: string) => [string, number][];

/** hard sets per muscle for the sessions of one week, counting contributors fractionally */
export function volumeOf(sessions: PlanSession[], weightsOf: Weights): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) for (const it of s.items) for (const [m, f] of weightsOf(it.exercise)) out[m] = (out[m] ?? 0) + it.sets * f;
  return out;
}

const isFixed = (it: PlanItem) => !!(it.scheme || it.pct != null);

/** Sets for one week of a block when the exercise ramps from `sets` in week 1 to `setsEnd` in the last build week. A deload week is half of the end value. */
export function setsForWeek(it: Pick<PlanItem, "sets" | "setsEnd">, week: number, weeks: number, deload: boolean): number {
  const end = it.setsEnd ?? it.sets;
  if (deload && weeks > 1 && week === weeks) return Math.max(1, Math.ceil(end / 2));
  const build = deload && weeks > 2 ? weeks - 1 : weeks;
  return Math.max(1, Math.round(it.sets + ((end - it.sets) * (week - 1)) / Math.max(1, build - 1)));
}

/** Weekly targets for a muscle that move in a straight line from the first week's value to the last build week's value; a deload week is half. */
export function rampTargets(first: number, last: number, weeks: number, deload: boolean): number[] {
  const build = deload && weeks > 2 ? weeks - 1 : weeks;
  return Array.from({ length: weeks }, (_, i) => {
    const w = i + 1;
    if (deload && weeks > 1 && w === weeks) return Math.round((last / 2) * 2) / 2;
    return Math.round((first + ((last - first) * (w - 1)) / Math.max(1, build - 1)) * 2) / 2;
  });
}

/**
 * Adjusts whole sets per exercise so each muscle with a target lands as close to it as possible, counting contributors by their fraction.
 * It works by one-set steps that reduce the squared miss, with a small pull toward the original numbers so changes stay modest.
 */
export function suggestSets(sessions: PlanSession[], targets: Record<string, number>, weightsOf: Weights, o: { min?: number; max?: number; keep?: number } = {}): PlanSession[] {
  const min = o.min ?? 1, max = o.max ?? 12, keep = o.keep ?? 0.05;
  const out = sessions.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) }));
  const items = out.flatMap((s) => s.items).filter((it) => !isFixed(it));
  const base = new Map(items.map((it) => [it, it.sets]));
  const vol: Record<string, number> = volumeOf(out, weightsOf);
  const cost = () => { let c = 0; for (const [m, t] of Object.entries(targets)) c += ((vol[m] ?? 0) - t) ** 2; for (const it of items) c += keep * (it.sets - base.get(it)!) ** 2; return c; };
  const move = (it: PlanItem, d: number) => { for (const [m, f] of weightsOf(it.exercise)) vol[m] = (vol[m] ?? 0) + d * f; it.sets += d; };
  let best = cost();
  for (let pass = 0; pass < 400; pass++) {
    let improved = false;
    for (const it of items) {
      for (const d of [1, -1]) {
        if (it.sets + d < min || it.sets + d > max) continue;
        move(it, d);
        const c = cost();
        if (c < best - 1e-9) { best = c; improved = true; break; }
        move(it, -d);
      }
    }
    if (!improved) break;
  }
  return out;
}

/** A short list of what changed between two versions of a week, for a preview. */
export function diffSets(before: PlanSession[], after: PlanSession[]): { session: string; exercise: string; from: number; to: number }[] {
  const out: { session: string; exercise: string; from: number; to: number }[] = [];
  after.forEach((s, i) => s.items.forEach((it, j) => { const b = before[i]?.items[j]; if (b && b.sets !== it.sets) out.push({ session: s.name, exercise: it.exercise, from: b.sets, to: it.sets }); }));
  return out;
}
