/** One pose landmark. Image landmarks are 0..1 with y pointing down; world landmarks are metres from the hip centre. */
export interface P3 { x: number; y: number; z: number; v?: number }

/** MediaPipe pose landmark indices, left side. The right side is the next index. */
export const LM = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, foot: 31 } as const;
export type Side = "L" | "R";
export type JointId = "knee" | "hip" | "elbow" | "shoulder" | "ankle";

/** The angle at the middle landmark, between the other two. */
export const JOINTS: { id: JointId; label: string; a: keyof typeof LM; b: keyof typeof LM; c: keyof typeof LM }[] = [
  { id: "knee", label: "Knee", a: "hip", b: "knee", c: "ankle" },
  { id: "hip", label: "Hip", a: "shoulder", b: "hip", c: "knee" },
  { id: "ankle", label: "Ankle", a: "knee", b: "ankle", c: "foot" },
  { id: "elbow", label: "Elbow", a: "shoulder", b: "elbow", c: "wrist" },
  { id: "shoulder", label: "Shoulder", a: "hip", b: "shoulder", c: "elbow" },
];

const idx = (k: keyof typeof LM, side: Side) => LM[k] + (side === "R" ? 1 : 0);

/** Angle in degrees at b between the rays to a and c, in 3D. 180 is a straight limb. Null when a segment has no length. */
export function angle3(a: P3, b: P3, c: P3): number | null {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], w = [c.x - b.x, c.y - b.y, c.z - b.z];
  const nu = Math.hypot(u[0], u[1], u[2]), nw = Math.hypot(w[0], w[1], w[2]);
  if (nu < 1e-6 || nw < 1e-6) return null;
  const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (nu * nw);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** A joint angle from world landmarks, which keep real proportions even when the camera is not exactly side on. */
export function jointAngle(world: P3[], id: JointId, side: Side): number | null {
  const j = JOINTS.find((x) => x.id === id)!;
  const a = world[idx(j.a, side)], b = world[idx(j.b, side)], c = world[idx(j.c, side)];
  return a && b && c ? angle3(a, b, c) : null;
}

/** The side of the body the camera sees best: higher mean visibility over shoulder, hip, knee and ankle. */
export function bestSide(lm: P3[]): Side {
  const vis = (s: Side) => (["shoulder", "hip", "knee", "ankle"] as const).reduce((t, k) => t + (lm[idx(k, s)]?.v ?? 0), 0);
  return vis("R") > vis("L") ? "R" : "L";
}

/** Lean of the torso from vertical in degrees, from the image landmarks (hip to shoulder). 0 is upright. */
export function trunkLean(lm: P3[], side: Side, aspect: number): number | null {
  const s = lm[idx("shoulder", side)], h = lm[idx("hip", side)];
  if (!s || !h) return null;
  const dx = (s.x - h.x) * aspect, dy = h.y - s.y;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

export interface AngleRep { min: number; max: number; range: number; t0: number; t1: number }

/** Reps from a joint angle trace: one swing from a turning point to the next that covers at least `minRange` degrees. */
export function repsFromAngle(series: { t: number; a: number }[], minRange = 25): AngleRep[] {
  if (series.length < 5) return [];
  const turns: { i: number; kind: "lo" | "hi" }[] = [];
  let dir: 0 | 1 | -1 = 0, hi = 0, lo = 0;
  const h = minRange * 0.5;
  for (let i = 0; i < series.length; i++) {
    if (series[i].a >= series[hi].a) hi = i;
    if (series[i].a <= series[lo].a) lo = i;
    if (dir !== -1 && series[hi].a - series[i].a > h) { turns.push({ i: hi, kind: "hi" }); dir = -1; lo = i; }
    else if (dir !== 1 && series[i].a - series[lo].a > h) { turns.push({ i: lo, kind: "lo" }); dir = 1; hi = i; }
  }
  if (dir === 1) turns.push({ i: hi, kind: "hi" }); else if (dir === -1) turns.push({ i: lo, kind: "lo" });
  const reps: AngleRep[] = [];
  for (let k = 0; k < turns.length - 1; k++) {
    const a = series[turns[k].i], b = series[turns[k + 1].i];
    const range = Math.abs(b.a - a.a);
    if (range < minRange) continue;
    reps.push({ min: Math.min(a.a, b.a), max: Math.max(a.a, b.a), range, t0: a.t, t1: b.t });
  }
  return reps;
}
