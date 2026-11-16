import { useState } from "react";
import { useStore } from "../store";
import { curve, LEVER_DEFAULT, LEVER_PRESETS, loadFor, summarize } from "../lib/lever";
import { fmtW } from "../lib/math";
import type { LeverSpec } from "../types";
import { DecBox, LineChart, Seg, Sheet } from "./common";

const f1 = (n: number | null) => (n == null ? "-" : (Math.round(n * 10) / 10).toString());

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><span>{label}</span>{children}{hint && <span className="faint xs" style={{ fontWeight: 400 }}>{hint}</span>}</div>;
}

/** How hard the machine really is at the bottom and the top of a rep, from its lever geometry. */
export function LeverTool({ exercise, weight, onSaved }: { exercise?: string; weight?: number | null; onSaved?: () => void }) {
  const { library, setExercise, say } = useStore();
  const saved = exercise ? library[exercise]?.lever : undefined;
  const [l, setL] = useState<LeverSpec>(saved ?? LEVER_DEFAULT);
  const [load, setLoad] = useState<number>(weight && weight > 0 ? weight : 60);
  const [preset, setPreset] = useState<string>(saved ? "saved" : "custom");
  const [target, setTarget] = useState<number | null>(null);
  const set = (p: Partial<LeverSpec>) => { setL({ ...l, ...p }); setPreset("custom"); };
  const s = summarize(l, load);
  const pts = curve(l, load).filter((p) => p.kg != null).map((p, i) => ({ x: i, y: p.kg as number, label: `${Math.round(p.deg)}°` }));
  const bad = l.loadArm <= 0 || l.userArm <= 0 || l.start === l.end;
  const verdict = s.change == null ? "" : Math.abs(s.change) < 3 ? "The resistance stays about the same through the rep." : s.change > 0 ? `${Math.round(s.change)}% harder at the top than at the bottom.` : `${Math.round(-s.change)}% easier at the top than at the bottom.`;
  const tl = target != null ? { bottom: loadFor(target, s.maBottom), top: loadFor(target, s.maTop), mean: loadFor(target, s.maMean) } : null;

  return (
    <div className="stack">
      <p className="dim small">Enter the machine's lever geometry. The calculator treats the load as plates on a lever and finds the force you feel at the handle as the arm moves. Any length unit works, as long as it is the same for both arms.</p>
      <Field label="Start from">
        <select className="input" aria-label="Machine preset" value={preset} onChange={(e) => { const p = LEVER_PRESETS.find((x) => x.id === e.target.value); if (p) { setL(p.spec); setPreset(p.id); } else if (e.target.value === "saved" && saved) { setL(saved); setPreset("saved"); } }}>
          <option value="custom">My own numbers</option>
          {saved && <option value="saved">Saved for {exercise}</option>}
          {LEVER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {LEVER_PRESETS.find((p) => p.id === preset) && <span className="faint xs" style={{ fontWeight: 400 }}>{LEVER_PRESETS.find((p) => p.id === preset)!.note} These are example numbers. Measure your machine.</span>}
      </Field>
      <div className="row wrap">
        <label className="field" style={{ flex: "1 1 120px" }}><span>Plates on the arm (kg)</span><DecBox value={load} min={0.5} max={1000} label="Load in kg" onCommit={(n) => setLoad(n ?? 0)} /></label>
        <label className="field" style={{ flex: "1 1 120px" }}><span>Pivot to plates</span><DecBox value={l.loadArm} min={1} max={1000} label="Distance from pivot to plates" onCommit={(n) => set({ loadArm: n ?? l.loadArm })} /></label>
        <label className="field" style={{ flex: "1 1 120px" }}><span>Pivot to handle or pad</span><DecBox value={l.userArm} min={1} max={1000} label="Distance from pivot to handle" onCommit={(n) => set({ userArm: n ?? l.userArm })} /></label>
      </div>
      <div className="row wrap">
        <label className="field" style={{ flex: "1 1 150px" }}><span>Arm angle at the bottom</span><DecBox value={l.start} min={0} max={180} label="Arm angle at the bottom in degrees" onCommit={(n) => set({ start: n ?? l.start })} /></label>
        <label className="field" style={{ flex: "1 1 150px" }}><span>Arm angle at the top</span><DecBox value={l.end} min={0} max={180} label="Arm angle at the top in degrees" onCommit={(n) => set({ end: n ?? l.end })} /></label>
      </div>
      <p className="faint xs">Angles are the handle arm above level, in degrees: 0 is flat, 90 is straight up. The bottom is where the rep starts.</p>
      <Field label="Which side of the pivot are the plates?">
        <Seg full value={l.offset === 180 ? 180 : 0} onChange={(offset) => set({ offset })} options={[{ v: 0, label: "Same side as the handle" }, { v: 180, label: "Opposite side" }]} label="Plate side" />
      </Field>
      <Field label="Direction you move the handle">
        <Seg full value={l.path} onChange={(path) => set({ path })} options={[{ v: "arc", label: "Along the arm's arc" }, { v: "fixed", label: "Fixed direction" }]} label="Movement path" />
      </Field>
      {l.path === "fixed" && <Field label="Pull direction (degrees from level)" hint="0 pushes or pulls horizontally, 90 straight up. Use this for a row where you pull toward your hip rather than along the arc."><DecBox value={l.pull} min={0} max={180} label="Pull direction in degrees" onCommit={(n) => set({ pull: n ?? l.pull })} /></Field>}
      <details>
        <summary className="small" style={{ cursor: "pointer" }}>Weight of the arm itself</summary>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <label className="field" style={{ flex: "1 1 140px" }}><span>Arm mass (kg)</span><DecBox value={l.armMass} min={0} max={500} label="Mass of the arm in kg" onCommit={(n) => set({ armMass: n ?? 0 })} /></label>
          <label className="field" style={{ flex: "1 1 140px" }}><span>Pivot to its centre</span><DecBox value={l.armCom} min={0} max={1000} label="Distance from pivot to the arm's centre of mass" onCommit={(n) => set({ armCom: n ?? 0 })} /></label>
        </div>
        <p className="faint xs">Adds the weight of an empty arm, which acts on the same side as the plates. Leave at 0 if unknown.</p>
      </details>

      {bad ? <p className="small" role="status">Enter two different angles and arm lengths above zero.</p> : (
        <section className="panel stack" style={{ padding: 14 }} aria-label="Result">
          <div className="row between wrap" style={{ gap: 14 }}>
            <div><div className="faint xs">Bottom</div><div className="num" style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "2rem", lineHeight: 1 }}>{f1(s.bottom)} kg</div></div>
            <div><div className="faint xs">Top</div><div className="num" style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "2rem", lineHeight: 1 }}>{f1(s.top)} kg</div></div>
            <div><div className="faint xs">Average</div><div className="num" style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "2rem", lineHeight: 1 }}>{f1(s.mean)} kg</div></div>
          </div>
          <p className="small" role="status"><b>{verdict}</b> {s.peak && s.low && Math.abs(s.peak.deg - s.low.deg) > 0 ? `Hardest at ${Math.round(s.peak.deg)}° (${f1(s.peak.kg)} kg), easiest at ${Math.round(s.low.deg)}° (${f1(s.low.kg)} kg).` : ""}</p>
          <p className="faint xs">Per 1 kg of plates you feel {f1(s.maBottom)} kg at the bottom and {f1(s.maTop)} kg at the top.</p>
          {s.assists && <p className="small">Past some point the arm assists you instead of resisting. Check the angles.</p>}
          {s.blind && <p className="small">Part of the range runs almost along the arm in a fixed direction. Those points are left out.</p>}
          <LineChart points={pts} unit="kg" height={170} />
          <div className="field"><span>Plates needed to feel this much (kg)</span><DecBox value={target} empty min={1} max={1000} label="Target resistance in kg" onCommit={setTarget} /></div>
          {tl && <p className="small">At the bottom <b className="num">{f1(tl.bottom)} kg</b> of plates, at the top <b className="num">{f1(tl.top)} kg</b>, on average <b className="num">{f1(tl.mean)} kg</b>.</p>}
        </section>
      )}
      {exercise && (
        <div className="row wrap">
          <button className="btn primary" disabled={bad} onClick={() => { setExercise(exercise, { lever: l }); say("Machine saved. Sets now show the effective load."); onSaved?.(); }}>Save for {exercise}</button>
          {saved && <button className="btn ghost" onClick={() => { setExercise(exercise, { lever: undefined }); setPreset("custom"); say("Machine geometry removed"); onSaved?.(); }}>Remove</button>}
        </div>
      )}
    </div>
  );
}

export function LeverSheet({ exercise, weight, onClose }: { exercise?: string; weight?: number | null; onClose: () => void }) {
  return <Sheet title={exercise ? `Machine: ${exercise}` : "Mechanical advantage"} onClose={onClose}><LeverTool exercise={exercise} weight={weight} onSaved={onClose} /></Sheet>;
}
void fmtW;
