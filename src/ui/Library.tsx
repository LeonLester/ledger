import { useMemo, useState, type CSSProperties } from "react";
import { Copy, Plus, Trash2, Wand2, X } from "lucide-react";
import { useStore } from "../store";
import { muscleColor } from "../lib/groups";
import { suggestContrib } from "../lib/muscles";
import { defaultIncrement } from "../lib/math";
import { DEFAULT_RIR_TYPES } from "../lib/rir";
import type { ExerciseDef, Unit } from "../types";
import { DecBox, Seg, Sheet } from "./common";
import { LeverSheet } from "./Lever";
import { distFit, r1, trueRes } from "../lib/mech";

const SHARES = [0.25, 0.33, 0.5, 0.75, 1];
const BW_SHARES = [0, 0.25, 0.33, 0.5, 0.65, 0.75, 0.9, 1];
const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (t: string) => { const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** The exercise library: one row per exercise, grouped by the muscle that limits it. Tap a row to edit everything about it. */
export function Library() {
  const { library, suggestAllContrib, say } = useStore();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [edit, setEdit] = useState<string | "new" | null>(null);
  const muscles = useMemo(() => [...new Set(Object.values(library).flatMap((d) => [d.muscle, ...Object.keys(d.contrib ?? {})]))].sort(), [library]);
  const primaries = useMemo(() => [...new Set(Object.values(library).map((d) => d.muscle))].sort(), [library]);
  const groups = useMemo(() => {
    const out = new Map<string, ExerciseDef[]>();
    for (const d of Object.values(library).sort((a, b) => a.name.localeCompare(b.name))) {
      if (muscle !== "all" && d.muscle !== muscle) continue;
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) continue;
      out.set(d.muscle, [...(out.get(d.muscle) ?? []), d]);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [library, q, muscle]);
  const count = groups.reduce((a, [, l]) => a + l.length, 0);
  const hits = (d: ExerciseDef) => Object.entries(d.contrib ?? {}).map(([m, f]) => `${m} ${pct(f)}`).join(", ");
  const extras = (d: ExerciseDef) => [d.bwf ? `+${pct(d.bwf)} BW` : "", d.base ? `base ${d.base} kg` : ""].filter(Boolean).join(", ");
  return (
    <section className="panel stack" style={{ padding: 16 }}>
      <div className="row between"><h3>Exercise library</h3><button className="btn sm" onClick={() => setEdit("new")}><Plus size={16} /> Add</button></div>
      <p className="dim small">Each exercise has a primary muscle, the one that fails first, and secondary muscles that earn a share of each set toward their weekly volume. Tap an exercise to edit it.</p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" placeholder="Find an exercise" aria-label="Find an exercise" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 150, flex: "none" }} aria-label="Primary muscle filter" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="all">All muscles</option>{primaries.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="lib-scroll" tabIndex={0} aria-label="Exercise library table">
        <table className="lib">
          <thead><tr><th className="lib-n">Exercise</th><th>Also hits</th><th>Load</th></tr></thead>
          <tbody>
            {groups.map(([m, list]) => [
              <tr key={`h-${m}`} className="lib-h" style={{ "--mc": muscleColor(m) } as CSSProperties}><td colSpan={3}><span className="sw" /><b>{m}</b> <span className="faint xs">{list.length}</span></td></tr>,
              ...list.map((d) => (
                <tr key={d.name} className="lib-row" style={{ "--mc": muscleColor(d.muscle) } as CSSProperties} onClick={() => setEdit(d.name)}>
                  <td className="lib-n"><button className="lib-open" aria-label={`Edit ${d.name}`}>{d.name}{d.guessed && <span className="pill warn" style={{ marginLeft: 6 }}>?</span>}</button></td>
                  <td className="lib-txt">{hits(d) || <span className="faint">only {d.muscle}</span>}</td>
                  <td className="lib-txt">{d.unit}{d.increment ? `, step ${d.increment}` : ""}{extras(d) ? `, ${extras(d)}` : ""}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
        {count === 0 && <p className="dim small" style={{ padding: 14 }}>No exercises match.</p>}
      </div>
      <div className="row between wrap">
        <span className="faint xs">{count} exercises. A ? marks a guessed muscle.</span>
        <button className="btn sm" onClick={() => say(`Added contributors to ${suggestAllContrib()} exercises`)}><Wand2 size={16} /> Suggest contributors</button>
      </div>
      {edit && <ExerciseEditor key={edit} name={edit === "new" ? null : edit} muscles={muscles} onClose={() => setEdit(null)} onDuplicate={(n) => setEdit(n)} />}
    </section>
  );
}

export function ExerciseEditor({ name, muscles, onClose, initialName, onSaved, onDuplicate }: { name: string | null; muscles: string[]; onClose: () => void; initialName?: string; onSaved?: (name: string) => void; onDuplicate?: (name: string) => void }) {
  const { library, setExercise, removeExercise, renameExercise, say } = useStore();
  const def = name ? library[name] : undefined;
  const [f, setF] = useState({
    name: def?.name ?? initialName ?? "", muscle: def?.muscle ?? "", unit: (def?.unit ?? "kg") as Unit, step: String(def?.increment ?? 2.5),
    bwf: def?.bwf ?? 0, base: def?.base ? String(def.base) : "", note: def?.note ?? "", rirType: def?.rirType ?? "",
  });
  const [mode, setMode] = useState<"none" | "dist" | "lever">(def?.lever ? "lever" : def?.ma ? "dist" : "none");
  const [ma, setMa] = useState({ dxVer: def?.ma?.dxVer ?? 0, dx: def?.ma?.dx ?? 0 });
  const [leverOpen, setLeverOpen] = useState(false);
  const [probe, setProbe] = useState(100);
  const types = useStore.getState().settings.rirTypes ?? DEFAULT_RIR_TYPES;
  const [rows, setRows] = useState<{ m: string; f: number }[]>(Object.entries(def?.contrib ?? {}).map(([m, v]) => ({ m, f: v })));
  const setRow = (i: number, p: Partial<{ m: string; f: number }>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = () => {
    const nm = f.name.trim();
    if (!nm) { say("Give the exercise a name"); return; }
    if (!f.muscle.trim()) { say("Pick the primary muscle"); return; }
    let key = name ?? nm;
    if (name && nm !== name) {
      if (library[nm] && !confirm(`${nm} already exists. Merge ${name} into it? Plans and logs are moved over.`)) return;
      renameExercise(name, nm); key = nm;
    } else if (!name && library[nm]) { say("That exercise exists already"); return; }
    const contrib = Object.fromEntries(rows.filter((r) => r.m.trim() && r.m.trim() !== f.muscle.trim() && r.f > 0).map((r) => [r.m.trim(), r.f]));
    setExercise(key, {
      muscle: f.muscle.trim(), unit: f.unit, increment: num(f.step) || defaultIncrement(f.unit),
      contrib: Object.keys(contrib).length ? contrib : undefined, bwf: f.bwf || undefined, base: num(f.base) || undefined, note: f.note.trim() || undefined, rirType: f.rirType || undefined,
      ma: mode === "dist" && distFit(ma) ? { dxVer: ma.dxVer, dx: ma.dx } : undefined,
      ...(mode === "lever" ? {} : { lever: undefined }),
    });
    say(name ? "Saved" : `${nm} added`); onSaved?.(key); onClose();
  };
  return (
    <Sheet title={name ? "Edit exercise" : "New exercise"} onClose={onClose}>
      <div className="stack">
        <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <datalist id="ed-muscles">{muscles.map((m) => <option key={m} value={m} />)}</datalist>
        <label className="field"><span>Primary muscle (the one that fails first)</span><input className="input" list="ed-muscles" value={f.muscle} onChange={(e) => setF({ ...f, muscle: e.target.value })} /></label>

        <div className="stack" style={{ gap: 8 }}>
          <div className="row between"><b>Also hits</b>
            <button className="btn ghost sm" onClick={() => { const s = suggestContrib(f.name, f.muscle); if (s) setRows(Object.entries(s).map(([m, v]) => ({ m, f: v }))); else say("No suggestion for this name"); }}><Wand2 size={16} /> Suggest</button></div>
          <p className="faint xs">Muscles that come close to failure when the primary one fails. The share is how much of a set counts toward that muscle's weekly volume.</p>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
              <input className="input" list="ed-muscles" aria-label="Contributing muscle" placeholder="Muscle" value={r.m} onChange={(e) => setRow(i, { m: e.target.value })} />
              <select className="input" style={{ width: 84, flex: "none" }} aria-label="Share of a set" value={SHARES.includes(r.f) ? r.f : 0.5} onChange={(e) => setRow(i, { f: Number(e.target.value) })}>{SHARES.map((v) => <option key={v} value={v}>{pct(v)}</option>)}</select>
              <button className="btn ghost icon sm" aria-label="Remove muscle" onClick={() => setRows(rows.filter((_, k) => k !== i))}><X size={16} /></button>
            </div>
          ))}
          <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setRows([...rows, { m: "", f: 0.5 }])}><Plus size={16} /> Add muscle</button>
        </div>

        <label className="field"><span>Default RIR type</span><select className="input" value={f.rirType} onChange={(e) => setF({ ...f, rirType: e.target.value })}><option value="">None</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.start} to {t.end})</option>)}</select></label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="field" style={{ width: 90 }}><span>Unit</span><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}><option>kg</option><option>lb</option><option>pin</option></select></label>
          <label className="field" style={{ flex: 1 }}><span>Load step</span><input className="input num" inputMode="decimal" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} /></label>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>Body and machine load</b>
          <label className="field"><span>Bodyweight counts as</span>
            <select className="input" value={f.bwf} onChange={(e) => setF({ ...f, bwf: Number(e.target.value) })}>{BW_SHARES.map((v) => <option key={v} value={v}>{v === 0 ? "Nothing" : pct(v) + " of bodyweight"}</option>)}</select></label>
          <label className="field"><span>Weight of the machine or implement, in kg</span><input className="input num" inputMode="decimal" placeholder="0" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} /></label>
          <p className="faint xs">What you log is added to these. Log a negative weight such as -20 for an assisted pull-up. Estimated 1RM, records and tonnage use the total.</p>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>True resistance</b>
          <p className="faint xs">Machines rarely load you with the weight on the stack. Enter how the load moves and the logger shows the real resistance next to the weight.</p>
          <Seg full value={mode} onChange={setMode} label="True resistance method" options={[{ v: "none", label: "Off" }, { v: "dist", label: "Distances" }, { v: "lever", label: "Lever" }]} />
          {mode === "dist" && (
            <>
              <div className="row wrap">
                <label className="field" style={{ flex: "1 1 130px" }}><span>Load rises (vertical)</span><DecBox value={ma.dxVer || null} empty min={0.1} max={10000} label="Vertical distance the load moves" onCommit={(n) => setMa({ ...ma, dxVer: n ?? 0 })} /></label>
                <label className="field" style={{ flex: "1 1 130px" }}><span>Your limb travels</span><DecBox value={ma.dx || null} empty min={0.1} max={10000} label="Distance your limb or body moves" onCommit={(n) => setMa({ ...ma, dx: n ?? 0 })} /></label>
              </div>
              <p className="faint xs">Measure both over the same rep, in any unit. A 45 degree leg press: the sled travels 100 cm and rises 71 cm, so 100 kg feels like 71 kg.</p>
            </>
          )}
          {mode === "dist" && distFit(ma) && (
            <div className="row" style={{ alignItems: "end" }}>
              <label className="field" style={{ width: 110 }}><span>Weight ({f.unit})</span><DecBox value={probe} min={1} max={2000} label="Example weight" onCommit={(n) => setProbe(n ?? 100)} /></label>
              <p className="small" style={{ paddingBottom: 12 }}>feels like <b className="num">{r1(trueRes(distFit(ma)!, probe))} {f.unit}</b></p>
            </div>
          )}
          {mode === "lever" && (name
            ? <div className="row wrap"><button className="btn" onClick={() => setLeverOpen(true)}>{def?.lever ? "Edit lever geometry" : "Set lever geometry"}</button><span className="faint xs">{def?.lever ? "Saved. True resistance uses the average over the rep." : "Not set yet."}</span></div>
            : <p className="faint xs">Add the exercise first, then open it to set the lever geometry.</p>)}
          {leverOpen && name && <LeverSheet exercise={name} weight={null} onClose={() => setLeverOpen(false)} />}
        </div>

        <label className="field"><span>Note shown every time you log this exercise</span><textarea className="input" style={{ minHeight: 84, padding: 10 }} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Seat setting, grip, pin position" /></label>

        <button className="btn primary" onClick={save}>{name ? "Save" : "Add to library"}</button>
        {name && def && onDuplicate && <button className="btn" onClick={() => {
          let k = 1; while (library[`${name} (${k})`]) k++;
          const copy = `${name} (${k})`; setExercise(copy, { ...def, name: copy }); say(`Duplicated as ${copy}. Rename it to tell the machines apart.`); onDuplicate(copy);
        }}><Copy size={16} /> Duplicate</button>}
        {name && <button className="btn danger" onClick={() => confirm(`Remove ${name} from the library? Logged history is kept.`) && (removeExercise(name), onClose())}><Trash2 size={16} /> Remove from library</button>}
      </div>
    </Sheet>
  );
}

/** every muscle name in the library, primary or contributing, for pickers */
export function useAllMuscles() {
  const library = useStore((s) => s.library);
  return useMemo(() => [...new Set(Object.values(library).flatMap((d) => [d.muscle, ...Object.keys(d.contrib ?? {})]))].sort(), [library]);
}
