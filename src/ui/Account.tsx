import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { db } from "../db";
import { useStore } from "../store";
import { logout, setUser, syncNow, useSync } from "../sync";

/** Version of the privacy notice. Raise it to ask everyone to accept again. */
const CONSENT_FROM = 0;

/** First-run screen: the account cannot be used until the person has seen what is shared and with whom. */
export function ConsentGate() {
  const { user } = useSync();
  const [busy, setBusy] = useState(false);
  const say = useStore((s) => s.say);
  if (!user) return null;
  const accept = async () => {
    setBusy(true);
    try { setUser((await api<{ user: typeof user }>("/api/consent", {})).user); } catch (e) { say((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="main gate">
      <div className="stack-lg">
        <div><div className="gate-icon"><ShieldCheck size={26} /></div><h1>Before you start</h1><p className="sub">Here is what Ledger does with your training data.</p></div>
        <ul className="gate-list">
          <li><b>Your log is yours.</b> It lives on this device and syncs to your account. You can export it or delete it any time under More.</li>
          <li><b>A coach sees it only if you join one.</b> With a coach code, your coach can read your sessions, progress, profile and messages, send you programs and edit your plan. Leave them under More and the access ends.</li>
          <li><b>Nothing is sold or used for ads.</b> Cloudflare hosts the data. Sign-in with Google is optional.</li>
        </ul>
        <p className="faint small">Read the full <a href="/privacy.html" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>privacy notice</a>.</p>
        <div className="row wrap"><button className="btn primary" disabled={busy} onClick={() => void accept()}>I understand, continue</button><button className="btn ghost" onClick={() => void logout()}>Log out</button></div>
      </div>
    </div>
  );
}
export const needsConsent = (u: { consent?: number | null } | null) => !!u && (u.consent ?? 0) <= CONSENT_FROM;

/** Asks for email confirmation once the server can send mail. */
export function VerifyBanner() {
  const { user } = useSync();
  const say = useStore((s) => s.say);
  const [mail, setMail] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => { void api<{ mail: boolean }>("/api/config").then((c) => setMail(c.mail)).catch(() => {}); }, []);
  if (!user || user.emailVerified !== false || !mail) return null;
  return (
    <div className="banner" role="status">
      <span>Confirm your email address so you can reset your password later.</span>
      <button className="btn sm" disabled={sent} onClick={() => api("/api/email/resend", {}).then(() => { setSent(true); say("Confirmation email sent"); }).catch((e) => say(e.message))}>{sent ? "Sent" : "Send the email"}</button>
    </div>
  );
}

/** Handles #verify=TOKEN links from the confirmation email. */
export function useVerifyLink() {
  const say = useStore((s) => s.say);
  useEffect(() => {
    const t = /verify=([\w-]+)/.exec(location.hash)?.[1];
    if (!t) return;
    history.replaceState(null, "", location.pathname);
    api("/api/email/verify", { token: t }).then(() => { say("Email confirmed"); const u = useSync.getState().user; if (u) setUser({ ...u, emailVerified: true }); void syncNow(); }).catch((e) => say(e.message));
  }, [say]);
}

/** Small status chip: how many changes wait to sync, or that the device is offline. Tap to retry. */
export function SyncChip() {
  const { status, pending, error } = useSync();
  if (status === "idle" && pending === 0) return null;
  const off = status === "offline", bad = status === "error";
  const text = status === "syncing" ? "Syncing" : off ? `Offline${pending ? `, ${pending} waiting` : ""}` : bad ? `Not synced${pending ? `, ${pending} waiting` : ""}` : `${pending} waiting`;
  return (
    <button className={`syncchip ${off ? "warn" : bad ? "bad" : ""}`} onClick={() => void syncNow()} title={error ?? "Tap to sync now"} aria-label={`${text}. Tap to sync now.`}>
      {off ? <CloudOff size={14} /> : <RefreshCw size={14} className={status === "syncing" ? "spin" : ""} />}{text}
    </button>
  );
}

interface Device { id: string; label: string; created: number | null; current: boolean }
/** Where the account is signed in, with a way to sign out of the others. */
export function Devices() {
  const say = useStore((s) => s.say);
  const [list, setList] = useState<Device[] | null>(null);
  const load = useCallback(() => api<{ devices: Device[] }>("/api/sessions").then((r) => setList(r.devices)).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load]);
  const revoke = (body: object, msg: string) => api("/api/sessions/revoke", body).then(() => { say(msg); return load(); }).catch((e) => say(e.message));
  if (!list || list.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between"><b>Signed in on</b>{list.length > 1 && <button className="btn sm" onClick={() => confirm("Sign out everywhere except this device?") && void revoke({ all: true }, "Signed out of other devices")}>Sign out others</button>}</div>
      {list.map((d) => (
        <div key={d.id} className="row between" style={{ gap: 8 }}>
          <div><span>{d.label}</span>{d.current && <span className="pill acc" style={{ marginLeft: 8 }}>This device</span>}<div className="faint xs">{d.created ? `Signed in ${new Date(d.created).toLocaleDateString("en-GB")}` : "Signed in earlier"}</div></div>
          {!d.current && <button className="btn sm ghost" onClick={() => void revoke({ id: d.id }, "Device signed out")}>Sign out</button>}
        </div>
      ))}
    </div>
  );
}

export function NotifyToggle() {
  const { user } = useSync();
  const say = useStore((s) => s.say);
  if (!user) return null;
  return (
    <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <input type="checkbox" style={{ marginTop: 4 }} checked={user.notify !== false} onChange={(e) => api<{ user: typeof user }>("/api/prefs", { notify: e.target.checked }).then((r) => setUser(r.user)).catch((x) => say(x.message))} />
      <span><span>Email me about coaching activity</span><div className="faint xs">New feedback, new programs and messages from your coach or client.</div></span>
    </label>
  );
}

export interface Intake { goal: string; experience: string; days: string; injuries: string; notes: string; updated?: number }
export const EXPERIENCE = ["Under 1 year", "1 to 3 years", "3 to 5 years", "More than 5 years"];
export const emptyIntake: Intake = { goal: "", experience: "", days: "", injuries: "", notes: "" };

/** The client's profile for their coach. Stored with the rest of the account so the coach sees it under the client's Profile tab. */
export function IntakeForm() {
  const say = useStore((s) => s.say);
  const [v, setV] = useState<Intake | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { void db.kv.get("intake").then((r) => setV({ ...emptyIntake, ...((r?.value as Intake | undefined) ?? {}) })); }, []);
  if (!v) return null;
  const set = (k: keyof Intake) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setDirty(true); };
  return (
    <section className="panel stack" style={{ padding: 16 }} aria-label="Your profile">
      <div><h3>Your profile</h3><p className="dim small">Helps your coach plan for you. Only your coach sees it.</p></div>
      <label className="field"><span>Main goal</span><input className="input" value={v.goal} onChange={set("goal")} placeholder="For example: add 10 kg to my squat" /></label>
      <div className="row" style={{ alignItems: "end" }}>
        <label className="field" style={{ flex: 2 }}><span>Training experience</span>
          <select className="input" value={v.experience} onChange={set("experience")}><option value="">Choose</option>{EXPERIENCE.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field" style={{ flex: 1 }}><span>Days a week</span><input className="input num" inputMode="numeric" maxLength={1} value={v.days} onChange={set("days")} /></label>
      </div>
      <label className="field"><span>Injuries or limits</span><textarea className="input" rows={2} value={v.injuries} onChange={set("injuries")} /></label>
      <label className="field"><span>Anything else (schedule, equipment, food)</span><textarea className="input" rows={2} value={v.notes} onChange={set("notes")} /></label>
      <button className="btn primary" style={{ justifySelf: "start" }} disabled={!dirty} onClick={() => void db.kv.put({ key: "intake", value: { ...v, updated: Date.now() } }).then(() => { setDirty(false); say("Profile saved"); })}>Save profile</button>
    </section>
  );
}
