import type { ExerciseDef, MechSpec } from "../types";
import { summarize } from "./lever";

/** true resistance = a * logged weight + b. From distances: a is the vertical rise of the load over the travel of the limb. From a lever: the average load over the rep. */
export interface Fit { a: number; b: number }

export function distFit(m: MechSpec | undefined): Fit | null {
  return m && m.dx > 0 && m.dxVer > 0 ? { a: m.dxVer / m.dx, b: 0 } : null;
}

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

export const trueRes = (f: Fit, w: number) => f.a * w + f.b;
export const weightFor = (f: Fit, r: number) => (r - f.b) / f.a;
export const r1 = (n: number) => Math.round(n * 10) / 10;
