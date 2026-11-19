/** One matched moment: the scale reading (kg, tare removed) and the tracked height of the plate or handle in cm above its lowest point. */
export interface LiveSample { t: number; kg: number; y: number | null }

export interface RomPoint { cm: number; up: number | null; down: number | null; n: number }

/** Pair each camera position with the latest scale reading that arrived at least `lag` seconds earlier. Readings are step-held, since the scale only broadcasts now and then. */
export function pairSamples(pos: { t: number; y: number }[], reads: { t: number; kg: number }[], lag = 0): LiveSample[] {
  const out: LiveSample[] = [];
  let j = 0;
  for (const p of pos) {
    while (j + 1 < reads.length && reads[j + 1].t + lag <= p.t) j++;
    if (!reads.length || reads[0].t + lag > p.t) continue;
    out.push({ t: p.t, kg: reads[j].kg, y: p.y });
  }
  return out;
}

/** Resistance against range of motion. Positions are binned from the lowest to the highest point reached; moving up and moving down are averaged separately because the scale lags and the two directions differ. */
export function resistanceByRom(s: LiveSample[], bins = 20): RomPoint[] {
  const v = s.filter((x): x is LiveSample & { y: number } => x.y != null);
  if (v.length < 6) return [];
  const lo = Math.min(...v.map((x) => x.y)), hi = Math.max(...v.map((x) => x.y));
  if (hi - lo < 5) return [];
  const acc = Array.from({ length: bins }, () => ({ u: 0, un: 0, d: 0, dn: 0 }));
  for (let i = 0; i < v.length; i++) {
    const a = v[Math.max(0, i - 2)], b = v[Math.min(v.length - 1, i + 2)];
    const dir = b.y - a.y;
    if (Math.abs(dir) < 0.2) continue;
    const k = Math.min(bins - 1, Math.floor(((v[i].y - lo) / (hi - lo)) * bins));
    if (dir > 0) { acc[k].u += v[i].kg; acc[k].un++; } else { acc[k].d += v[i].kg; acc[k].dn++; }
  }
  return acc.map((c, k) => ({
    cm: +(lo + ((k + 0.5) * (hi - lo)) / bins).toFixed(1),
    up: c.un ? c.u / c.un : null, down: c.dn ? c.d / c.dn : null, n: c.un + c.dn,
  }));
}

/** Readings per second over the most recent `window` seconds. */
export function rate(times: number[], window = 5): number {
  if (times.length < 2) return 0;
  const end = times[times.length - 1];
  const r = times.filter((t) => t >= end - window);
  return r.length < 2 ? 0 : (r.length - 1) / (r[r.length - 1] - r[0] || 1);
}
