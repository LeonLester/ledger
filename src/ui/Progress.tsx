import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useData } from "../lib/view";
import type { Session } from "../types";
import { bestE1rm, fmtW, topSet, workedSets } from "../lib/math";
import { sessionDate, sortSessions } from "../lib/selectors";
import { LineChart, Seg } from "./common";
import { Records, Strength } from "./Strength";

const COLORS = ["var(--accent)", "var(--grn)", "var(--yel)", "var(--red)", "#b36bff", "#2ec4d6"];
const MAX_SERIES = 6;
const DAY = 864e5;

/** Dropdown with search and checkboxes, so any number of lifts can be browsed and a few overlaid. */
function LiftPicker({ options, value, onChange }: { options: [string, number][]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = options.filter(([n]) => n.toLowerCase().includes(q.toLowerCase()));
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : value.length >= MAX_SERIES ? value : [...value, n]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)} style={{ justifyContent: "space-between", width: "100%" }}>
        <span>{value.length === 0 ? "Choose lifts" : value.length === 1 ? value[0] : `${value[0]} + ${value.length - 1} more`}</span><ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div className="panel stack" style={{ padding: 12, gap: 8 }}>
          <input className="input" placeholder="Search lifts" aria-label="Search lifts" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          <div role="listbox" aria-multiselectable="true" aria-label="Lifts" style={{ maxHeight: 280, overflowY: "auto" }}>
            {list.map(([n, c]) => (
              <label key={n} className="row between" style={{ padding: "9px 4px", cursor: "pointer", gap: 10 }}>
                <span className="row" style={{ gap: 10 }}><input type="checkbox" checked={value.includes(n)} disabled={!value.includes(n) && value.length >= MAX_SERIES} onChange={() => toggle(n)} /><span>{n}</span></span>
                <span className="faint xs num">{c}</span>
              </label>
            ))}
            {list.length === 0 && <p className="dim small">No lifts match.</p>}
          </div>
          <div className="row between"><span className="faint xs">Pick up to {MAX_SERIES} to overlay them.</span><button className="btn sm ghost" onClick={() => onChange([])} disabled={!value.length}>Clear</button></div>
        </div>
      )}
    </div>
  );
}

type Series = { name: string; color: string; unit: string; pts: { x: number; y: number; label: string }[] };

