import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "../store";
import { sessionDate, sortSessions } from "../lib/selectors";
import { Seg } from "./common";
import { epley } from "../lib/math";
import { BUILD, canUpdate, checkUpdate, checkWebUpdate, installUpdate, isNative } from "../native";

function save(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function More() {
  const st = useStore();
  const { settings, setSettings, library, sessions, split, muscleOf } = st;
  const [q, setQ] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const muscles = [...new Set(Object.values(library).map((d) => d.muscle))].sort();
  const dated = sortSessions(sessions).map((s) => ({ s, d: sessionDate(s, settings.mesoStart, split) }));
  const undated = dated.filter((x) => !x.d).length;

  const exportFitnotes = () => {
    const rows = ["Date,Exercise,Category,Weight (kg),Reps,Distance,Distance Unit,Time,Comment"];
    for (const { s, d } of dated) { if (!d) continue; for (const e of s.exercises) for (const x of e.sets) { if (x.weight == null || !x.reps) continue;
      const kg = e.unit === "lb" ? x.weight * 0.45359 : x.weight; rows.push([d, csv(e.exercise), csv(muscleOf(e.exercise)), kg.toFixed(2), x.reps + x.myo.reduce((a, b) => a + b, 0), "", "", "", csv(`${s.name} W${s.week}${e.unit === "pin" ? " pin" : ""}${x.rir != null ? ` RIR${x.rir}` : ""}`)].join(",")); } }
    save("ledger-fitnotes.csv", rows.join("\n"), "text/csv");
  };
  const exportCsv = () => {
    const rows = ["meso,week,session,date,letter,exercise,muscle,set,weight,unit,reps,myo,rir,e1rm_kg"];
    for (const { s, d } of dated) for (const e of s.exercises) e.sets.forEach((x, i) => rows.push([s.meso, s.week, csv(s.name), d ?? "", e.letter, csv(e.exercise), csv(muscleOf(e.exercise)), i + 1, x.weight ?? "", e.unit ?? "kg", x.reps ?? "", csv(x.myo.join("+")), x.rir ?? "", x.weight && x.reps && e.unit !== "pin" ? epley(e.unit === "lb" ? x.weight * 0.45359 : x.weight, x.reps).toFixed(1) : ""].join(",")));
    save("ledger-log.csv", rows.join("\n"), "text/csv");
  };

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>More</h1><p className="sub">Settings, exercise library and your data.</p></div></div>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Training</h3>
        <div className="field"><span>Progression mode</span><Seg full value={settings.mode} onChange={(mode) => setSettings({ mode })} options={[{ v: "sheet", label: "Sheet only" }, { v: "feedback", label: "Sheet + feedback" }, { v: "auto", label: "Auto" }]} /></div>
        <p className="dim small">Sheet only follows your periodization targets. Sheet + feedback asks for pump, workload and soreness, then proposes set changes you accept. Auto applies them for you, capped at MRV.</p>
        <label className="field"><span>Mesocycle start date (needed to date the old sessions)</span><input type="date" className="input" value={settings.mesoStart ?? ""} onChange={(e) => setSettings({ mesoStart: e.target.value || null })} /></label>
        <label className="field"><span>Rest timer (seconds)</span><input className="input num" inputMode="numeric" value={settings.restSec} onChange={(e) => setSettings({ restSec: Math.max(15, Number(e.target.value) || 150) })} /></label>
        <div className="row"><label className="field" style={{ flex: 1 }}><span>Bar (kg)</span><input className="input num" inputMode="decimal" value={settings.bar} onChange={(e) => setSettings({ bar: Number(e.target.value) || 20 })} /></label>
          <label className="field" style={{ flex: 2 }}><span>Plates per side (kg)</span><input className="input num" defaultValue={settings.plates.join(", ")} onBlur={(e) => setSettings({ plates: e.target.value.split(/[ ,]+/).map(Number).filter((n) => n > 0) })} /></label></div>
        <div className="field"><span>Theme</span><Seg full value={settings.theme} onChange={(theme) => { setSettings({ theme }); }} options={[{ v: "auto", label: "System" }, { v: "dark", label: "Dark" }, { v: "light", label: "Light" }]} /></div>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Exercise library</h3>
        <input className="input" placeholder="Find an exercise" aria-label="Find an exercise" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list">{Object.values(library).filter((d) => d.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.guessed === b.guessed ? a.name.localeCompare(b.name) : a.guessed ? -1 : 1)).slice(0, 40).map((d) => (
          <div key={d.name} className="row between wrap" style={{ padding: "10px 0" }}>
            <div><b>{d.name}</b>{d.guessed && <span className="pill warn" style={{ marginLeft: 8 }}>Guessed</span>}</div>
            <div className="row">
              <select className="input" style={{ width: 170 }} aria-label={`${d.name} muscle`} value={d.muscle} onChange={(e) => st.setExercise(d.name, { muscle: e.target.value })}>{[...new Set([...muscles, "Unknown"])].map((m) => <option key={m}>{m}</option>)}</select>
              <select className="input" style={{ width: 84 }} aria-label={`${d.name} unit`} value={d.unit} onChange={(e) => st.setExercise(d.name, { unit: e.target.value as "kg" | "lb" | "pin" })}><option value="kg">kg</option><option value="lb">lb</option><option value="pin">pin</option></select>
              <input className="input num" style={{ width: 70 }} inputMode="decimal" aria-label={`${d.name} load step`} defaultValue={d.increment} onBlur={(e) => st.setExercise(d.name, { increment: Number(e.target.value) || d.increment })} />
            </div>
          </div>))}</div>
        <p className="faint xs">Load step is how much the app adds once you hit the top of the rep range.</p>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>App updates</h3>
        <p className="dim small">Version: build {BUILD}{isNative ? " (Android app)" : ""}. {canUpdate ? "Updates download from GitHub and install over the current app. Your data stays." : "The web app updates itself. Reload after a new release if it has not already."}</p>
        {st.updateNote && <p className="small" role="status">{st.updateNote}</p>}
        <div className="row wrap"><button className="btn" onClick={async () => {
          try {
            if (canUpdate) { const u = await checkUpdate(true); useStore.setState({ update: u, updateNote: u && !u.available ? `You have the latest version (build ${u.current}).` : u ? `Build ${u.latest} is ready.` : "" }); }
            else { const r = await checkWebUpdate(); useStore.setState({ updateNote: r === "unsupported" ? "Update checks work once the app is installed from the website." : "Checked. If a newer version exists it installs and reloads in a moment." }); }
          } catch { useStore.setState({ updateNote: "Could not check for updates. Try again when online." }); }
        }}>Check for updates</button>
        {st.update?.available && <button className="btn primary" onClick={() => installUpdate(st.update!.url).then((r) => r.needsPermission && st.say("Allow installs from Ledger, then tap Download again")).catch(() => st.say("Could not download the update."))}>Download build {st.update.latest}</button>}</div>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Your data</h3>
        <p className="dim small">Everything is stored on this device and works offline. Back it up before clearing browser data.</p>
        <div className="row wrap">
          <button className="btn" onClick={async () => save(`ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, await st.exportAll(), "application/json")}><Download size={18} /> Backup (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}><Upload size={18} /> Restore backup</button>
          <button className="btn" onClick={exportCsv}><Download size={18} /> Log as CSV</button>
          <button className="btn" onClick={exportFitnotes} disabled={undated === dated.length}><Download size={18} /> FitNotes CSV</button>
        </div>
        {undated > 0 && <p className="faint xs">{undated} older sessions have no date. Set the mesocycle start date above and they are dated by your weekly split.</p>}
        <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await st.importAll(await f.text()); st.say("Backup restored"); } catch (err) { st.say((err as Error).message); } e.target.value = ""; }} />
        <button className="btn danger" style={{ justifySelf: "start" }} onClick={() => confirm("Erase everything and reload your imported training history?") && st.resetAll()}>Reset to imported history</button>
      </section>
    </div>
  );
}
