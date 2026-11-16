import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { api } from "../api";
import { HOME } from "../native";
import { useStore } from "../store";

interface U { id: string; name: string; email: string; role: "athlete" | "coach"; created: number; google: number; password: number; coach: string | null; last: number | null; clients: number }
interface Req { id: string; name: string; email: string; note: string | null; created: number }
interface Inv { id: string; token: string; email: string | null; note: string | null; created: number; expires: number; used: number | null; usedBy: string | null }
interface Overview { stats: { users: number; coaches: number; week: number }; users: U[]; requests: Req[]; invites: Inv[] }

const day = (t: number | null) => (t ? new Date(t).toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" }) : "never");
const link = (t: string) => `${HOME}/#invite=${t}`;

/** Admin dashboard: who signed up, coach approvals and invite links. Only shown to accounts listed in ADMIN_EMAILS that signed in with Google. */
export function Admin({ onBack }: { onBack: () => void }) {
  const say = useStore((s) => s.say);
  const [d, setD] = useState<Overview | null>(null);
  const [f, setF] = useState({ email: "", note: "", days: "14" });
  const [q, setQ] = useState("");
  const load = useCallback(() => api<Overview>("/api/admin/overview").then(setD).catch((e) => say(e.message)), [say]);
  useEffect(() => { void load(); }, [load]);
  const act = (path: string, body: unknown, msg: string, method = "POST") => api(path, body, method).then(() => { say(msg); return load(); }).catch((e) => say(e.message));
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); say("Link copied"); };
  const create = async () => {
    try {
      const r = await api<{ token: string }>("/api/admin/invite", { email: f.email.trim() || undefined, note: f.note.trim() || undefined, days: Number(f.days) || 14 });
      copy(link(r.token)); setF({ email: "", note: "", days: f.days }); void load();
    } catch (e) { say((e as Error).message); }
  };
  if (!d) return <div className="stack-lg"><div className="page-head"><div><h1>Admin</h1></div><button className="btn" onClick={onBack}>Go back</button></div><p className="dim">Loading</p></div>;
  const users = d.users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Admin</h1><p className="sub">Sign-ups, coach approvals and invite links.</p></div><button className="btn" onClick={onBack}>Go back</button></div>

      <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
        {[["Users", d.stats.users], ["Coaches", d.stats.coaches], ["New, 7 days", d.stats.week]].map(([l, v]) => (
          <section key={l} className="panel" style={{ padding: 14, flex: 1, minWidth: 0 }}><div className="faint xs">{l}</div><div className="name num" style={{ fontSize: "1.9rem" }}>{v}</div></section>
        ))}
      </div>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Coach requests</h3>
        {d.requests.length === 0 && <p className="dim small">No pending requests.</p>}
        {d.requests.map((r) => (
          <div key={r.id} className="row between wrap" style={{ gap: 10 }}>
            <div style={{ minWidth: 0 }}><b>{r.name}</b> <span className="dim small">{r.email}</span>{r.note && <div className="dim small">{r.note}</div>}</div>
            <div className="row"><button className="btn sm primary" onClick={() => void act("/api/admin/request", { userId: r.id, approve: true }, `${r.name} is now a coach`)}>Approve</button>
              <button className="btn sm" onClick={() => void act("/api/admin/request", { userId: r.id, approve: false }, "Request declined")}>Decline</button></div>
          </div>
        ))}
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Invite a coach</h3>
        <p className="dim small">Creates a one-time link. Whoever opens it signs up (email or Google) as a coach. Add an email to lock it to that address.</p>
        <label className="field"><span>Email (optional)</span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="field" style={{ flex: 1 }}><span>Note (who is it for)</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <label className="field" style={{ width: 84 }}><span>Days</span><input className="input num" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></label>
        </div>
        <button className="btn primary" onClick={() => void create()}><Link2 size={18} /> Create link and copy</button>
        <div className="list">
          {d.invites.map((i) => {
            const state = i.used ? `Used by ${i.usedBy ?? "someone"}` : i.expires < Date.now() ? "Expired" : `Open until ${day(i.expires)}`;
            return (
              <div key={i.id} className="row between" style={{ padding: "10px 0", gap: 8, flexWrap: "nowrap" }}>
                <div style={{ minWidth: 0 }}><b>{i.note || i.email || "Coach invite"}</b><div className="dim xs">{i.email && i.note ? `${i.email}, ` : ""}{state}</div></div>
                <div className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
                  {!i.used && i.expires > Date.now() && <button className="btn ghost icon sm" aria-label="Copy invite link" onClick={() => copy(link(i.token))}><Copy size={16} /></button>}
                  <button className="btn ghost icon sm" aria-label="Delete invite" onClick={() => void act("/api/admin/invite", { id: i.id }, "Invite removed", "DELETE")}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
          {d.invites.length === 0 && <p className="dim small" style={{ paddingTop: 10 }}>No invites yet.</p>}
        </div>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h3>Everyone ({d.users.length})</h3>
        <input className="input" placeholder="Find a name or email" aria-label="Find a user" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="lib-scroll" tabIndex={0} aria-label="Users table">
          <table className="lib">
            <thead><tr><th className="lib-n">Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Active</th><th>Via</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="lib-n" title={u.name}>{u.name}</td>
                  <td style={{ padding: "0 8px" }}>{u.email}</td>
                  <td style={{ padding: "0 8px" }}>{u.role}{u.role === "coach" ? ` (${u.clients})` : u.coach ? `, ${u.coach}` : ""}</td>
                  <td style={{ padding: "0 8px" }}>{day(u.created)}</td>
                  <td style={{ padding: "0 8px" }}>{day(u.last)}</td>
                  <td style={{ padding: "0 8px" }}>{[u.google ? "Google" : "", u.password ? "Password" : ""].filter(Boolean).join(" + ")}</td>
                  <td style={{ padding: "0 6px" }}>{u.role === "athlete"
                    ? <button className="btn sm" onClick={() => void act("/api/admin/role", { userId: u.id, role: "coach" }, `${u.name} is now a coach`)}>Make coach</button>
                    : <button className="btn sm" onClick={() => confirm(`Make ${u.name} an athlete? Their clients are unlinked.`) && void act("/api/admin/role", { userId: u.id, role: "athlete" }, `${u.name} is now an athlete`)}>Remove coach</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
