import { useEffect, useState } from "react";
import { ProgramPicker } from "./Programs";
import { useStore } from "../store";
import { mesoLabel } from "../lib/selectors";
import { effectiveSessions, pumpLabels } from "../lib/progression";
import { Seg } from "./common";
import { MesoEditor, SplitEditor } from "./Builder";
import { LogSheet } from "./LogSheet";
import { muscleColor } from "../lib/groups";
import type { CSSProperties } from "react";
import { CoachInbox } from "./CoachInbox";
import type { SplitRow } from "../data/templates";

export function Plan() {
  const { mesos, settings, adjustments, muscleOf, setSettings, feedback, split: globalSplit, saveSplit, saveMeso, say } = useStore();
  const [view, setView] = useState<"plan" | "sheet">("plan");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SplitRow[] | null>(null);
  const [mesoId, setMesoId] = useState(settings.activeMeso);
  const [week, setWeek] = useState(settings.week);
  const [picking, setPicking] = useState(false);
  useEffect(() => { setMesoId(settings.activeMeso); setWeek(settings.week); }, [settings.activeMeso]);
  const meso = mesos.find((m) => m.id === mesoId) ?? mesos[0];
  if (picking) return <div className="stack-lg"><div className="page-head"><div><h1>New program</h1><p className="sub">It becomes your active block. Earlier blocks and logs stay.</p></div><button className="btn ghost" onClick={() => setPicking(false)}>Cancel</button></div><ProgramPicker onDone={() => setPicking(false)} /></div>;
  if (!meso) return null;
  if (editing) return <div className="stack-lg"><div className="page-head"><div><h1>Edit sessions</h1><p className="sub">{meso.name}</p></div></div><MesoEditor meso={meso} week={week} onClose={() => setEditing(false)} /></div>;
  const base = meso.weeks.find((w) => w.week === week);
  const own = base?.split;
  const split = own ?? globalSplit;
  const eff = effectiveSessions(meso, week, adjustments, muscleOf);
  const ledger = adjustments.filter((a) => a.meso === mesoId).sort((a, b) => a.week - b.week);
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Plan</h1><p className="sub">Your mesocycles, with feedback changes layered on top.</p></div><div className="row"><button className="btn" onClick={() => setEditing(true)}>Edit sessions</button><button className="btn" onClick={() => setPicking(true)}>New program</button></div></div>
      <CoachInbox />
      <Seg full value={view} onChange={setView} options={[{ v: "plan", label: "Plan" }, { v: "sheet", label: "Log sheet" }]} label="View" />
      <div className="row wrap">
        <Seg value={mesoId} onChange={(v) => { setMesoId(v); setWeek(1); }} options={mesos.map((m) => ({ v: m.id, label: mesoLabel(m.name) }))} label="Mesocycle" />
        <Seg value={week} onChange={setWeek} options={meso.weeks.map((w) => ({ v: w.week, label: `W${w.week}` }))} label="Week" />
      </div>
      {mesoId !== settings.activeMeso && <div className="row"><span className="dim small">This is an earlier block.</span><button className="btn sm" onClick={() => setSettings({ activeMeso: mesoId, week })}>Make it active</button></div>}

      {view === "sheet" && <LogSheet mesoId={mesoId} />}
      {view === "plan" && eff.map((s) => {
        const sets = s.items.reduce((a, i) => a + i.sets, 0);
        const baseSets = base?.sessions.find((x) => x.name === s.name)?.items.reduce((a, i) => a + i.sets, 0) ?? sets;
        return (
          <section key={s.name} className="panel" style={{ padding: 16 }}>
            <div className="row between"><h2>{s.name}</h2><span className="pill">{sets} sets{sets !== baseSets ? ` (${sets > baseSets ? "+" : ""}${sets - baseSets})` : ""}</span></div>
            <table className="t"><thead><tr><th>Lift</th><th>Sets</th><th>Reps</th><th>RIR</th></tr></thead><tbody>
              {s.items.map((i, k) => {
                const b = base?.sessions.find((x) => x.name === s.name)?.items[k];
                const delta = b ? i.sets - b.sets : 0;
                return <tr key={i.letter + i.exercise}><td><div className="ex-cell" style={{ "--mc": muscleColor(muscleOf(i.exercise)) } as CSSProperties}><span><b>{i.letter}</b> {i.exercise}<div className="faint xs">{i.desc ?? muscleOf(i.exercise)}</div></span></div></td>
                  <td className="num">{i.sets}{delta !== 0 && <span className={`pill ${delta > 0 ? "ok" : "warn"}`} style={{ marginLeft: 6 }}>{delta > 0 ? "+" : ""}{delta}</span>}</td>
                  <td className="num">{i.repLo ?? "-"}{i.repHi && i.repHi !== i.repLo ? `-${i.repHi}` : ""}</td><td className="num">{i.rir ?? "-"}</td></tr>;
              })}
            </tbody></table>
          </section>
        );
      })}

      {view === "plan" && <section className="panel stack" style={{ padding: 16 }}>
        <h3>Feedback ledger</h3>
        {ledger.length === 0 ? <p className="dim">No set changes yet. Finish a session, rate pump and workload, then rate soreness next time you train the muscle.</p> :
          <table className="t"><thead><tr><th>Week</th><th>Muscle</th><th>Sets</th></tr></thead><tbody>{ledger.map((a) => <tr key={a.id}><td>W{a.week}</td><td>{a.muscle}</td><td className="num">{a.delta > 0 ? "+" : ""}{a.delta}</td></tr>)}</tbody></table>}
        <p className="faint xs">Pending ratings: {feedback.filter((f) => f.soreness == null).length}. Pump scale: {pumpLabels.join(", ")}.</p>
      </section>}

      {view === "plan" && <section className="panel stack" style={{ padding: 16 }}>
        <div className="row between"><h3>Weekly split{own ? `, week ${week}` : ""}</h3>
          {draft ? <div className="row"><button className="btn sm ghost" onClick={() => setDraft(null)}>Cancel</button><button className="btn sm primary" onClick={() => { if (own) saveMeso({ ...meso, weeks: meso.weeks.map((w) => (w.week === week ? { ...w, split: draft } : w)) }); else saveSplit(draft); setDraft(null); say("Weekly split saved"); }}>Save</button></div>
            : <button className="btn sm" onClick={() => setDraft(split.length ? split : [])}>Edit week</button>}</div>
        {draft ? <SplitEditor split={draft} sessions={eff.map((s) => s.name)} onChange={setDraft} />
          : <table className="t"><tbody>{split.map((d) => <tr key={d.day}><td>{d.day}</td><td><b>{d.session}</b></td><td className="dim">{d.emphasis}</td></tr>)}</tbody></table>}
      </section>}
    </div>
  );
}
