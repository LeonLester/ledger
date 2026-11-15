import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { useSync, syncNow } from "../sync";
import type { Generated } from "../data/templates";

const when = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Programs your coach assigned and the latest feedback they left. */
export function CoachInbox() {
  const { assignments, comments, user } = useSync();
  const { createProgram, say } = useStore();
  const [busy, setBusy] = useState("");
  const pending = assignments.filter((a) => a.state === "sent");
  const recent = comments.filter((c) => !c.sessionId).slice(0, 3);
  if (!user?.coachId || (!pending.length && !recent.length)) return null;
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
      {recent.map((c) => <div key={c.id}><div className="faint xs">{c.coach}, {when(c.created)}</div><div>{c.body}</div></div>)}
    </section>
  );
}

/** Coach notes attached to one logged session. */
export function SessionComments({ sessionId }: { sessionId: string }) {
  const comments = useSync((s) => s.comments).filter((c) => c.sessionId === sessionId);
  if (!comments.length) return null;
  return (
    <section className="panel stack" style={{ padding: 14 }} aria-label="Coach feedback">
      <h3>Coach feedback</h3>
      {comments.map((c) => <div key={c.id}><div className="faint xs">{c.coach}, {when(c.created)}</div><div>{c.body}</div></div>)}
    </section>
  );
}
