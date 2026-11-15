import { useState } from "react";
import { authenticate } from "../sync";
import { Seg } from "./common";

export function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", code: "", coachKey: "" });
  const [coach, setCoach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await authenticate(mode, mode === "login" ? { email: f.email, password: f.password } : { name: f.name, email: f.email, password: f.password, code: coach ? undefined : f.code || undefined, coachKey: coach ? f.coachKey : undefined });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="main" style={{ maxWidth: 440, margin: "0 auto", paddingTop: 48 }}>
      <form className="stack-lg" onSubmit={submit}>
        <div><h1>Ledger</h1><p className="sub">Your training log. Log in to keep your data on every device, or create an account.</p></div>
        <Seg full value={mode} onChange={(m) => { setMode(m); setErr(""); }} options={[{ v: "login", label: "Log in" }, { v: "signup", label: "Sign up" }]} label="Account" />
        <div className="stack">
          {mode === "signup" && <label className="field"><span>Name</span><input className="input" autoComplete="name" required value={f.name} onChange={set("name")} /></label>}
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></label>
          <label className="field"><span>Password{mode === "signup" ? " (8 characters or more)" : ""}</span><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required value={f.password} onChange={set("password")} /></label>
          {mode === "signup" && !coach && <label className="field"><span>Coach code (optional)</span><input className="input" autoCapitalize="characters" maxLength={8} placeholder="Leave blank if you have none" value={f.code} onChange={set("code")} /></label>}
          {mode === "signup" && coach && <label className="field"><span>Coach key</span><input className="input" type="password" required value={f.coachKey} onChange={set("coachKey")} /></label>}
          {mode === "signup" && <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /><span className="dim small">I am a coach</span></label>}
        </div>
        {err && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Please wait" : mode === "login" ? "Log in" : "Create account"}</button>
        <p className="faint xs">Your log works offline once you are signed in. Changes sync when you are back online.</p>
      </form>
    </div>
  );
}