function MultiChart({ series, xKind, xLabel, height = 220 }: { series: Series[]; xKind: "date" | "session"; xLabel: (x: number) => string; height?: number }) {
  const W = 640, H = height, pad = { l: 44, r: 12, t: 12, b: 28 };
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) return <p className="dim small">Not enough sessions in this range. Pick a longer range or another lift.</p>;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1; lo -= span * 0.12; hi += span * 0.12;
  const X = (x: number) => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const yt = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
  const nt = Math.min(5, new Set(xs).size);
  const xt = Array.from({ length: nt }, (_, i) => x0 + ((x1 - x0) * i) / Math.max(1, nt - 1));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart of ${series.map((s) => s.name).join(", ")}`}>
      {yt.map((t, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{t >= 100 ? t.toFixed(0) : t.toFixed(1)}</text></g>)}
      {xt.map((t, i) => <text key={i} x={X(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === nt - 1 ? "end" : "middle"}>{xLabel(Math.round(t))}</text>)}
      {series.map((s) => s.pts.length > 0 && (
        <g key={s.name}>
          <path d={s.pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {s.pts.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={i === s.pts.length - 1 ? 5 : 3} fill={i === s.pts.length - 1 ? s.color : "var(--bg)"} stroke={s.color} strokeWidth="2"><title>{`${s.name}, ${p.label}: ${p.y.toFixed(1)} ${s.unit}`}</title></circle>)}
        </g>
      ))}
    </svg>
  );
}

const fmtDate = (t: number) => new Date(t * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

function Trends() {
  const { sessions, bodyweight, addBodyweight, settings, split, readOnly } = useData();
  const [bw, setBw] = useState("");
  const done = useMemo(() => sortSessions(sessions.filter((s) => s.status === "done")), [sessions]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of done) for (const e of s.exercises) if (workedSets(e).length) m[e.exercise] = (m[e.exercise] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [done]);
  const [sel, setSel] = useState<string[]>([]);
  const chosen = sel.filter((n) => counts.some(([c]) => c === n));
  const active = chosen.length ? chosen : counts[0] ? [counts[0][0]] : [];
  const dates = useMemo(() => new Map(done.map((s) => [s.id, sessionDate(s, settings.mesoStart, split)])), [done, settings.mesoStart, split]);
  const hasDates = done.some((s) => dates.get(s.id));
  const [xKind, setXKind] = useState<"date" | "session">(hasDates ? "date" : "session");
  const kind = xKind === "date" && hasDates ? "date" : "session";
  const [range, setRange] = useState(0);
  const [rel, setRel] = useState(false);

  const dayOf = (s: Session) => { const d = dates.get(s.id); return d ? Math.round(new Date(d + "T12:00:00").getTime() / DAY) : null; };
  const lastDay = Math.max(0, ...done.map((s) => dayOf(s) ?? 0));
  const cutoff = range ? (kind === "date" ? lastDay - range * 30 : done.length - range) : -Infinity;
  const series: Series[] = active.map((name, i) => {
    const raw: { x: number; y: number; label: string; unit: string }[] = [];
    done.forEach((s, idx) => {
      const e = s.exercises.find((x) => x.exercise === name && workedSets(x).length);
      if (!e) return;
      const x = kind === "date" ? dayOf(s) : idx;
      const y = bestE1rm(e) ?? topSet(e)?.weight ?? 0;
      if (x == null || y <= 0 || x < cutoff) return;
      raw.push({ x, y, label: kind === "date" ? fmtDate(x) : `M${s.meso.slice(1)} W${s.week}`, unit: e.unit === "pin" ? "pin" : e.unit === "lb" ? "lb" : "kg" });
    });
    const base = raw[0]?.y || 1;
    return { name, color: COLORS[i % COLORS.length], unit: rel ? "%" : raw[0]?.unit ?? "kg", pts: raw.map((p) => ({ x: p.x, y: rel ? (p.y / base) * 100 : p.y, label: p.label })) };
  });
  const xLabel = (x: number) => (kind === "date" ? fmtDate(x) : (() => { const s = done[Math.max(0, Math.min(done.length - 1, x))]; return s ? `M${s.meso.slice(1)} W${s.week}` : ""; })());
  const rows = useMemo(() => done.flatMap((s) => s.exercises.filter((e) => e.exercise === active[0] && workedSets(e).length).map((e) => ({ s, e }))), [done, active[0]]);

  const prs = useMemo(() => {
    const best: Record<string, { e1: number; w: number; r: number; where: string }> = {};
    for (const s of sessions) for (const e of s.exercises) { const v = bestE1rm(e); const t = topSet(e); if (v && t && (!best[e.exercise] || v > best[e.exercise].e1)) best[e.exercise] = { e1: v, w: t.weight!, r: t.reps!, where: `M${s.meso.slice(1)} W${s.week}` }; }
    return Object.entries(best).sort((a, b) => b[1].e1 - a[1].e1).slice(0, 12);
  }, [sessions]);
  const sessionRanges = [{ v: 10, label: "Last 10" }, { v: 20, label: "Last 20" }, { v: 40, label: "Last 40" }, { v: 0, label: "All" }];
  const dateRanges = [{ v: 1, label: "1M" }, { v: 3, label: "3M" }, { v: 6, label: "6M" }, { v: 12, label: "1Y" }, { v: 0, label: "All" }];
  return (
    <div className="stack-lg">
      <p className="sub">Estimated 1RM by the Epley formula. Pin-stack lifts chart the pin position.</p>
      <section className="stack">
        <LiftPicker options={counts} value={chosen} onChange={setSel} />
        {chosen.length > 1 && <Seg value={rel ? "rel" : "abs"} onChange={(v) => setRel(v === "rel")} label="Scale" options={[{ v: "abs", label: "Actual load" }, { v: "rel", label: "% of first" }]} />}
      </section>
      {active.length > 0 && <section className="panel stack" style={{ padding: 16 }}>
        <div className="row between wrap">
          <h2>{active.length === 1 ? active[0] : "Comparison"}</h2>
          {series.length === 1 && series[0].pts.length > 0 && <span className="pill acc num">{series[0].pts[series[0].pts.length - 1].y.toFixed(1)} {series[0].unit}</span>}
        </div>
        <div className="row wrap">
          <Seg value={kind} onChange={(v) => { setXKind(v); setRange(0); }} label="X axis" options={([{ v: "date", label: "Date" }, { v: "session", label: "Session" }] as const).filter((o) => o.v === "session" || hasDates).map((o) => ({ v: o.v as "date" | "session", label: o.label }))} />
          <Seg value={range} onChange={setRange} label="Range" options={kind === "date" ? dateRanges : sessionRanges} />
        </div>
        {series.length > 1 && <div className="row wrap" style={{ gap: 12 }}>{series.map((s) => <span key={s.name} className="row xs" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: s.color }} />{s.name}</span>)}</div>}
        <MultiChart series={series} xKind={kind} xLabel={xLabel} />
        {active.length === 1 && <table className="t"><thead><tr><th>Session</th><th>Top set</th><th>Sets</th></tr></thead><tbody>
          {rows.slice(-8).reverse().map(({ s, e }, i) => { const t = topSet(e); const d = dates.get(s.id); return <tr key={i}><td>M{s.meso.slice(1)} W{s.week}, {s.name}<div className="faint xs">{d ?? ""}</div></td><td className="num"><b>{t ? `${fmtW(t.weight)} x ${t.reps}` : "-"}</b></td><td className="num">{workedSets(e).length}</td></tr>; })}
        </tbody></table>}
      </section>}
      {counts.length === 0 && <p className="dim">Nothing logged yet. Finish a session to start the charts.</p>}
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Best lifts</h3>
        <table className="t"><thead><tr><th>Lift</th><th>Best set</th><th>e1RM</th></tr></thead><tbody>{prs.map(([n, p]) => <tr key={n}><td>{n}<div className="faint xs">{p.where}</div></td><td className="num">{fmtW(p.w)} x {p.r}</td><td className="num"><b>{p.e1.toFixed(1)}</b></td></tr>)}</tbody></table>
      </section>
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Bodyweight</h3>
        {!readOnly && <div className="row"><input className="input num" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="kg" aria-label="Bodyweight in kg" value={bw} onChange={(e) => setBw(e.target.value)} />
          <button className="btn primary" disabled={!Number(bw.replace(",", "."))} onClick={() => { addBodyweight(Number(bw.replace(",", "."))); setBw(""); }}>Log weight</button></div>}
        {bodyweight.length ? <LineChart points={bodyweight.map((b, i) => ({ x: i, y: b.kg, label: b.date.slice(5) }))} unit="kg" height={140} color="var(--grn)" /> : <p className="dim small">No entries yet. Relative strength (e1RM per kg bodyweight) appears once you log a weight.</p>}
      </section>
    </div>
  );
}

export function Progress() {
  const [view, setView] = useState<"trends" | "strength" | "records">("trends");
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Progress</h1></div><Seg value={view} onChange={setView} label="View" options={[{ v: "trends", label: "Trends" }, { v: "strength", label: "Strength" }, { v: "records", label: "Records" }]} /></div>
      {view === "trends" ? <Trends /> : view === "strength" ? <Strength /> : <Records />}
    </div>
  );
}
