import type { LeverSpec } from "../types";

export const LEVER_DEFAULT: LeverSpec = { loadArm: 100, userArm: 60, start: 10, end: 40, offset: 0, armMass: 0, armCom: 0, path: "arc", pull: 90 };

/** Starting points only. Measure your own machine and replace them. */
export const LEVER_PRESETS: { id: string; name: string; note: string; spec: LeverSpec }[] = [
  { id: "landmine", name: "Chest-supported landmine row", note: "Bar hinged at the floor, plates near the far end, handle partway along. Angles are the bar above horizontal.", spec: { ...LEVER_DEFAULT, loadArm: 180, userArm: 110, start: 12, end: 35 } },
  { id: "pendulum", name: "Pendulum squat", note: "Arm hangs from a high pivot and swings. Near vertical when standing, closer to level at the bottom, so the load grows toward the bottom.", spec: { ...LEVER_DEFAULT, loadArm: 90, userArm: 60, start: 35, end: 70 } },
  { id: "lever", name: "Plate-loaded lever (plates on the arm)", note: "Row, press or pulldown with plates on the same arm as the handle.", spec: { ...LEVER_DEFAULT, loadArm: 70, userArm: 55, start: 15, end: 45 } },
];

const rad = (d: number) => (d * Math.PI) / 180;

/** gravity torque about the pivot in kg-cm for the given angle of the user arm above horizontal */
export function torque(l: LeverSpec, load: number, deg: number) {
  return (load * l.loadArm + l.armMass * l.armCom) * Math.cos(rad(deg + l.offset));
}

/** unsigned-corrected force at the handle, or null when a fixed pull direction runs along the arm and the number blows up */
function raw(l: LeverSpec, load: number, deg: number): number | null {
  const t = torque(l, load, deg);
  if (l.path === "arc") return t / l.userArm;
  const s = Math.sin(rad(l.pull - deg));
  if (Math.abs(s) < 0.05) return null;
  return t / (l.userArm * Math.abs(s));
}

export interface Pt { deg: number; kg: number | null }
/** resistance at the handle for each angle from the bottom to the top of the rep. Positive resists the lift, negative assists it. */
export function curve(l: LeverSpec, load: number, n = 25): Pt[] {
  const first = raw(l, load, l.start) ?? raw(l, load, l.end) ?? 1;
  const sign = first < 0 ? -1 : 1;
  return Array.from({ length: n }, (_, i) => {
    const deg = l.start + ((l.end - l.start) * i) / (n - 1);
    const v = raw(l, load, deg);
    return { deg: +deg.toFixed(2), kg: v == null ? null : sign * v };
  });
}

export interface Summary {
  bottom: number | null; top: number | null; mean: number | null;
  peak: Pt | null; low: Pt | null; change: number | null;
  /** resistance per kg of plates */ maBottom: number | null; maTop: number | null; maMean: number | null;
  assists: boolean; blind: boolean;
}
export function summarize(l: LeverSpec, load: number): Summary {
  const c = curve(l, load);
  const ok = c.filter((p): p is { deg: number; kg: number } => p.kg != null);
  const at = (deg: number) => { const v = c.find((p) => p.deg === +deg.toFixed(2)); return v?.kg ?? null; };
  const bottom = at(l.start), top = at(l.end);
  const mean = ok.length ? ok.reduce((a, p) => a + p.kg, 0) / ok.length : null;
  const peak = ok.length ? ok.reduce((m, p) => (p.kg > m.kg ? p : m)) : null;
  const low = ok.length ? ok.reduce((m, p) => (p.kg < m.kg ? p : m)) : null;
  const per = (v: number | null) => (v != null && load > 0 ? v / load : null);
  return {
    bottom, top, mean, peak, low,
    change: bottom != null && top != null && Math.abs(bottom) > 1e-6 ? ((top - bottom) / Math.abs(bottom)) * 100 : null,
    maBottom: per(bottom), maTop: per(top), maMean: per(mean),
    assists: ok.some((p) => p.kg < 0), blind: ok.length < c.length,
  };
}
/** plate load that gives a chosen resistance, given the resistance per kg of plates at that point */
export const loadFor = (target: number, perKg: number | null) => (perKg && perKg > 0 ? target / perKg : null);
