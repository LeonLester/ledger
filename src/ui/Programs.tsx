import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useStore } from "../store";
import { LIFTS, LIFT_LABEL } from "../data/catalog";
import { buildSplit, TEMPLATES, type Template } from "../data/templates";
import { PROGRAMS, trainingMaxes, type Maxes, type Program } from "../data/programs";
import { Seg, Sheet } from "./common";
import { ProgramBuilder } from "./Builder";

const Stepper = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) => (
  <div className="field"><span>{label}</span>
    <div className="row"><button className="btn icon" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>-</button>
      <b className="num" style={{ minWidth: 28, textAlign: "center", fontSize: "1.3rem" }}>{value}</b>
      <button className="btn icon" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></div></div>
);

function SplitConfig({ t, onClose, onDone }: { t: Template; onClose: () => void; onDone: () => void }) {
  const { createProgram } = useStore();
  const [freq, setFreq] = useState(3);
  const [upper, setUpper] = useState(3);
  const [lower, setLower] = useState(2);
  const o = { freq, upper, lower };
  return (
    <Sheet title={t.name} onClose={onClose}>
      <p className="dim small">{t.blurb}</p>
      {t.opts === "freq" && <div className="field"><span>Sessions per week</span><Seg full value={freq} onChange={setFreq} options={[2, 3, 4, 5, 6].map((v) => ({ v, label: String(v) }))} label="Sessions per week" /></div>}
      {t.opts === "ul" && <div className="row" style={{ gap: 28 }}><Stepper label="Upper sessions" value={upper} min={1} max={4} onChange={setUpper} /><Stepper label="Lower sessions" value={lower} min={1} max={4} onChange={setLower} /></div>}
      <div className="row wrap" style={{ gap: 6 }} aria-label="Week layout">
        {buildSplit(t, o, "preview").split.map((r) => <span key={r.day} className={`pill ${r.session === "Rest" ? "" : "acc"}`}><b>{r.day.slice(0, 3)}</b> {r.session}</span>)}
      </div>
      <p className="faint xs">Five weeks: four building weeks with falling RIR, then a deload. Sets per muscle then follow your pump and soreness ratings.</p>
      <button className="btn primary" onClick={async () => { await createProgram((id) => buildSplit(t, o, id)); onDone(); }}>Start this split</button>
    </Sheet>
  );
}

function PlConfig({ p, onClose, onDone }: { p: Program; onClose: () => void; onDone: () => void }) {
  const { createProgram, settings, setSettings, addBodyweight } = useStore();
  const [m, setM] = useState<Record<string, string>>(Object.fromEntries(LIFTS.map((l) => [l, settings.tms?.[l] ? String(Math.round(settings.tms[l]! / p.tmFactor)) : ""])));
  const [bw, setBw] = useState("");
  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const maxes = Object.fromEntries(LIFTS.map((l) => [l, num(m[l])])) as unknown as Maxes;
  return (
    <Sheet title={p.name} onClose={onClose}>
      <p className="dim small">{p.blurb}</p>
      <p className="small"><b>{p.level}</b>, {p.days} days a week, {p.weeks} weeks{p.tmFactor < 1 ? `, training max ${Math.round(p.tmFactor * 100)}% of your 1RM` : ""}.</p>
      <div className="field"><span>Your current 1RM or best estimate (kg). Leave blank to enter loads yourself.</span></div>
      <div className="row wrap">{LIFTS.map((l) => <label key={l} className="field" style={{ flex: "1 1 120px" }}><span>{LIFT_LABEL[l]}</span><input className="input num" inputMode="decimal" value={m[l]} onChange={(e) => setM({ ...m, [l]: e.target.value })} /></label>)}</div>
      <div className="row wrap">
        <label className="field" style={{ flex: "1 1 120px" }}><span>Bodyweight (kg, optional)</span><input className="input num" inputMode="decimal" value={bw} onChange={(e) => setBw(e.target.value)} /></label>
        <div className="field" style={{ flex: "1 1 160px" }}><span>For DOTS score</span><Seg full value={settings.sex ?? "m"} onChange={(sex) => setSettings({ sex })} options={[{ v: "m", label: "Male" }, { v: "f", label: "Female" }]} label="Sex" /></div>
      </div>
      <button className="btn primary" onClick={async () => {
        if (num(bw)) addBodyweight(num(bw));
        await createProgram((id) => ({ ...p.build(id), tms: trainingMaxes(p, maxes) }));
        onDone();
      }}>Start this program</button>
    </Sheet>
  );
}

export function ProgramPicker({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<"split" | "pl" | "custom">("split");
  const { createProgram } = useStore();
  const [t, setT] = useState<Template | null>(null);
  const [p, setP] = useState<Program | null>(null);
  return (
    <div className="stack">
      <Seg full value={tab} onChange={setTab} options={[{ v: "split", label: "Splits" }, { v: "pl", label: "Powerlifting" }, { v: "custom", label: "Custom" }]} label="Program type" />
      {tab === "custom" ? <ProgramBuilder saveLabel="Start this program" onSave={async (g) => { await createProgram(g); onDone(); }} /> : <div className="panel list">
        {tab === "split" ? TEMPLATES.map((x) => (
          <button key={x.id} className="sess-row" onClick={() => setT(x)}><div><div className="name" style={{ fontSize: "1.3rem" }}>{x.name}</div><div className="dim small">{x.blurb}</div></div><span className="pill">{x.opts ? "Custom" : `${x.sessions} days`}</span></button>
        )) : PROGRAMS.map((x) => (
          <button key={x.id} className="sess-row" onClick={() => setP(x)}><div><div className="name" style={{ fontSize: "1.3rem" }}>{x.name}</div><div className="dim small">{x.blurb}</div></div><span className="pill">{x.level}, {x.days}d</span></button>
        ))}
      </div>}
      {t && <SplitConfig t={t} onClose={() => setT(null)} onDone={onDone} />}
      {p && <PlConfig p={p} onClose={() => setP(null)} onDone={onDone} />}
    </div>
  );
}

export function Welcome() {
  const st = useStore();
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="main" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="stack-lg">
        <div className="page-head"><div><h1>Ledger</h1><p className="sub">An offline training log with auto-regulated sets, PR checks and bar path tracking. Your log works offline and syncs to your account.</p></div></div>
        {!picking ? (
          <div className="stack">
            <button className="panel sess-row" onClick={() => setPicking(true)}><div><div className="name">Pick a program</div><div className="dim small">Upper lower, PPL, full body, any X and Y split, or a powerlifting program.</div></div></button>
            <button className="panel sess-row" onClick={() => st.loadSample()}><div><div className="name">Load sample data</div><div className="dim small">Three real mesocycles of logged training, with PR checks and volume ready to explore. You can reset it later.</div></div></button>
            <button className="btn" style={{ justifySelf: "start" }} onClick={() => file.current?.click()}><Upload size={18} /> Restore a backup</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await st.importAll(await f.text()); } catch (err) { st.say((err as Error).message); } e.target.value = ""; }} />
          </div>
        ) : (
          <div className="stack"><button className="btn ghost" style={{ justifySelf: "start" }} onClick={() => setPicking(false)}>Back</button><ProgramPicker onDone={() => setPicking(false)} /></div>
        )}
      </div>
    </div>
  );
}
