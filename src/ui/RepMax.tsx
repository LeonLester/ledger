import { useMemo, useState } from "react";
import { useStore } from "../store";
import { est1rm, weightForReps } from "../lib/formulas";
import { extraLoad, fitOf, repTable, resFit } from "../lib/mech";
import { fmtW, unitLabel } from "../lib/math";
import { DecBox, IntBox } from "./common";

/** Rep max calculator: one tested set in, the load for every rep count out. Tare, bodyweight share and machine ratio are counted. */
export function RepMax() {
  const st = useStore();
  const { library, settings, bodyweight } = st;
  const names = useMemo(() => Object.values(library).filter((d) => d.unit !== "pin").map((d) => d.name).sort(), [library]);
  const [name, setName] = useState("");
  const [w, setW] = useState<number | null>(100);
  const [reps, setReps] = useState<number | null>(5);
  const def = name ? library[name] : undefined;
  const unit = def?.unit ?? settings.unit ?? "kg";
  const bw = [...bodyweight].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg ?? null;
  const ex = name ? { ...st.extrasOf(name), unit } : { unit };
  const xl = name ? extraLoad({ ...ex, bw: (ex as { bw?: number | null }).bw ?? bw }) : 0;
  const fit = resFit(def, xl);
  const inc = def?.increment ?? (unit === "lb" ? 5 : 2.5);
  const t = w != null && reps != null && reps > 0 ? repTable({ weight: w, reps }, { fit, extra: xl, inc, max: 15, e1: est1rm, at: weightForReps }) : null;
  const needBw = !!def?.bwf && bw == null;
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Rep max</h1><p className="sub">Enter one hard set and see the load for every rep count.</p></div></div>
      <section className="panel stack" style={{ padding: 16 }}>
        <label className="field"><span>Exercise</span>
          <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">Any lift, no adjustments</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="field" style={{ width: 130 }}><span>Weight ({unitLabel(unit)})</span><DecBox label="Weight" value={w} min={-500} max={2000} onCommit={setW} /></label>
          <label className="field" style={{ width: 100 }}><span>Reps</span><IntBox label="Reps" min={1} max={30} value={reps} onCommit={setReps} /></label>
        </div>
        {name && (xl !== 0 || fitOf(def)) && (
          <p className="dim small">
            Counts {xl !== 0 ? `${fmtW(+xl.toFixed(1))} ${unitLabel(unit)} of tare and bodyweight` : ""}{xl !== 0 && fitOf(def) ? " and " : ""}{fitOf(def) ? "the machine ratio" : ""}. Weights below are what you set on the stack or bar.
          </p>
        )}
        {needBw && <p className="dim small">Log a bodyweight in Progress so the bodyweight share can be counted.</p>}
      </section>
      {t && (
        <section className="panel stack" style={{ padding: 16 }} aria-label="Rep maxes">
          <div className="row between"><div className="dim small">Estimated 1RM</div><b className="num" style={{ fontSize: "1.4rem" }}>{fmtW(+t.e1.toFixed(1))} {unitLabel(unit)}</b></div>
          <div>
            {t.rows.map((r) => (
              <div key={r.reps} style={{ display: "grid", gridTemplateColumns: "1fr auto 56px", alignItems: "center", gap: 12, padding: "10px 12px", borderTop: "1px solid var(--line)", opacity: r.trust === "high" ? 1 : r.trust === "mid" ? 0.75 : 0.5, fontWeight: r.reps === reps ? 700 : 400, background: r.reps === reps ? "var(--accent-soft)" : undefined }}>
                <span className="num">{r.reps} {r.reps === 1 ? "rep" : "reps"}</span>
                <b className="num">{fmtW(r.weight)} {unitLabel(unit)}</b>
                <span className="dim small num" style={{ textAlign: "right" }}>{Math.round(r.pct)}%</span>
              </div>
            ))}
          </div>
          <p className="dim small">Accurate within about 2 reps of the set you entered. Further away the estimate drifts, which is why those rows are faded: fatigue, technique and the exercise itself change how the load maps to reps. Test a set of 3 to 8 reps for the best result. Uses your chosen formula from More.</p>
        </section>
      )}
    </div>
  );
}
