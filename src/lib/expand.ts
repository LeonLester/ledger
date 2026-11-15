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


export interface Row { day: string; session: string; emphasis: string }
const REST = "Rest";

/** Like expand, but the weekday layout drives the week: a session placed on several days becomes "Name 1", "Name 2" with the same
 *  exercises, and an optional second layout is used on even weeks (a two week rotation such as A/B days one after another). */
export function expandLayouts(base: PlanSession[], weeks: number, rirStart: number, rirEnd: number, deload: boolean, a: Row[], b: Row[] | null):
  { weeks: { week: number; sessions: PlanSession[]; split?: Row[] }[]; split: Row[] } {
  const flat = expand(base, weeks, rirStart, rirEnd, deload);
  const rotating = !!b;
  const build = (layout: Row[], w: (typeof flat)[number]) => {
    const rows = layout.filter((r) => r.session !== REST && w.sessions.some((s) => s.name === r.session.trim()));
    const total: Record<string, number> = {}; for (const r of rows) total[r.session.trim()] = (total[r.session.trim()] ?? 0) + 1;
    const seen: Record<string, number> = {};
    const named = new Map<Row, string>(); const sessions: PlanSession[] = [];
    for (const r of rows) {
      const n = r.session.trim(); const idx = (seen[n] = (seen[n] ?? 0) + 1);
      const name = total[n] > 1 ? `${n} ${idx}` : n;
      named.set(r, name);
      sessions.push({ name, items: w.sessions.find((s) => s.name === n)!.items.map((it) => ({ ...it })) });
    }
    const split = layout.map((r) => (named.has(r) ? { ...r, session: named.get(r)! } : { ...r, session: REST }));
    const repeats = Object.values(total).some((c) => c > 1);
    return { sessions, split, repeats };
  };
  const out = flat.map((w) => {
    const L = build(rotating && w.week % 2 === 0 ? b! : a, w);
    return { week: w.week, sessions: L.sessions, ...(rotating || L.repeats ? { split: L.split } : {}) };
  });
  const first = build(a, flat[0]);
  return { weeks: out, split: first.split };
}
