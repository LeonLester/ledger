import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "../store";
import { sessionDate, sortSessions } from "../lib/selectors";
import { Seg } from "./common";
import { Library } from "./Library";
import { DEFAULT_WARM, E1RM_LABEL, E1RM_TEXT, SCORE_LABEL, checkFormula, est1rm, formulas, parseWarm, warmText, compile, type E1rmKey, type ScoreKey } from "../lib/formulas";
import { api } from "../api";
import { LINK_PAGE, connectMealcost, disconnectMealcost, syncMealcost, useMealcost } from "../mealcost";
import { joinCoach, logout, syncNow, useSync } from "../sync";
import { APK_URL, BUILD, canUpdate, checkUpdate, checkWebUpdate, installUpdate, isNative } from "../native";

function save(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function MealcostLink() {
  const mc = useMealcost();
  const say = useStore((s) => s.say);
  const [code, setCode] = useState("");
  return (
    <section className="panel stack" style={{ padding: 16 }}>
      <h3>Mealcost</h3>
      {mc.linked ? (
        <>
          <p className="small">Connected. Your weigh-ins from Mealcost appear in Progress, Bodyweight and feed PR checks and strength scores. {mc.count ? `${mc.count} weigh-ins` : ""}{mc.last ? `, last read ${new Date(mc.last).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.</p>
          {mc.error && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{mc.error}</p>}
          <p className="faint xs">A weigh-in typed in Ledger wins over Mealcost for the same day.</p>
          <div className="row wrap"><button className="btn" disabled={mc.busy} onClick={() => void syncMealcost().then((ok) => ok && say("Weight updated from Mealcost"))}>{mc.busy ? "Reading" : "Sync now"}</button>
            <button className="btn" onClick={() => { disconnectMealcost(); say("Mealcost disconnected"); }}>Disconnect</button></div>
        </>
      ) : (
        <>
          <p className="dim small">Read your weight log from Mealcost so you only weigh in once. You need to be signed in to Mealcost with sync on. The code is read-only, covers weight only, and stays on this device.</p>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}><li>Open the Mealcost link page and create a code.</li><li>Paste it here.</li></ol>
          <div className="row wrap"><a className="btn" href={LINK_PAGE} target="_blank" rel="noreferrer">Open Mealcost</a></div>
          <div className="row"><input className="input" style={{ flex: 1 }} placeholder="Link code" aria-label="Mealcost link code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn primary" disabled={!code.trim() || mc.busy} onClick={() => connectMealcost(code).then(() => { setCode(""); say("Mealcost connected"); }).catch((e) => say(e.message))}>Connect</button></div>
          {mc.error && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{mc.error}</p>}
        </>
      )}
    </section>
  );
}

function FormulaSettings() {
  const { settings, setSettings } = useStore();
  const fx = settings.fx ?? { e1rm: "epley" as E1rmKey };
  const [custom, setCustom] = useState(fx.custom ?? "w * (1 + r / 30)");
  const [warm, setWarm] = useState(warmText(fx.warm));
  const patch = (p: Partial<typeof fx>) => setSettings({ fx: { ...fx, ...p } });
  const err = fx.e1rm === "custom" ? checkFormula(custom) : null;
  const warmOk = parseWarm(warm);
  const text = fx.e1rm === "custom" ? custom : E1RM_TEXT[fx.e1rm];
  const f = (() => { try { return compile(text); } catch { return null; } })();
  return (
    <section className="panel stack" style={{ padding: 16 }}>
      <h3>Formulas</h3>
      <p className="dim small">These drive every estimate: e1RM on charts and PR checks, the rep max table, strength scores and warm-ups.</p>
      <label className="field"><span>Estimated 1RM formula</span>
        <select className="input" value={fx.e1rm} onChange={(e) => patch({ e1rm: e.target.value as E1rmKey })}>{(Object.keys(E1RM_LABEL) as E1rmKey[]).map((k) => <option key={k} value={k}>{E1RM_LABEL[k]}{k !== "custom" ? `: ${E1RM_TEXT[k]}` : ""}</option>)}</select></label>
      {fx.e1rm === "custom" && (
        <label className="field"><span>Your formula. Use w for the load and r for reps. You can use + - * / ^ ( ), exp, ln, sqrt, min, max.</span>
          <input className="input num" value={custom} spellCheck={false} onChange={(e) => { setCustom(e.target.value); if (!checkFormula(e.target.value)) patch({ custom: e.target.value }); }} />
          {err && <span role="alert" style={{ color: "var(--red)" }}>{err}</span>}</label>
      )}
      {f && !err && <p className="faint xs num">Preview: 100 x 3 = {est1rm(100, 3).toFixed(1)}, 100 x 5 = {est1rm(100, 5).toFixed(1)}, 100 x 10 = {est1rm(100, 10).toFixed(1)}. The rep max table is worked backwards from the same formula.</p>}
      <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={!!fx.useRir} onChange={(e) => patch({ useRir: e.target.checked })} /><span>Add reps in reserve to the reps when estimating (a set of 5 at RIR 2 counts as 7)</span></label>
      <label className="field"><span>Strength score</span>
        <select className="input" value={fx.score ?? "dots"} onChange={(e) => patch({ score: e.target.value as ScoreKey })}>{(Object.keys(SCORE_LABEL) as ScoreKey[]).map((k) => <option key={k} value={k}>{SCORE_LABEL[k]}</option>)}</select></label>
      <label className="field"><span>Warm-up sets, as percent of the first working weight x reps</span>
        <input className="input num" value={warm} onChange={(e) => { setWarm(e.target.value); const w = parseWarm(e.target.value); if (w) patch({ warm: w }); }} />
        {!warmOk && <span role="alert" style={{ color: "var(--red)" }}>Use the form 40%x8, 60%x5, 80%x3.</span>}</label>
      <button className="btn" style={{ justifySelf: "start" }} onClick={() => { setSettings({ fx: undefined }); setCustom("w * (1 + r / 30)"); setWarm(warmText(DEFAULT_WARM)); }}>Reset to defaults</button>
    </section>
  );
}

export function More() {
  const st = useStore();
  const { settings, setSettings, library, sessions, split, muscleOf } = st;
  const [code, setCode] = useState("");
  const acct = useSync();
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
    for (const { s, d } of dated) for (const e of s.exercises) e.sets.forEach((x, i) => rows.push([s.meso, s.week, csv(s.name), d ?? "", e.letter, csv(e.exercise), csv(muscleOf(e.exercise)), i + 1, x.weight ?? "", e.unit ?? "kg", x.reps ?? "", csv(x.myo.join("+")), x.rir ?? "", x.weight && x.reps && e.unit !== "pin" ? est1rm(e.unit === "lb" ? x.weight * 0.45359 : x.weight, x.reps).toFixed(1) : ""].join(",")));
    save("ledger-log.csv", rows.join("\n"), "text/csv");
  };

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>More</h1><p className="sub">Settings, exercise library and your data.</p></div></div>


      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Account</h3>
        <div><b>{acct.user?.name}</b><div className="dim small">{acct.user?.email}{acct.user?.role === "coach" ? ", coach" : ""}</div></div>
        <p className="dim small" role="status">{acct.status === "syncing" ? "Syncing" : acct.status === "offline" ? "Offline. Changes sync when you are back online." : acct.status === "error" ? `Sync problem: ${acct.error}` : acct.last ? `Synced at ${new Date(acct.last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not synced yet"}</p>
        {acct.user?.role === "coach" ? <p className="small">Your coach code is <b className="num" style={{ letterSpacing: ".1em" }}>{acct.user.invite}</b>. Clients enter it when they sign up.</p>
          : acct.user?.coachId ? <div className="row between wrap"><span className="small">Your coach: <b>{acct.user.coachName ?? "linked"}</b>. They can see your log and send programs and feedback.</span><button className="btn sm" onClick={() => confirm("Stop sharing your log with your coach?") && api("/api/join", {}).then(() => { useSync.setState({ user: { ...acct.user!, coachId: null, coachName: null } }); })}>Leave coach</button></div>
            : <div className="row"><input className="input" style={{ maxWidth: 180 }} placeholder="Coach code" aria-label="Coach code" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn" disabled={!code.trim()} onClick={() => joinCoach(code.trim()).then(() => { st.say("Linked to your coach"); setCode(""); }).catch((e) => st.say(e.message))}>Join a coach</button></div>}
        <div className="row wrap"><button className="btn" onClick={() => void syncNow()}>Sync now</button><button className="btn" onClick={() => void logout()}>Log out</button>
          <button className="btn danger" onClick={() => confirm("Delete your account and all synced data? This cannot be undone. The copy on this device stays until you erase it.") && api("/api/account", undefined, "DELETE").then(() => logout(false)).catch((e) => st.say(e.message))}>Delete account</button></div>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Training</h3>
        <div className="field"><span>Progression mode</span><Seg full value={settings.mode} onChange={(mode) => setSettings({ mode })} options={[{ v: "sheet", label: "Sheet only" }, { v: "feedback", label: "Sheet + feedback" }, { v: "auto", label: "Auto" }]} /></div>
        <p className="dim small">Sheet only follows your periodization targets. Sheet + feedback asks for pump, workload and soreness, then proposes set changes you accept. Auto applies them for you, capped at MRV.</p>
        <label className="field"><span>Mesocycle start date (needed to date the old sessions)</span><input type="date" className="input" value={settings.mesoStart ?? ""} onChange={(e) => setSettings({ mesoStart: e.target.value || null })} /></label>
        <label className="field"><span>Rest timer (seconds)</span><input className="input num" inputMode="numeric" value={settings.restSec} onChange={(e) => setSettings({ restSec: Math.max(15, Number(e.target.value) || 150) })} /></label>
        <div className="row"><label className="field" style={{ flex: 1 }}><span>Bar (kg)</span><input className="input num" inputMode="decimal" value={settings.bar} onChange={(e) => setSettings({ bar: Number(e.target.value) || 20 })} /></label>
          <label className="field" style={{ flex: 2 }}><span>Plates per side (kg)</span><input className="input num" defaultValue={settings.plates.join(", ")} onBlur={(e) => setSettings({ plates: e.target.value.split(/[ ,]+/).map(Number).filter((n) => n > 0) })} /></label></div>
        <div className="field"><span>Effort scale</span><Seg full value={settings.effort ?? "rir"} onChange={(effort) => setSettings({ effort })} options={[{ v: "rir", label: "RIR" }, { v: "rpe", label: "RPE" }]} label="Effort scale" /></div>
        <div className="field"><span>Theme</span><Seg full value={settings.theme} onChange={(theme) => { setSettings({ theme }); }} options={[{ v: "auto", label: "System" }, { v: "dark", label: "Dark" }, { v: "light", label: "Light" }]} /></div>
      </section>


      <FormulaSettings />
      <MealcostLink />

      <Library />

      {!isNative && (
        <section className="panel stack" style={{ padding: 16 }}>
          <h3>Get the app</h3>
          <p className="dim small">Android: download the APK, open it and allow installs from your browser when asked. Updates then install from inside the app. iPhone and iPad: in Safari tap Share, then Add to Home Screen. On a computer, use the install icon in the address bar.</p>
          <a className="btn primary" style={{ justifySelf: "start" }} href={APK_URL}><Download size={18} /> Download for Android</a>
        </section>
      )}

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
        <p className="dim small">Your log is stored on this device, works offline and syncs to your account. A backup file is still worth keeping.</p>
        <div className="row wrap">
          <button className="btn" onClick={async () => save(`ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, await st.exportAll(), "application/json")}><Download size={18} /> Backup (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}><Upload size={18} /> Restore backup</button>
          <button className="btn" onClick={exportCsv}><Download size={18} /> Log as CSV</button>
          <button className="btn" onClick={exportFitnotes} disabled={undated === dated.length}><Download size={18} /> FitNotes CSV</button>
        </div>
        {undated > 0 && <p className="faint xs">{undated} older sessions have no date. Set the mesocycle start date above and they are dated by your weekly split.</p>}
        <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await st.importAll(await f.text()); st.say("Backup restored"); } catch (err) { st.say((err as Error).message); } e.target.value = ""; }} />
        <button className="btn danger" style={{ justifySelf: "start" }} onClick={() => confirm("Erase all your data, on this device and in your account? Back up first if you want to keep it.") && st.resetAll()}>Erase all data</button>
      </section>
    </div>
  );
}
