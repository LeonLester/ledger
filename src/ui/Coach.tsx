import { useCallback, useEffect, useRef, useState } from "react";
import { watch } from "../live";
import { ClientProgram } from "./ClientProgram";
import { ArrowLeft, Copy } from "lucide-react";
import { EXPERIENCE, type Intake } from "./Account";
import { api } from "../api";
import { HOME } from "../native";
import { useStore } from "../store";
import { mesoLabel } from "../lib/selectors";
import { useSync } from "../sync";
import { useViewing, type ClientView } from "../lib/view";
import { sortSessions } from "../lib/selectors";
import { workedSets } from "../lib/math";
import type { Meso, Session } from "../types";
import { Seg } from "./common";
import { Progress } from "./Progress";
import { LogSheet } from "./LogSheet";
import { setsText } from "../lib/sheet";
import { ProgramBuilder, evenSplit } from "./Builder";
import { pumpLabels } from "../lib/progression";

interface Row { id: string; name: string; email: string; sessions: number; lastSync: number | null; lastDone: number | null; week: number; archived: boolean; flags: { kind: "bad" | "warn" | "acc"; text: string }[]; attention: number }
const ago = (t: number | null) => { if (!t) return "never"; const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

export function Coach() {
  const { user } = useSync();
  const say = useStore((s) => s.say);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(() => api<{ clients: Row[] }>("/api/coach/clients").then((r) => setRows(r.clients)).catch((e) => say(e.message)), [say]);
  useEffect(() => { if (!open) void load(); }, [open, load]);
  useEffect(() => { const h = () => { if (!open) void load(); }; window.addEventListener("ledger:poke", h); return () => window.removeEventListener("ledger:poke", h); }, [open, load]);
  if (open) return <ClientDetail id={open} archived={!!rows?.find((r) => r.id === open)?.archived} onBack={() => setOpen(null)} />;
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Clients</h1><p className="sub">Athletes registered under you. Their logs sync to you automatically.</p></div></div>
      <section className="panel row between wrap" style={{ padding: 16 }}>
        <div><div className="faint xs">Your coach code</div><div className="name num" style={{ fontSize: "1.8rem", letterSpacing: ".12em" }}>{user?.invite}</div>
          <div className="dim small">Clients enter it when they sign up, or under More, Coach.</div></div>
        <div className="row"><button className="btn" onClick={() => { void navigator.clipboard?.writeText(user?.invite ?? ""); say("Code copied"); }}><Copy size={18} /> Code</button>
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(`${HOME}/#coach=${user?.invite ?? ""}`); say("Invite link copied"); }}><Copy size={18} /> Invite link</button></div>
      </section>
      {rows && rows.some((c) => c.attention > 0 && !c.archived) && <p className="faint xs" style={{ marginBottom: -12 }}>Clients who need you come first.</p>}
      <section className="panel list">
        {rows?.filter((c) => !c.archived).map((c) => (
          <button key={c.id} className="sess-row" onClick={() => setOpen(c.id)}>
            <div>
              <div className="name">{c.name}</div>
              <div className="dim small">{c.week} this week, {c.sessions} logged{c.lastDone ? `, last ${ago(c.lastDone)}` : ""}</div>
              {c.flags.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{c.flags.map((f) => <span key={f.text} className={`pill ${f.kind === "bad" ? "bad" : f.kind === "warn" ? "warn" : "acc"}`}>{f.text}</span>)}</div>}
            </div>
            {c.flags.length === 0 && <span className="pill ok">On track</span>}
          </button>
        ))}
        {rows && rows.filter((c) => !c.archived).length === 0 && <div className="empty">No clients yet. Share your coach code or invite link.</div>}
        {!rows && <div className="empty">Loading</div>}
      </section>
      {rows && rows.some((c) => c.archived) && <div className="stack">
        <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide" : "Show"} archived ({rows.filter((c) => c.archived).length})</button>
        {showArchived && <section className="panel list">{rows.filter((c) => c.archived).map((c) => <button key={c.id} className="sess-row" onClick={() => setOpen(c.id)}><div><div className="name">{c.name}</div><div className="dim small">Archived</div></div></button>)}</section>}
      </div>}
    </div>
  );
}

