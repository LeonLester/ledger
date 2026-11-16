import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../store";
import { coarse } from "../lib/muscles";
import { mrvFor, weekTarget, effectiveSessions } from "../lib/progression";
import { fmtSets, setsPerMuscle } from "../lib/selectors";

export function Volume() {
  const { mesos, settings, sessions, targets, landmarks, library, muscleOf, weightsOf, adjustments, setSettings } = useStore();
  const meso = mesos.find((m) => m.id === settings.activeMeso) ?? mesos[mesos.length - 1];
  if (!meso) return null;
  const week = settings.week;
  const weeks = meso.weeks.map((w) => w.week);
  const done = setsPerMuscle(sessions, meso.id, week, weightsOf);
  const planned: Record<string, number> = {};
  for (const s of effectiveSessions(meso, week, adjustments, muscleOf)) for (const i of s.items) for (const [m, f] of weightsOf(i.exercise)) planned[m] = (planned[m] ?? 0) + i.sets * f;
  const muscles = [...new Set([...Object.keys(planned), ...Object.keys(done)])].filter((m) => m !== "Unknown").sort((a, b) => (planned[b] ?? 0) - (planned[a] ?? 0));
  const heat = (m: string, w: number) => setsPerMuscle(sessions, meso.id, w, weightsOf)[m] ?? 0;

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Volume</h1><p className="sub">Hard sets per muscle against the target from your periodization sheet. A secondary muscle earns a share of each set, set per exercise in the exercise library.</p></div></div>
      <div className="weekbar">
        <button className="btn icon" aria-label="Previous week" disabled={week <= weeks[0]} onClick={() => setSettings({ week: week - 1 })}><ChevronLeft /></button>
        <div className="wk">{meso.name}, week {week}</div>
        <button className="btn icon" aria-label="Next week" disabled={week >= weeks[weeks.length - 1]} onClick={() => setSettings({ week: week + 1 })}><ChevronRight /></button>
      </div>
      <section className="panel" style={{ padding: "4px 16px" }} aria-label="Weekly volume by muscle">
        {muscles.map((m) => {
          const d = done[m] ?? 0, p = planned[m] ?? 0;
          const t = meso.volTargets?.[m]?.[week - 1] ?? weekTarget(m, week, targets) ?? p;
          const mrv = mrvFor(m, landmarks);
          const max = Math.max(t, p, d, mrv ?? 0, 1) * 1.08;
          const plate = d === 0 ? "var(--faint)" : mrv != null && d > mrv ? "var(--red)" : d >= t ? "var(--grn)" : d >= t * 0.6 ? "var(--yel)" : "var(--chalk)";
          return (
            <div className="vol" key={m}>
              <div><b>{m}</b><div className="faint xs">{coarse(m) !== m ? coarse(m) : ""}</div></div>
              <div className="track" role="img" aria-label={`${m}: ${fmtSets(d)} sets done, ${fmtSets(p)} planned, target ${t}${mrv ? `, MRV ${mrv}` : ""}`}>
                <div className="fill" style={{ width: `${(d / max) * 100}%`, ["--plate" as string]: plate }} />
                <div className="tick" style={{ left: `${(p / max) * 100}%` }} title={`Planned ${p}`} />
                {mrv != null && <div className="mrv" style={{ left: `${Math.min(99, (mrv / max) * 100)}%` }} title={`MRV ${mrv}`} />}
              </div>
              <div className="num" style={{ minWidth: 76, textAlign: "right" }}><b>{fmtSets(d)}</b><span className="dim"> / {fmtSets(p)}</span><div className="faint xs">target {t}</div></div>
            </div>
          );
        })}
      </section>
      <p className="faint xs">White tick: sets in this week's plan. Red line: MRV for the muscle group. Bar turns green once the target is reached.</p>
      <section className="stack"><h2>Across the block</h2>
        <div className="heat panel" style={{ padding: 8 }}><table><thead><tr><th>Muscle</th>{weeks.map((w) => <th key={w}>W{w}</th>)}</tr></thead><tbody>
          {muscles.map((m) => <tr key={m}><td>{m}</td>{weeks.map((w) => { const v = heat(m, w), t = meso.volTargets?.[m]?.[w - 1] ?? weekTarget(m, w, targets); const r = t ? v / t : 0;
            return <td key={w} className="c" style={{ background: v ? `color-mix(in srgb, var(--accent) ${Math.min(55, r * 40)}%, transparent)` : undefined }}>{v ? fmtSets(v) : ""}</td>; })}</tr>)}
        </tbody></table></div></section>
      <p className="faint xs">{Object.keys(library).length} exercises mapped to muscles. Fix a wrong mapping under More, Exercise library.</p>
    </div>
  );
}
