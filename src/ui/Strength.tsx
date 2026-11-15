import { useMemo, useState } from "react";
import { useData } from "../lib/view";
import { LIFTS, LIFT_LABEL, LIFT_NAME } from "../data/catalog";
import { bestE1rm, fmtW, topSet, workedSets } from "../lib/math";
import { PR_LABEL, repMax, sessionPrs } from "../lib/pr";
import { sessionDate, sortSessions } from "../lib/selectors";
import type { LiftKey } from "../types";
import { LineChart, Seg } from "./common";
import { SCORE_LABEL, formulas, score } from "../lib/formulas";

export const dots = (total: number, bw: number, sex: "m" | "f") => score(total, bw, sex);

export function Strength() {
  const { sessions, settings, setSettings, library, bodyweight } = useData();
  const [sel, setSel] = useState<LiftKey>("squat");
  const done = useMemo(() => sortSessions(sessions.filter((s) => s.status === "done")), [sessions]);
  // when the standard exercise has no history, fall back to the most-logged exercise that looks like the lift
  const map = useMemo(() => {
    const count: Record<string, number> = {};
    for (const s of done) for (const e of s.exercises) if (workedSets(e).length) count[e.exercise] = (count[e.exercise] ?? 0) + 1;
    const rx: Record<LiftKey, RegExp> = { squat: /squat|bbs/i, bench: /bench|\bbp\b/i, deadlift: /^dl\b|^deadlift|conventional|sumo/i, ohp: /ohp|overhead|military/i };
    const out = { ...LIFT_NAME } as Record<LiftKey, string>;
    for (const l of LIFTS) {
      const own = settings.liftMap?.[l];
      if (own) { out[l] = own; continue; }
      if (count[LIFT_NAME[l]]) continue;
      const guess = Object.entries(count).filter(([n]) => rx[l].test(n) && !/pause|spotto|banded|deficit|ecc|wrist|sup |smith bp/i.test(n)).sort((a, b) => b[1] - a[1])[0];
      if (guess) out[l] = guess[0];
    }
    return out;
  }, [done, settings.liftMap]);
  const per = useMemo(() => Object.fromEntries(LIFTS.map((l) => [l, done.flatMap((s) => s.exercises.filter((e) => e.exercise === map[l] && workedSets(e).length).map((e) => ({ s, e })))])) as Record<LiftKey, { s: (typeof done)[number]; e: (typeof done)[number]["exercises"][number] }[]>, [done, map]);
  const best = Object.fromEntries(LIFTS.map((l) => [l, Math.max(0, ...per[l].map((r) => bestE1rm(r.e) ?? 0))])) as Record<LiftKey, number>;
  const total = best.squat + best.bench + best.deadlift;
  const bw = bodyweight.length ? [...bodyweight].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].kg : null;
  const rows = per[sel];
  const [range, setRange] = useState(0);
  const allPts = rows.map((r, i) => ({ x: i, y: bestE1rm(r.e) ?? 0, label: `M${r.s.meso.slice(1)}W${r.s.week}` })).filter((p) => p.y > 0);
  const pts = (range ? allPts.slice(-range) : allPts).map((p, i) => ({ ...p, x: i }));

  // weekly rollup for the selected lift
  const weekly = useMemo(() => {
    const m = new Map<string, { label: string; sets: number; reps: number; ton: number; rir: number[]; int: number[]; tech: number[] }>();
    for (const { s, e } of rows) {
      const key = `${s.meso}-${s.week}`;
      const o = m.get(key) ?? { label: `M${s.meso.slice(1)} W${s.week}`, sets: 0, reps: 0, ton: 0, rir: [], int: [], tech: [] };
      for (const x of workedSets(e)) {
        if (x.weight == null) continue;
        o.sets++; o.reps += x.reps!; o.ton += x.weight * x.reps!;
        if (x.rir != null) o.rir.push(x.rir);
        if (best[sel] > 0 && e.unit !== "pin") o.int.push(x.weight / best[sel]);
      }
      if (e.tech) o.tech.push(e.tech);
      m.set(key, o);
    }
    return [...m.values()].slice(-8);
  }, [rows, best[sel]]);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const tags = useMemo(() => { const c: Record<string, number> = {}; for (const { e } of rows.slice(-12)) for (const t of e.form ?? []) c[t] = (c[t] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); }, [rows]);
  const paths = rows.flatMap(({ s, e }) => (e.paths ?? []).map((p) => ({ s, p })));
  const names = Object.keys(library).sort();

  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <div className="row between wrap"><h3>Estimated maxes</h3>{total > 0 && <span className="pill acc num">Total {total.toFixed(0)} kg</span>}</div>
        <table className="t"><thead><tr><th>Lift</th><th>Best e1RM</th><th>Latest</th><th>{bw ? "x BW" : ""}</th></tr></thead><tbody>
          {LIFTS.map((l) => {
            const last = per[l][per[l].length - 1];
            const lv = last ? bestE1rm(last.e) : null;
            return <tr key={l} onClick={() => setSel(l)} style={{ cursor: "pointer", background: sel === l ? "var(--accent-soft)" : undefined }}>
              <td><b>{LIFT_LABEL[l]}</b><div className="faint xs">{map[l]}</div></td>
              <td className="num"><b>{best[l] ? best[l].toFixed(1) : "-"}</b></td><td className="num">{lv ? lv.toFixed(1) : "-"}</td>
              <td className="num">{bw && best[l] ? (best[l] / bw).toFixed(2) : ""}</td></tr>;
          })}
        </tbody></table>
        {bw && total > 0 ? <p className="small">{SCORE_LABEL[formulas().score ?? "dots"]} at {fmtW(bw)} kg bodyweight: <b className="num">{dots(total, bw, settings.sex ?? "m").toFixed(1)}</b>. Based on estimated, not tested, maxes.</p> : <p className="faint xs">Log your bodyweight in Trends to see DOTS and strength per kilo.</p>}
        <label className="field"><span>Which exercise counts as {LIFT_LABEL[sel].toLowerCase()}</span>
          <select className="input" value={map[sel]} onChange={(e) => setSettings({ liftMap: { ...settings.liftMap, [sel]: e.target.value } })}>{[...new Set([map[sel], ...names])].map((n) => <option key={n}>{n}</option>)}</select></label>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>{LIFT_LABEL[sel]} e1RM</h3>
        <Seg value={range} onChange={setRange} label="Chart range" options={[{ v: 8, label: "Last 8" }, { v: 16, label: "Last 16" }, { v: 32, label: "Last 32" }, { v: 0, label: "All" }]} />
        <LineChart points={pts} unit="kg" />
        {best[sel] > 0 && <>
          <h3>Rep maxes at this e1RM</h3>
          <table className="t"><thead><tr><th>Reps</th>{[1, 2, 3, 5, 8, 10].map((n) => <th key={n} className="num">{n}</th>)}</tr></thead><tbody><tr><td>kg</td>{[1, 2, 3, 5, 8, 10].map((n) => <td key={n} className="num"><b>{(Math.round(repMax(best[sel], n) / 2.5) * 2.5).toFixed(1).replace(/\.0$/, "")}</b></td>)}</tr></tbody></table>
        </>}
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>{LIFT_LABEL[sel]} by week</h3>
        {weekly.length === 0 ? <p className="dim small">No logged sets for {map[sel]} yet.</p> :
          <div className="heat"><table className="t"><thead><tr><th>Week</th><th>Sets</th><th>Reps</th><th>Tonnage</th><th>Intensity</th><th>RPE</th><th>Tech</th></tr></thead><tbody>
            {weekly.map((w) => { const r = avg(w.rir), i = avg(w.int), tc = avg(w.tech); return <tr key={w.label}><td>{w.label}</td><td className="num">{w.sets}</td><td className="num">{w.reps}</td><td className="num">{Math.round(w.ton)}</td><td className="num">{i ? `${Math.round(i * 100)}%` : "-"}</td><td className="num">{r != null ? (10 - r).toFixed(1) : "-"}</td><td className="num">{tc ? tc.toFixed(1) : "-"}</td></tr>; })}
          </tbody></table></div>}
        <p className="faint xs">Intensity is average load against your best e1RM. RPE is 10 minus the reps in reserve you logged. Technique is your 1 to 5 rating.</p>
        {tags.length > 0 && <p className="small">Recurring form notes: {tags.map(([t, c]) => `${t} (${c})`).join(", ")}</p>}
        {paths.length > 0 && <p className="small">Bar path recorded in {paths.length} sets. Latest: {paths[paths.length - 1].p.reps.length} reps, mean bar drift {(paths[paths.length - 1].p.reps.reduce((a, r) => a + r.dev, 0) / Math.max(1, paths[paths.length - 1].p.reps.length)).toFixed(1)} cm.</p>}
      </section>
    </div>
  );
}

