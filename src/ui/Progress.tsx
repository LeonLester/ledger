import { useMemo, useState } from "react";
import { useStore } from "../store";
import { bestE1rm, fmtW, topSet, workedSets } from "../lib/math";
import { sessionDate, sortSessions } from "../lib/selectors";
import { LineChart } from "./common";

export function Progress() {
  const { sessions, bodyweight, addBodyweight, settings, split } = useStore();
  const [q, setQ] = useState("");
  const [bw, setBw] = useState("");
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of sessions) for (const e of s.exercises) if (workedSets(e).length) m[e.exercise] = (m[e.exercise] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [sessions]);
  const [sel, setSel] = useState(counts[0]?.[0] ?? "");
  const rows = useMemo(() => sortSessions(sessions).flatMap((s) => s.exercises.filter((e) => e.exercise === sel && workedSets(e).length).map((e) => ({ s, e }))), [sessions, sel]);
  const pts = rows.map(({ s, e }, i) => ({ x: i, y: bestE1rm(e) ?? topSet(e)?.weight ?? 0, label: `M${s.meso.slice(1)}W${s.week}` })).filter((p) => p.y > 0);
  const unit = rows[0]?.e.unit === "pin" ? "pin" : rows[0]?.e.unit === "lb" ? "lb" : "kg";
  const prs = useMemo(() => {
    const best: Record<string, { e1: number; w: number; r: number; where: string }> = {};
    for (const s of sessions) for (const e of s.exercises) { const v = bestE1rm(e); const t = topSet(e); if (v && t && (!best[e.exercise] || v > best[e.exercise].e1)) best[e.exercise] = { e1: v, w: t.weight!, r: t.reps!, where: `M${s.meso.slice(1)} W${s.week}` }; }
    return Object.entries(best).sort((a, b) => b[1].e1 - a[1].e1).slice(0, 12);
  }, [sessions]);
  const list = counts.filter(([n]) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Progress</h1><p className="sub">Estimated 1RM by the Epley formula. Pin-stack lifts chart the pin position.</p></div></div>
      <section className="stack">
        <input className="input" placeholder="Find a lift" aria-label="Find a lift" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row wrap" style={{ gap: 6 }}>{list.slice(0, 14).map(([n, c]) => <button key={n} className={`pill ${n === sel ? "acc" : ""}`} onClick={() => setSel(n)} style={{ minHeight: 34, fontSize: ".85rem" }}>{n} <span className="faint">{c}</span></button>)}</div>
      </section>
      {sel && <section className="panel stack" style={{ padding: 16 }}>
        <div className="row between"><h2>{sel}</h2><span className="pill acc num">{pts.length ? `${pts[pts.length - 1].y.toFixed(1)} ${unit}` : ""}</span></div>
        <LineChart points={pts} unit={unit} />
        <table className="t"><thead><tr><th>Session</th><th>Top set</th><th>Sets</th></tr></thead><tbody>
          {rows.slice(-8).reverse().map(({ s, e }, i) => { const t = topSet(e); const d = sessionDate(s, settings.mesoStart, split); return <tr key={i}><td>M{s.meso.slice(1)} W{s.week}, {s.name}<div className="faint xs">{d ?? ""}</div></td><td className="num"><b>{t ? `${fmtW(t.weight)} x ${t.reps}` : "-"}</b></td><td className="num">{workedSets(e).length}</td></tr>; })}
        </tbody></table></section>}
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Best lifts</h3>
        <table className="t"><thead><tr><th>Lift</th><th>Best set</th><th>e1RM</th></tr></thead><tbody>{prs.map(([n, p]) => <tr key={n}><td>{n}<div className="faint xs">{p.where}</div></td><td className="num">{fmtW(p.w)} x {p.r}</td><td className="num"><b>{p.e1.toFixed(1)}</b></td></tr>)}</tbody></table>
      </section>
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Bodyweight</h3>
        <div className="row"><input className="input num" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="kg" aria-label="Bodyweight in kg" value={bw} onChange={(e) => setBw(e.target.value)} />
          <button className="btn primary" disabled={!Number(bw.replace(",", "."))} onClick={() => { addBodyweight(Number(bw.replace(",", "."))); setBw(""); }}>Log weight</button></div>
        {bodyweight.length ? <LineChart points={bodyweight.map((b, i) => ({ x: i, y: b.kg, label: b.date.slice(5) }))} unit="kg" height={140} color="var(--grn)" /> : <p className="dim small">No entries yet. Relative strength (e1RM per kg bodyweight) appears once you log a weight.</p>}
      </section>
    </div>
  );
}
