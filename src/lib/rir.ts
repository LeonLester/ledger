import type { RirType } from "../types";

/** Starting categories. The user renames, retunes and adds to these under More, Training. */
export const DEFAULT_RIR_TYPES: RirType[] = [
  { id: "technique", name: "Technique", start: 6, end: 3 },
  { id: "fatiguing", name: "Fatiguing", start: 4, end: 1 },
  { id: "isolation", name: "Isolation", start: 3, end: 0 },
];

/** RIR for one week of a block: it moves from the type's first-week value to its last-week value over the build weeks, and a deload week sits one above the start. */
export function rirForType(t: RirType, week: number, weeks: number, deload: boolean): number {
  const deloadWeek = deload && weeks > 1 && week === weeks;
  if (deloadWeek) return Math.max(t.start, 3) + 1;
  const build = deload && weeks > 2 ? weeks - 1 : weeks;
  return Math.round(t.start + ((t.end - t.start) * (week - 1)) / Math.max(1, build - 1));
}

export const typeOf = (types: RirType[] | undefined, id: string | undefined) => (id ? (types ?? DEFAULT_RIR_TYPES).find((t) => t.id === id) : undefined);