function ClientDetail({ id, archived, onBack }: { id: string; archived: boolean; onBack: () => void }) {
  const say = useStore((s) => s.say);
  const { client, set } = useViewing();
  const [tab, setTab] = useState<"log" | "progress" | "sheet" | "program" | "profile" | "assign">("log");
  const [sheetMeso, setSheetMeso] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ client: { id: string; name: string; email: string }; data: ClientView["data"]; comments: ClientView["comments"]; assignments: ClientView["assignments"] }>(`/api/coach/clients/${id}/data`);
      set({ ...r.client, data: r.data, comments: r.comments, assignments: r.assignments });
    } catch (e) { say((e as Error).message); onBack(); }
  }, [id, set, say, onBack]);
  useEffect(() => { void load(); return () => set(null); }, [load, set]);
  // live: the client's own room tells this screen the moment they log a set or reply
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => watch(() => void loadRef.current(), id), [id]);
  if (!client || client.id !== id) return <div className="empty">Loading</div>;
  const mesos = ((client.data.mesos ?? []) as (Meso & { __id: string })[]);
  const active = (client.data.settings?.[0] as { activeMeso?: string } | undefined)?.activeMeso;
  const mesoId = sheetMeso || active || mesos[0]?.id || "";
  return (
    <div className="stack-lg">
      <div className="page-head"><div className="row" style={{ gap: 10 }}><button className="btn ghost icon" aria-label="Back to clients" onClick={onBack}><ArrowLeft /></button><div><h1>{client.name}</h1><p className="sub">{client.email}</p></div></div>
        <button className="btn sm" onClick={() => void load()}>Refresh</button></div>
      <Seg full value={tab} onChange={setTab} label="Client view" options={[{ v: "log", label: "Log" }, { v: "progress", label: "Progress" }, { v: "sheet", label: "Sheet" }, { v: "program", label: "Program" }, { v: "profile", label: "Profile" }, { v: "assign", label: "Assign" }]} />
      {tab === "log" && <ClientLog client={client} reload={load} />}
      {tab === "progress" && <Progress />}
      {tab === "sheet" && <div className="stack">
        {mesos.length > 1 && <Seg value={mesoId} onChange={setSheetMeso} label="Mesocycle" options={mesos.map((m) => ({ v: m.id, label: mesoLabel(m.name) }))} />}
        {mesoId ? <LogSheet mesoId={mesoId} /> : <p className="dim">This client has no program yet.</p>}</div>}
      {tab === "program" && <ClientProgram client={client} reload={load} />}
      {tab === "profile" && <ClientProfile client={client} archived={archived} onBack={onBack} />}
      {tab === "assign" && <Assign client={client} reload={load} />}
    </div>
  );
}

function ClientLog({ client, reload }: { client: ClientView; reload: () => Promise<void> }) {
  const say = useStore((s) => s.say);
  const sessions = sortSessions(((client.data.sessions ?? []) as Session[]).filter((s) => s.status === "done")).reverse().slice(0, 30);
  const fb = (client.data.feedback ?? []) as { sessionId: string; muscle: string; pump: number; workload: number; soreness: number | null }[];
  const [text, setText] = useState<Record<string, string>>({});
  const send = async (sessionId: string | null) => {
    const key = sessionId ?? "";
    try { await api("/api/coach/comment", { clientId: client.id, sessionId, body: text[key] }); setText({ ...text, [key]: "" }); say("Feedback sent"); await reload(); } catch (e) { say((e as Error).message); }
  };
  const del = async (cid: string) => { try { await api("/api/coach/comment", { id: cid }, "DELETE"); await reload(); } catch (e) { say((e as Error).message); } };
  const box = (sid: string | null) => (
    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <input className="input" placeholder={sid ? "Feedback on this session" : "Message to the client"} aria-label="Feedback" value={text[sid ?? ""] ?? ""} onChange={(e) => setText({ ...text, [sid ?? ""]: e.target.value })} />
      <button className="btn sm primary" disabled={!(text[sid ?? ""] ?? "").trim()} onClick={() => void send(sid)}>Send</button>
    </div>
  );
  const general = client.comments.filter((c) => !c.sessionId);
  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>General feedback</h3>
        {box(null)}
        {general.slice(0, 8).map((c) => <div key={c.id} className={`msg ${c.fromClient ? "theirs" : "mine"}`}><div className="row between" style={{ gap: 8 }}><div className="faint xs">{c.fromClient ? client.name : "You"}, {new Date(c.created).toLocaleDateString("en-GB")}</div>{!c.fromClient && <button className="linkbtn" onClick={() => void del(c.id)}>Delete</button>}</div>{c.body}</div>)}
      </section>
      {sessions.length === 0 && <p className="dim">This client has not logged a session yet.</p>}
      {sessions.map((s) => (
        <section key={s.id} className="panel stack" style={{ padding: 16 }}>
          <div className="row between wrap"><h3>{s.name}</h3><span className="pill">M{s.meso.slice(1)} W{s.week}{s.date ? `, ${s.date}` : ""}</span></div>
          <table className="t"><tbody>{s.exercises.filter((e) => workedSets(e).length).map((e) => <tr key={e.letter + e.exercise}><td>{e.exercise}{e.note && <div className="faint xs">{e.note}</div>}</td><td className="num">{setsText(e)}</td></tr>)}</tbody></table>
          {fb.filter((f) => f.sessionId === s.id).length > 0 && <div className="row wrap" style={{ gap: 6 }}>{fb.filter((f) => f.sessionId === s.id).map((f) => <span key={f.muscle} className="pill">{f.muscle}: pump {pumpLabels[f.pump]?.toLowerCase()}{f.soreness != null ? `, soreness ${f.soreness}` : ""}</span>)}</div>}
          {client.comments.filter((c) => c.sessionId === s.id).slice().reverse().map((c) => <div key={c.id} className={`msg ${c.fromClient ? "theirs" : "mine"}`}><div className="row between" style={{ gap: 8 }}><div className="faint xs">{c.fromClient ? client.name : "You"}, {new Date(c.created).toLocaleDateString("en-GB")}</div>{!c.fromClient && <button className="linkbtn" onClick={() => void del(c.id)}>Delete</button>}</div>{c.body}</div>)}
          {box(s.id)}
        </section>
      ))}
    </div>
  );
}