export function Records() {
  const { sessions, bodyweight, settings, split, library } = useData();
  const ctx = { mesoStart: settings.mesoStart, split };
  const done = useMemo(() => sortSessions(sessions.filter((s) => s.status === "done")), [sessions]);
  const feed = useMemo(() => done.slice(-14).reverse().map((s) => ({ s, prs: sessionPrs(s, sessions, bodyweight, ctx) })).filter((x) => x.prs.length), [done, bodyweight]);
  const names = useMemo(() => [...new Set(done.flatMap((s) => s.exercises.filter((e) => workedSets(e).length).map((e) => e.exercise)))].sort(), [done]);
  const [ex, setEx] = useState(settings.liftMap?.squat ?? names.find((n) => /squat|bbs/i.test(n)) ?? names[0] ?? "Back Squat");
  const table = useMemo(() => {
    const best: Record<number, { w: number; where: string }> = {};
    for (const s of done) for (const e of s.exercises) if (e.exercise === ex && e.unit !== "pin") for (const x of workedSets(e)) {
      if (x.weight == null || x.reps! > 12) continue;
      const w = e.unit === "lb" ? x.weight * 0.45359 : x.weight;
      if (!best[x.reps!] || w > best[x.reps!].w) best[x.reps!] = { w, where: `M${s.meso.slice(1)} W${s.week}` };
    }
    return best;
  }, [done, ex]);
  void topSet; void library;
  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Recent records</h3>
        {feed.length === 0 ? <p className="dim small">No records in your last sessions. Beat a previous weight, reps at a weight or estimated 1RM and it shows here.</p> :
          feed.map(({ s, prs }) => (
            <div key={s.id}>
              <div className="row between"><b>{s.name}</b><span className="faint xs">M{s.meso.slice(1)} W{s.week}{sessionDate(s, settings.mesoStart, split) ? `, ${sessionDate(s, settings.mesoStart, split)}` : ""}</span></div>
              <div className="list">{prs.map((p, i) => <div key={i} className="row between wrap" style={{ padding: "8px 0" }}><span>{p.exercise}<div className="faint xs">{p.text}</div></span><span className="pill ok">{PR_LABEL[p.kind]}</span></div>)}</div>
            </div>
          ))}
      </section>
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Best weight by reps</h3>
        <select className="input" aria-label="Exercise" value={ex} onChange={(e) => setEx(e.target.value)}>{[...new Set([ex, ...names])].map((n) => <option key={n}>{n}</option>)}</select>
        {Object.keys(table).length === 0 ? <p className="dim small">No sets logged for this exercise.</p> :
          <table className="t"><thead><tr><th>Reps</th><th>Best (kg)</th><th>When</th></tr></thead><tbody>{Object.entries(table).sort((a, b) => Number(a[0]) - Number(b[0])).map(([r, v]) => <tr key={r}><td className="num">{r}</td><td className="num"><b>{fmtW(+v.w.toFixed(1))}</b></td><td className="faint">{v.where}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
