import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useStore } from "../store";
import { effectiveSessions, pumpLabels } from "../lib/progression";
import { SessionView } from "./SessionView";
import { ModeMenu, Seg } from "./common";
import { installUpdate } from "../native";
import { CoachInbox } from "./CoachInbox";

export function Train() {
  const { update, openSession, settings, mesos, sessions, adjustments, split, feedback, muscleOf, setSettings, startSession, resolveFeedback } = useStore();
  if (openSession) return <SessionView id={openSession} />;
  const meso = mesos.find((m) => m.id === settings.activeMeso);
  if (!meso) return null;
  const weeks = meso.weeks.map((w) => w.week);
  const week = settings.week;
  const weekSplit = meso.weeks.find((w) => w.week === week)?.split ?? split;
  const planned = effectiveSessions(meso, week, adjustments, muscleOf);
  const doneIds = new Set(sessions.filter((s) => s.status === "done").map((s) => s.id));
  const activeIds = new Set(sessions.filter((s) => s.status === "active").map((s) => s.id));
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const flex = !!meso.flexible;
  const todaySess = flex ? undefined : weekSplit.find((s) => s.day === today)?.session;
  const todayName = planned.find((p) => p.name === todaySess || (todaySess === "Legs 1" && p.name === "Lower 1") || (todaySess === "Legs 2" && p.name === "Lower 2") || (!!todaySess && p.name.startsWith(todaySess + " ")))?.name;
  const nextUp = flex ? planned.find((p) => !doneIds.has(`${meso.id}w${week}-${p.name}`))?.name : undefined;
  const suggestions = feedback.filter((f) => f.state === "pending" && f.delta != null && f.delta !== 0);
  const emph = (n: string) => flex ? undefined : weekSplit.find((s) => s.session === n || (n.startsWith("Lower") && s.session === n.replace("Lower", "Legs")))?.emphasis;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>{meso.name}</h1><p className="sub">Week {week} of {weeks.length}{meso.deload !== false && week === weeks[weeks.length - 1] ? ", deload" : ""}</p></div>
        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <Seg value={settings.mode} onChange={(mode) => setSettings({ mode })} options={[{ v: "sheet", label: "Sheet" }, { v: "feedback", label: "Feedback" }, { v: "auto", label: "Auto" }]} label="Progression mode" />
          <ModeMenu value={settings.mode} onChange={(mode) => setSettings({ mode })} />
        </div>
      </div>

      <CoachInbox />

      {update?.available && (
        <section className="panel row between wrap" style={{ padding: 14 }} role="status">
          <div><b>Update ready</b><div className="dim small">Build {update.latest} is out. You have build {update.current}.</div></div>
          <div className="row"><button className="btn sm ghost" onClick={() => useStore.setState({ update: null })}>Later</button>
            <button className="btn sm primary" onClick={() => { useStore.getState().say("Downloading the update"); installUpdate(update.url).then((r) => r.needsPermission && useStore.getState().say("Allow installs from Ledger, then tap Download again")).catch(() => useStore.getState().say("Could not download the update. Try again when online.")); }}>Download</button></div>
        </section>
      )}

      <div className="weekbar">
        <button className="btn icon" aria-label="Previous week" disabled={week <= weeks[0]} onClick={() => setSettings({ week: week - 1 })}><ChevronLeft /></button>
        <div className="wk">Week {week}</div>
        <button className="btn icon" aria-label="Next week" disabled={week >= weeks[weeks.length - 1]} onClick={() => setSettings({ week: week + 1 })}><ChevronRight /></button>
      </div>

      {suggestions.length > 0 && (
        <section className="panel stack" style={{ padding: 16 }} aria-label="Set suggestions">
          <h3>Next week's sets</h3>
          <div className="list">
            {suggestions.map((f) => (
              <div key={f.id} className="row between wrap" style={{ padding: "12px 0", gap: 10 }}>
                <div>
                  <b>{f.muscle}</b> <span className={`pill ${f.delta! > 0 ? "ok" : "warn"}`}>{f.delta! > 0 ? "+" : ""}{f.delta} sets in week {f.week + 1}</span>
                  <div className="dim small">Pump {pumpLabels[f.pump].toLowerCase()}, soreness: {["never sore", "healed early", "healed just in time", "still sore"][f.soreness ?? 0]}</div>
                </div>
                <div className="row"><button className="btn sm ghost" onClick={() => resolveFeedback(f.id, false)}>Skip</button><button className="btn sm primary" onClick={() => resolveFeedback(f.id, true)}>Apply</button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel list" aria-label={`Sessions in week ${week}`}>
        {planned.map((p) => {
          const id = `${meso.id}w${week}-${p.name}`;
          const state = doneIds.has(id) ? "done" : activeIds.has(id) ? "active" : "todo";
          const sets = p.items.reduce((a, i) => a + i.sets, 0);
          return (
            <button key={p.name} className="sess-row" onClick={() => startSession(week, p.name)}>
              <div>
                <div className="name">{p.name}</div>
                <div className="dim small">{p.items.length} exercises, {sets} sets{emph(p.name) ? `, ${emph(p.name)}` : ""}</div>
              </div>
              <div className="row">
                {p.name === todayName && state !== "done" && <span className="pill acc">Today</span>}
                {flex && p.name === nextUp && state !== "done" && <span className="pill acc">Next up</span>}
                {state === "done" ? <span className="pill ok"><Check size={14} /> Logged</span> : state === "active" ? <span className="pill acc">In progress</span> : <span className="sess-state" aria-label="Not started" />}
              </div>
            </button>
          );
        })}
        {planned.length === 0 && <div className="empty">No sessions planned for this week.</div>}
      </section>
      {flex && planned.length > 0 && !nextUp && week < weeks[weeks.length - 1] && <button className="btn primary" onClick={() => setSettings({ week: week + 1 })}>Week {week} is done. Go to week {week + 1}</button>}
      {flex && <p className="faint xs">No fixed weekdays: train the sessions in order, whenever you can. The next one is marked.</p>}
    </div>
  );
}
