import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { useSync, syncNow, sendMessage, deleteMessage } from "../sync";
import type { Generated } from "../data/templates";

const when = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One message in a thread, with a delete link on the client's own. */
function Msg({ c }: { c: { id: string; body: string; created: number; coach: string; fromClient?: number } }) {
  const say = useStore((s) => s.say);
  const mine = !!c.fromClient;
  return (
    <div className={`msg ${mine ? "mine" : ""}`}>
      <div className="faint xs">{mine ? "You" : c.coach}, {when(c.created)}{mine && <button className="linkbtn" onClick={() => void deleteMessage(c.id).catch((e) => say(e.message))}>Delete</button>}</div>
      <div>{c.body}</div>
    </div>
  );
}

/** A one-line box to write to your coach, about a session or in general. */
export function ReplyBox({ sessionId, placeholder }: { sessionId?: string; placeholder: string }) {
  const say = useStore((s) => s.say);
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await sendMessage(t.trim(), sessionId); setT(""); say("Sent to your coach"); } catch (e) { say((e as Error).message); } finally { setBusy(false); } };
  return (
    <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); if (t.trim()) void go(); }}>
      <input className="input" placeholder={placeholder} aria-label={placeholder} maxLength={2000} value={t} onChange={(e) => setT(e.target.value)} />
      <button className="btn sm primary" disabled={!t.trim() || busy}>Send</button>
    </form>
  );
}

/** Programs your coach assigned and the latest feedback they left. */
export function CoachInbox() {
  const { assignments, comments, user } = useSync();
  const { createProgram, say } = useStore();
  const [busy, setBusy] = useState("");
  const pending = assignments.filter((a) => a.state === "sent");
  const recent = comments.filter((c) => !c.sessionId).slice(0, 4).reverse();
  if (!user?.coachId) return null;
  const start = async (id: string) => {
    const a = assignments.find((x) => x.id === id)!;
    setBusy(id);
    try {
      const p = a.payload as unknown as Omit<Generated, "meso"> & { meso: Generated["meso"] };
      await createProgram((mid) => ({ ...p, meso: { ...p.meso, id: mid } }));
      await api("/api/assignments/accept", { id });
      say(`${a.name} is now your active program`);
      await syncNow();
    } catch (e) { say((e as Error).message); } finally { setBusy(""); }
  };
  return (
    <section className="panel stack" style={{ padding: 16 }} aria-label="From your coach">
      <h3>From {user.coachName ?? "your coach"}</h3>
      {pending.map((a) => (
        <div key={a.id} className="row between wrap" style={{ gap: 10 }}>
          <div><b>{a.name}</b> <span className="pill acc">New program</span>{a.note && <div className="dim small">{a.note}</div>}</div>
          <button className="btn sm primary" disabled={busy === a.id} onClick={() => void start(a.id)}>Start this program</button>
        </div>
      ))}
      {recent.map((c) => <Msg key={c.id} c={c} />)}
      <ReplyBox placeholder={`Message ${user.coachName ?? "your coach"}`} />
    </section>
  );
}

/** Coach notes and your replies about one logged session. */
export function SessionComments({ sessionId }: { sessionId: string }) {
  const comments = useSync((s) => s.comments).filter((c) => c.sessionId === sessionId).slice().reverse();
  const coachId = useSync((s) => s.user?.coachId);
  if (!coachId) return null;
  return (
    <section className="panel stack" style={{ padding: 14 }} aria-label="Coach feedback">
      <h3>Coach feedback</h3>
      {comments.map((c) => <Msg key={c.id} c={c} />)}
      <ReplyBox sessionId={sessionId} placeholder="Reply or ask about this session" />
    </section>
  );
}
