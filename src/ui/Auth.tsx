import { useEffect, useState } from "react";
import { authenticate, googleEnabled, googleStart } from "../sync";
import { api } from "../api";
import { getLang, setLang } from "../i18n";
import { Seg } from "./common";
import { APK_URL, isNative } from "../native";

export function Auth({ initialMode = "login", onBack }: { initialMode?: "login" | "signup"; onBack?: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [f, setF] = useState({ name: "", email: "", password: "", code: "", coachKey: "" });
  const [coach, setCoach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [google, setGoogle] = useState(false);
  /** Links: /#invite=TOKEN makes a coach account (sent by the admin), /#coach=CODE joins that coach. */
  const [invite, setInvite] = useState<{ token: string; email: string | null } | null>(null);
  useEffect(() => {
    const read = (k: string) => { try { return new RegExp(`${k}=([\\w-]+)`).exec(location.hash)?.[1] ?? sessionStorage.getItem(`ledger.${k}`) ?? ""; } catch { return ""; } };
    const keep = (k: string, v: string) => { try { sessionStorage.setItem(`ledger.${k}`, v); } catch { /* blocked */ } };
    const tok = read("invite"), cc = read("coach");
    if (cc) { keep("coach", cc); setMode("signup"); setF((x) => ({ ...x, code: cc.toUpperCase() })); }
    if (tok) { keep("invite", tok); void api<{ valid: boolean; email: string | null }>(`/api/invite/check?t=${encodeURIComponent(tok)}`).then((r) => { if (r.valid) { setInvite({ token: tok, email: r.email }); setMode("signup"); if (r.email) setF((x) => ({ ...x, email: r.email! })); } else setErr("That invite link has expired or was already used. Ask for a new one."); }).catch(() => {}); }
  }, []);
  useEffect(() => { void googleEnabled().then(setGoogle); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await authenticate(mode, mode === "login" ? { email: f.email, password: f.password } : { name: f.name, email: f.email, password: f.password, code: coach || invite ? undefined : f.code || undefined, coachKey: coach && !invite ? f.coachKey : undefined, invite: invite?.token });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="main" style={{ maxWidth: 440, margin: "0 auto", paddingTop: 48 }}>
      <form className="stack-lg" onSubmit={submit}>
        <div className="row between">{onBack ? <button type="button" className="btn ghost" onClick={onBack}>Back</button> : <span />}<div className="seg" role="group" aria-label="Language">{(["en", "el"] as const).map((l) => <button key={l} type="button" aria-pressed={getLang() === l} onClick={() => getLang() !== l && setLang(l)}>{l === "en" ? "English" : "Ελληνικά"}</button>)}</div></div>
        <div><h1>Ledger</h1><p className="sub">Your training log. Log in to keep your data on every device, or create an account.</p></div>
        {invite && <p className="small" role="status" style={{ margin: 0, padding: 12, border: "1px solid var(--accent)", borderRadius: 10, background: "var(--accent-soft)" }}>You have been invited to join Ledger as a coach. Create your account below{invite.email ? ` with ${invite.email}` : ""}.</p>}
        <Seg full value={mode} onChange={(m) => { setMode(m); setErr(""); }} options={[{ v: "login", label: "Log in" }, { v: "signup", label: "Sign up" }]} label="Account" />
        <div className="stack">
          {mode === "signup" && <label className="field"><span>Name</span><input className="input" autoComplete="name" required value={f.name} onChange={set("name")} /></label>}
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></label>
          <label className="field"><span>Password{mode === "signup" ? " (8 characters or more)" : ""}</span><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required value={f.password} onChange={set("password")} /></label>
          {mode === "signup" && !coach && !invite && <label className="field"><span>Coach code (optional)</span><input className="input" autoCapitalize="characters" maxLength={8} placeholder="Leave blank if you have none" value={f.code} onChange={set("code")} /></label>}
          {mode === "signup" && coach && !invite && <label className="field"><span>Coach key</span><input className="input" type="password" required value={f.coachKey} onChange={set("coachKey")} /></label>}
          {mode === "signup" && !invite && <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /><span className="dim small">I am a coach</span></label>}
        </div>
        {err && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Please wait" : mode === "login" ? "Log in" : "Create account"}</button>
        {google && (
          <>
            <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}><hr style={{ flex: 1, borderColor: "var(--line)" }} /><span className="faint xs">or</span><hr style={{ flex: 1, borderColor: "var(--line)" }} /></div>
            <button type="button" className="btn" disabled={busy} onClick={() => void googleStart(mode === "signup" && !coach && !invite ? f.code.trim() || undefined : undefined, invite?.token).catch((x) => setErr((x as Error).message))}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.5v5.4h7.1c4.2-3.8 6.6-9.5 6.6-15.9z" /><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.4c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.6C8.1 41.1 15.5 46 24 46z" /><path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3 .7-4.4v-5.6H4.5C3 17 2 20.400 2 24s1 7 2.500 10l7.300-5.600z" /><path fill="#EA4335" d="M24 10.600c3.200 0 6.100 1.100 8.400 3.300l6.300-6.300C34.900 4.100 29.900 2 24 2 15.500 2 8.100 6.900 4.500 14l7.300 5.600c1.700-5.200 6.500-9 12.200-9z" /></svg>
              Continue with Google
            </button>
          </>
        )}
        {!isNative && <p className="small"><a href={APK_URL} style={{ color: "var(--accent)" }}>Download the Android app</a>. On iPhone, tap Share, then Add to Home Screen.</p>}
        <p className="faint xs">Your log works offline once you are signed in. Changes sync when you are back online.</p>
      </form>
    </div>
  );
}
