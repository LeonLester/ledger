import type { PlanSession } from "../types";
import { relabel } from "./groups";
export { relabel };

/** Expands one template week into a whole block: RIR moves from `rirStart` to `rirEnd`, optional deload week. */
export function expand(base: PlanSession[], weeks: number, rirStart: number, rirEnd: number, deload: boolean): { week: number; sessions: PlanSession[] }[] {
  return Array.from({ length: weeks }, (_, w) => {
    const last = deload && weeks > 1 && w === weeks - 1;
    const build = deload && weeks > 2 ? weeks - 1 : weeks;
    const rir = last ? Math.max(rirStart, 3) + 1 : Math.round(rirStart + ((rirEnd - rirStart) * w) / Math.max(1, build - 1));
    return { week: w + 1, sessions: base.map((s) => ({ name: s.name.trim() || "Session", items: relabel(s.items.filter((it) => it.exercise.trim()).map((it) => ({ ...it, exercise: it.exercise.trim(), sets: last ? Math.max(1, Math.ceil(it.sets / 2)) : it.sets, rir }))) })) };
  });
}

