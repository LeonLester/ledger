import type { RepMetric } from "../types";

/** Grayscale frame, row major. */
export interface Gray { w: number; h: number; d: Uint8Array }

export const toGray = (rgba: Uint8ClampedArray, w: number, h: number): Gray => {
  const d = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return { w, h, d };
};

/**
 * Template tracker. The user marks the centre of the plate; the patch around it is matched in each next frame by
 * sum of absolute differences inside a search window, refined to a sub-pixel position. The template blends in the
 * latest match slowly so it follows lighting and rotation without drifting onto the background.
 */
export class Tracker {
  x: number; y: number; private t: Float32Array; private half: number; private R: number;
  constructor(f: Gray, cx: number, cy: number, radiusPx: number) {
    this.half = Math.max(6, Math.min(26, Math.round(radiusPx * 0.8)));
    this.R = Math.max(10, Math.round(radiusPx * 0.9));
    this.x = cx; this.y = cy;
    this.t = this.patch(f, Math.round(cx), Math.round(cy));
  }
  private patch(f: Gray, cx: number, cy: number) {
    const n = this.half * 2 + 1, p = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) p[j * n + i] = f.d[this.clampY(f, cy - this.half + j) * f.w + this.clampX(f, cx - this.half + i)];
    return p;
  }
  private clampX = (f: Gray, x: number) => (x < 0 ? 0 : x >= f.w ? f.w - 1 : x);
  private clampY = (f: Gray, y: number) => (y < 0 ? 0 : y >= f.h ? f.h - 1 : y);
  private sad(f: Gray, cx: number, cy: number, stop: number) {
    const n = this.half * 2 + 1; let s = 0;
    for (let j = 0; j < n; j++) {
      const row = this.clampY(f, cy - this.half + j) * f.w;
      for (let i = 0; i < n; i++) { s += Math.abs(f.d[row + this.clampX(f, cx - this.half + i)] - this.t[j * n + i]); }
      if (s > stop) return s;
    }
    return s;
  }
  /** returns the new position and a 0..1 match quality */
  step(f: Gray) {
    const cx0 = Math.round(this.x), cy0 = Math.round(this.y), R = this.R;
    let best = Infinity, bx = cx0, by = cy0;
    const grid = new Map<number, number>();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const s = this.sad(f, cx0 + dx, cy0 + dy, best);
      grid.set((dy + R) * (2 * R + 1) + dx + R, s);
      if (s < best) { best = s; bx = cx0 + dx; by = cy0 + dy; }
    }
    const at = (dx: number, dy: number) => grid.get((dy + R) * (2 * R + 1) + dx + R);
    const px = bx - cx0, py = by - cy0;
    let sx = bx, sy = by;
    const l = at(px - 1, py), c = at(px, py)!, r = at(px + 1, py), u = at(px, py - 1), dn = at(px, py + 1);
    if (l != null && r != null && l !== Infinity && r !== Infinity) { const den = l - 2 * c + r; if (den > 0) sx += Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den))); }
    if (u != null && dn != null && u !== Infinity && dn !== Infinity) { const den = u - 2 * c + dn; if (den > 0) sy += Math.max(-0.5, Math.min(0.5, (u - dn) / (2 * den))); }
    const n = (this.half * 2 + 1) ** 2;
    const quality = Math.max(0, 1 - best / n / 60);
    this.x = sx; this.y = sy;
    if (quality > 0.55) {
      const np = this.patch(f, Math.round(sx), Math.round(sy));
      for (let i = 0; i < this.t.length; i++) this.t[i] = this.t[i] * 0.9 + np[i] * 0.1;
    }
    return { x: sx, y: sy, quality };
  }
}

export interface Pt { t: number; x: number; y: number }
const smooth = (a: number[], k = 2) => a.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) { s += a[j]; n++; } return s / n; });

export interface Analysis {
  pts: [number, number][]; reps: RepMetric[]; velLoss: number | null; meanDev: number; scale: number;
  series: { t: number; y: number; v: number }[];
}
/**
 * Turn tracked pixel positions into metres. mPerPx comes from the plate: a standard plate is 0.45 m across.
 * Image y points down, so height is the negated y. A rep is one valley (bottom) to the next peak (lockout).
 */
export function analyze(track: Pt[], mPerPx: number, minRom = 0.15): Analysis {
  if (track.length < 5) return { pts: [], reps: [], velLoss: null, meanDev: 0, scale: mPerPx, series: [] };
  const t = track.map((p) => p.t);
  const xs = smooth(track.map((p) => (p.x - track[0].x) * mPerPx));
  const ys = smooth(track.map((p) => -(p.y - track[0].y) * mPerPx));
  const vy = ys.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(ys.length - 1, i + 1); return (ys[b] - ys[a]) / (t[b] - t[a] || 1e-3); });
  const vs = smooth(vy, 1);

  // turning points with hysteresis so noise does not create reps
  const hyst = Math.max(0.05, minRom * 0.45);
  const turns: { i: number; kind: "lo" | "hi" }[] = [];
  let dir: 0 | 1 | -1 = 0, hi = 0, lo = 0;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] >= ys[hi]) hi = i;
    if (ys[i] <= ys[lo]) lo = i;
    if (dir !== -1 && ys[hi] - ys[i] > hyst) { turns.push({ i: hi, kind: "hi" }); dir = -1; lo = i; }
    else if (dir !== 1 && ys[i] - ys[lo] > hyst) { turns.push({ i: lo, kind: "lo" }); dir = 1; hi = i; }
  }
  if (dir === 1) turns.push({ i: hi, kind: "hi" }); else if (dir === -1) turns.push({ i: lo, kind: "lo" });

  const reps: RepMetric[] = [];
  for (let k = 0; k < turns.length - 1; k++) {
    const a = turns[k], b = turns[k + 1];
    if (a.kind !== "lo" || b.kind !== "hi") continue;
    const rom = ys[b.i] - ys[a.i];
    if (rom < minRom) continue;
    const seg = vs.slice(a.i, b.i + 1);
    const dur = t[b.i] - t[a.i];
    const xDev = xs.slice(a.i, b.i + 1).reduce((m, v) => Math.max(m, Math.abs(v - xs[a.i])), 0);
    reps.push({ rom: +rom.toFixed(3), mcv: +(rom / (dur || 1)).toFixed(2), pv: +Math.max(...seg).toFixed(2), dev: +(xDev * 100).toFixed(1), tUp: +dur.toFixed(2) });
  }
  const velLoss = reps.length > 1 ? +(((reps[0].mcv - reps[reps.length - 1].mcv) / reps[0].mcv) * 100).toFixed(0) : null;
  const meanDev = reps.length ? +(reps.reduce((a, r) => a + r.dev, 0) / reps.length).toFixed(1) : 0;
  // downsample to <= 140 points for storage, centimetres, x right and y up
  const step = Math.max(1, Math.ceil(xs.length / 140));
  const pts: [number, number][] = [];
  for (let i = 0; i < xs.length; i += step) pts.push([+(xs[i] * 100).toFixed(1), +(ys[i] * 100).toFixed(1)]);
  return { pts, reps, velLoss, meanDev, scale: mPerPx, series: ys.map((y, i) => ({ t: t[i], y, v: vs[i] })) };
}
export const PLATE_M = 0.45;
