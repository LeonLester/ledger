import type { ExLog, ExerciseDef, MechSpec } from "../types";
import { summarize } from "./lever";

/** true resistance = a * (logged weight + extra) + b. a is the load's rise over the limb's travel, or the plate arm over the handle arm. */
export interface Fit { a: number; b: number }

export function distFit(m: MechSpec | undefined): Fit | null {
  return m && m.dx > 0 && m.dxVer > 0 ? { a: m.dxVer / m.dx, b: 0 } : null;
}

/** mechanical advantage only: from the two distances or lever arms, or an older saved lever with angles */
export function fitOf(def: Pick<ExerciseDef, "ma" | "lever"> | undefined): Fit | null {
  if (!def) return null;
  const d = distFit(def.ma);
  if (d) return d;
  if (def.lever) {
    const hi = summarize(def.lever, 100).mean, lo = summarize(def.lever, 0).mean;
    if (hi == null || lo == null) return null;
    const a = (hi - lo) / 100;
    return a > 0 ? { a, b: lo } : null;
  }
  return null;
}

/** what sits on the load besides the logged weight, in the exercise's unit: the implement itself and the share of bodyweight */
export const extraLoad = (e: { base?: number; bwf?: number; bw?: number | null; unit?: string | null }) =>
  ((e.base ?? 0) + (e.bwf ?? 0) * (e.bw ?? 0)) / (e.unit === "lb" ? 0.45359 : 1);

/** the fit used for the true resistance column: mechanical advantage if set, otherwise 1:1 when bodyweight or a tare weight counts */
export const resFit = (def: Pick<ExerciseDef, "ma" | "lever"> | undefined, extra: number): Fit | null => fitOf(def) ?? (extra !== 0 ? { a: 1, b: 0 } : null);

export const trueRes = (f: Fit, w: number, extra = 0) => f.a * (w + extra) + f.b;
export const weightFor = (f: Fit, r: number, extra = 0) => (r - f.b) / f.a - extra;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export type { ExLog };

/** the weights you can lift for 1 to `max` reps, from one tested set. `extra` is the tare and bodyweight share in the exercise's unit.
 *  Each row says how far its rep count is from the tested one, because the estimate gets looser the further it is extrapolated. */
export interface RepRow { reps: number; weight: number; res: number; pct: number; gap: number; trust: "high" | "mid" | "low" }
export function repTable(
  tested: { weight: number; reps: number }, opts: { fit: Fit | null; extra: number; inc: number; max?: number; e1: (res: number, reps: number) => number; at: (e1: number, reps: number) => number },
): { e1: number; rows: RepRow[] } {
  const fit = opts.fit ?? { a: 1, b: 0 };
  const res = trueRes(fit, tested.weight, opts.extra);
  const e1 = opts.e1(res, tested.reps);
  const rows: RepRow[] = [];
  for (let n = 1; n <= (opts.max ?? 15); n++) {
    const r = opts.at(e1, n);
    const raw = weightFor(fit, r, opts.extra);
    const gap = Math.abs(n - tested.reps);
    rows.push({ reps: n, weight: Math.round(raw / opts.inc) * opts.inc, res: r, pct: e1 > 0 ? (r / e1) * 100 : 0, gap, trust: gap <= 2 ? "high" : gap <= 5 ? "mid" : "low" });
  }
  return { e1, rows };
}
