import { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { useStore } from "../store";
import { fmtSets } from "../lib/selectors";
import { diffSets, rampTargets, suggestSets, volumeOf } from "../lib/volplan";
import type { Meso, PlanSession } from "../types";
import { DecBox, IntBox, Sheet } from "./common";

/** Set planning for a block: type the weekly sets you want per muscle, see what the plan gives, let the app suggest the sets per exercise, or edit sets by hand. */
export function SetsPlanner({ meso }: { meso: Meso }) {
  const { weightsOf, saveMeso, say } = useStore();
  const [preview, setPreview] = useState<{ week: number; sessions: PlanSession[]; changes: ReturnType<typeof diffSets> }[] | null>(null);
  const weeks = meso.weeks.map((w) => w.week);
  const deload = meso.deload !== false;
  const targets = meso.volTargets ?? {};
  const planned = useMemo(() => Object.fromEntries(meso.weeks.map((w) => [w.week, volumeOf(w.sessions, weightsOf)])), [meso, weightsOf]);
  const muscles = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const w of weeks) for (const [m, v] of Object.entries(planned[w] ?? {})) sum[m] = (sum[m] ?? 0) + v;
    for (const m of Object.keys(targets)) sum[m] ??= 0;
    return Object.keys(sum).filter((m) => m !== "Unknown").sort((a, b) => sum[b] - sum[a]);
  }, [planned, targets]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (m: Meso) => saveMeso(m);
  const setTarget = (muscle: string, week: number, v: number | null) => {
    const row = [...(targets[muscle] ?? weeks.map(() => null))]; row[week - 1] = v;
    const next = { ...targets, [muscle]: row };
    if (row.every((x) => x == null)) delete next[muscle];
    save({ ...meso, volTargets: Object.keys(next).length ? next : undefined });
  };
  const ramp = (muscle: string) => {
    const row = targets[muscle] ?? [];
    const lastBuild = deload && weeks.length > 2 ? weeks.length - 1 : weeks.length;
    const first = row[0] ?? planned[weeks[0]]?.[muscle] ?? 0, last = row[lastBuild - 1] ?? planned[weeks[lastBuild - 1]]?.[muscle] ?? first;
    save({ ...meso, volTargets: { ...targets, [muscle]: rampTargets(first, last, weeks.length, deload) } });
  };
  const suggest = () => {
    const out = [];
    for (const w of meso.weeks) {
      const t: Record<string, number> = {};
      for (const [m, row] of Object.entries(targets)) if (row[w.week - 1] != null) t[m] = row[w.week - 1]!;
      if (!Object.keys(t).length) continue;
      const sessions = suggestSets(w.sessions, t, weightsOf);
      const changes = diffSets(w.sessions, sessions);
      if (changes.length) out.push({ week: w.week, sessions, changes });
    }
    if (!out.length) { say(Object.keys(targets).length ? "The plan already matches your targets" : "Set a target for at least one muscle first"); return; }
    setPreview(out);
  };
  const apply = () => {
    if (!preview) return;
    const by = new Map(preview.map((p) => [p.week, p.sessions]));
    save({ ...meso, weeks: meso.weeks.map((w) => (by.has(w.week) ? { ...w, sessions: by.get(w.week)! } : w)) });
    say(`Sets updated in ${preview.length} week${preview.length === 1 ? "" : "s"}`); setPreview(null);
  };
  const setSets = (session: string, exercise: string, week: number, n: number) =>
    save({ ...meso, weeks: meso.weeks.map((w) => (w.week !== week ? w : { ...w, sessions: w.sessions.map((s) => (s.name !== session ? s : { ...s, items: s.items.map((it) => (it.exercise === exercise ? { ...it, sets: n } : it)) })) })) });
  // sessions by name across weeks, with their exercises in first-seen order
  const grid = useMemo(() => {
    const names: string[] = []; const ex: Record<string, string[]> = {};
    for (const w of meso.weeks) for (const s of w.sessions) { if (!names.includes(s.name)) { names.push(s.name); ex[s.name] = []; } for (const it of s.items) if (!ex[s.name].includes(it.exercise)) ex[s.name].push(it.exercise); }
    return names.map((n) => ({ name: n, exercises: ex[n] }));
  }, [meso]);
  const cell = (session: string, exercise: string, week: number) => meso.weeks.find((w) => w.week === week)?.sessions.find((s) => s.name === session)?.items.find((i) => i.exercise === exercise);

  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <div><h3>Weekly sets per muscle</h3>
          <p className="dim small">The big number is what your plan gives now, counting a secondary muscle by its share of each set. Type the sets you want underneath, or use Ramp to move a muscle in a straight line from week 1 to the last build week.</p></div>
        <div className="lib-scroll" tabIndex={0} aria-label="Weekly sets per muscle">
          <table className="lib sets-grid">
            <thead><tr><th className="lib-n">Muscle</th>{weeks.map((w) => <th key={w}>W{w}</th>)}<th /></tr></thead>
            <tbody>
              {muscles.map((m) => (
                <tr key={m}>
                  <td className="lib-n"><div className="lib-open" style={{ cursor: "default" }}>{m}</div></td>
                  {weeks.map((w) => {
                    const p = planned[w]?.[m] ?? 0, t = targets[m]?.[w - 1] ?? null;
                    const off = t != null && Math.abs(p - t) >= 0.75;
                    return <td key={w} className="sg-cell"><div className="num" style={{ fontWeight: 700, color: off ? "var(--yel)" : undefined }}>{fmtSets(p)}</div>
                      <DecBox label={`${m} week ${w} target`} empty min={0} max={80} value={t} style={{ width: 54, minHeight: 34, textAlign: "center", padding: "0 4px" }} className="input num" onCommit={(n) => setTarget(m, w, n)} /></td>;
                  })}
                  <td className="sg-cell"><button className="btn ghost sm" aria-label={`Ramp ${m}`} onClick={() => ramp(m)}>Ramp</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={suggest}><Wand2 size={16} /> Suggest sets to match</button>
          <button className="btn ghost" disabled={!Object.keys(targets).length} onClick={() => { save({ ...meso, volTargets: undefined }); say("Targets cleared"); }}>Clear targets</button>
        </div>
        <p className="faint xs">Suggested sets change whole sets per exercise, keep every exercise at 1 to 12 sets and leave percentage-based lifts alone. Targets also show in the Volume tab.</p>
      </section>

      <section className="stack">
        <h3>Sets by exercise and week</h3>
        <p className="dim small">Change the sets of any exercise in any week by hand. Feedback adjustments stay layered on top.</p>
        {grid.map((s) => (
          <div key={s.name} className="panel" style={{ padding: 12 }}>
            <h3 style={{ padding: "2px 4px 8px" }}>{s.name}</h3>
            <div className="lib-scroll" tabIndex={0} aria-label={`Sets for ${s.name}`}>
              <table className="lib sets-grid">
                <thead><tr><th className="lib-n">Exercise</th>{weeks.map((w) => <th key={w}>W{w}</th>)}</tr></thead>
                <tbody>{s.exercises.map((e) => (
                  <tr key={e}><td className="lib-n"><div className="lib-open" style={{ cursor: "default" }}>{e}</div></td>
                    {weeks.map((w) => { const it = cell(s.name, e, w); return <td key={w} className="sg-cell">{it ? (it.scheme || it.pct != null ? <span className="faint xs">{it.sets}</span> : <IntBox label={`${e} sets in week ${w}`} min={1} max={30} value={it.sets} style={{ width: 54, minHeight: 34, textAlign: "center", padding: "0 4px" }} onCommit={(n) => n != null && setSets(s.name, e, w, n)} />) : <span className="faint">-</span>}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      {preview && (
        <Sheet title="Suggested sets" onClose={() => setPreview(null)}>
          <p className="dim small">These changes bring each week's muscle volume closest to your targets.</p>
          {preview.map((p) => (
            <div key={p.week} className="stack" style={{ gap: 4 }}>
              <b>Week {p.week}</b>
              {p.changes.map((c, i) => <div key={i} className="row between small"><span>{c.exercise} <span className="faint">{c.session}</span></span><span className="num">{c.from} to <b>{c.to}</b></span></div>)}
            </div>
          ))}
          <button className="btn primary" onClick={apply}>Apply to the plan</button>
        </Sheet>
      )}
    </div>
  );
}