function Assign({ client, reload }: { client: ClientView; reload: () => Promise<void> }) {
  const { mesos, split, say } = useStore();
  const [mode, setMode] = useState<"mine" | "build">("mine");
  const [pick, setPick] = useState(mesos[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (name: string, payload: unknown) => {
    setBusy(true);
    try { await api("/api/coach/assign", { clientId: client.id, name, payload, note }); say(`${name} sent to ${client.name}`); setNote(""); await reload(); } catch (e) { say((e as Error).message); } finally { setBusy(false); }
  };
  const m = mesos.find((x) => x.id === pick);
  return (
    <div className="stack-lg">
      {client.assignments.length > 0 && <section className="panel stack" style={{ padding: 16 }}><h3>Assigned so far</h3>
        {client.assignments.map((a) => <div key={a.id} className="row between"><span>{a.name}</span><span className={`pill ${a.state === "accepted" ? "ok" : ""}`}>{a.state === "accepted" ? "Started" : "Waiting"}</span></div>)}</section>}
      <label className="field"><span>Note for the client (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Seg full value={mode} onChange={setMode} label="Source" options={[{ v: "mine", label: "One of my programs" }, { v: "build", label: "Build a new one" }]} />
      {mode === "mine" ? (
        <div className="stack">
          {mesos.length === 0 ? <p className="dim">You have no programs yet. Build a new one.</p> : <>
            <select className="input" aria-label="Program" value={pick} onChange={(e) => setPick(e.target.value)}>{mesos.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <button className="btn primary" style={{ justifySelf: "start" }} disabled={!m || busy} onClick={() => { const { athleteId: _a, ...meso } = m as Meso & { athleteId: string }; void send(meso.name, { meso, split: m!.id === useStore.getState().settings.activeMeso && split.length ? split : evenSplit(meso.weeks[0]?.sessions.map((s) => s.name) ?? []), mode: "feedback", effort: "rir" }); }}>Send to {client.name}</button></>}
        </div>
      ) : (
        <ProgramBuilder saveLabel={`Send to ${client.name}`} onSave={(g) => { const out = g("assigned"); return send(out.meso.name, out); }} />
      )}
    </div>
  );
}

/** Intake answers, the client's account actions and a password reset link for when they are locked out. */
function ClientProfile({ client, archived, onBack }: { client: ClientView; archived: boolean; onBack: () => void }) {
  const say = useStore((s) => s.say);
  const [link, setLink] = useState("");
  const intake = ((client.data.kv ?? []).find((r) => r.__id === "intake")?.value ?? null) as Intake | null;
  const rows: [string, string | undefined][] = [["Goal", intake?.goal], ["Experience", intake?.experience && EXPERIENCE.includes(intake.experience) ? intake.experience : intake?.experience], ["Days a week", intake?.days], ["Injuries or limits", intake?.injuries], ["Notes", intake?.notes]];
  const act = (path: string, body: unknown, msg: string, then?: () => void) => api(path, body).then(() => { say(msg); then?.(); }).catch((e) => say(e.message));
  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Profile</h3>
        {intake && rows.some(([, v]) => v) ? <dl className="kv">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="dim small">{client.name} has not filled in a profile yet. They can do it under More.</p>}
      </section>
      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Account</h3>
        <p className="dim small">Locked out? Create a reset link and send it to {client.name} yourself. It works once, for 24 hours.</p>
        <div className="row wrap"><button className="btn" onClick={() => void api<{ link: string }>(`/api/coach/clients/${client.id}/reset-link`, {}).then((r) => { setLink(r.link); void navigator.clipboard?.writeText(r.link); say("Reset link copied"); }).catch((e) => say(e.message))}>Create reset link</button></div>
        {link && <input className="input num" readOnly value={link} aria-label="Reset link" onFocus={(e) => e.target.select()} />}
        <div className="row wrap">
          <button className="btn" onClick={() => void act(`/api/coach/clients/${client.id}/archive`, { archived: archived ? false : true }, archived ? `${client.name} restored` : `${client.name} archived`, onBack)}>{archived ? "Restore client" : "Archive client"}</button>
          <button className="btn danger" onClick={() => confirm(`Remove ${client.name}? You lose access to their log. They keep their account and data.`) && void act(`/api/coach/clients/${client.id}/remove`, {}, `${client.name} removed`, onBack)}>Remove client</button>
        </div>
        <p className="faint xs">Archive hides a client from your list and keeps the link. Remove ends your access.</p>
      </section>
    </div>
  );
}
