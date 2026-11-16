import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Seg<T extends string | number>({ value, options, onChange, full, accent, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; full?: boolean; accent?: boolean; label?: string }) {
  return (
    <div className={`seg ${full ? "full" : ""} ${accent ? "accent" : ""}`} role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.v)} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="row between"><h2>{title}</h2><button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function LineChart({ points, unit, height = 180, color = "var(--accent)" }: { points: { x: number; y: number; label?: string }[]; unit?: string; height?: number; color?: string }) {
  const W = 640, H = height, pad = { l: 40, r: 10, t: 12, b: 24 };
  if (points.length < 2) return <p className="dim small">Log this lift in two sessions to see a trend.</p>;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1; lo -= span * 0.15; hi += span * 0.15;
  const X = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend from ${points[0].y.toFixed(0)} to ${points[points.length - 1].y.toFixed(0)} ${unit ?? ""}`}>
      {ticks.map((t, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{t.toFixed(0)}</text></g>)}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.y)} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? color : "var(--bg)"} stroke={color} strokeWidth="2"><title>{`${p.label ?? ""} ${p.y.toFixed(1)} ${unit ?? ""}`}</title></circle>)}
      {points.filter((_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)).map((p) => <text key={p.x} x={X(points.indexOf(p))} y={H - 6} textAnchor="middle">{p.label}</text>)}
    </svg>
  );
}

/** Whole-number box that keeps your typing until you leave it, so 12 can be typed digit by digit and the box can be emptied.
 *  Commits as you type whenever the number is in range; on leaving, out-of-range values are clamped and an empty box becomes null (or the old value when empty is not allowed). */
export function IntBox({ value, min, max, empty, label, onCommit, className = "input num", style }: { value: number | null; min: number; max: number; empty?: boolean; label: string; onCommit: (n: number | null) => void; className?: string; style?: React.CSSProperties }) {
  const [t, setT] = useState(value == null ? "" : String(value));
  useEffect(() => { setT(value == null ? "" : String(value)); }, [value]);
  return <input className={className} style={style} inputMode="numeric" aria-label={label} value={t}
    onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setT(v); if (v === "") { if (empty) onCommit(null); return; } const n = parseInt(v, 10); if (n >= min && n <= max) onCommit(n); }}
    onBlur={() => { if (t === "") { if (!empty) setT(String(value ?? min)); return; } const c = Math.max(min, Math.min(max, parseInt(t, 10))); setT(String(c)); onCommit(c); }} />;
}

/** Decimal box with the same typing behaviour: "17." and "17.5" can be typed, and leaving an empty box restores the old value. */
export function DecBox({ value, min, max, label, onCommit, className = "input num" }: { value: number; min: number; max: number; label: string; onCommit: (n: number) => void; className?: string }) {
  const [t, setT] = useState(String(value));
  useEffect(() => { if (Number(t.replace(",", ".")) !== value) setT(String(value)); /* eslint-disable-next-line */ }, [value]);
  return <input className={className} inputMode="decimal" aria-label={label} value={t}
    onChange={(e) => { const v = e.target.value; if (!/^\d*[.,]?\d*$/.test(v)) return; setT(v); const n = Number(v.replace(",", ".")); if (v !== "" && Number.isFinite(n) && n >= min && n <= max) onCommit(n); }}
    onBlur={() => { const n = Number(t.replace(",", ".")); if (t === "" || !Number.isFinite(n)) { setT(String(value)); return; } const c = Math.max(min, Math.min(max, n)); setT(String(c)); onCommit(c); }} />;
}
