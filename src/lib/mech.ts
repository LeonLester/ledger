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
