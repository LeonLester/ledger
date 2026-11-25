/// <reference path="./env.d.ts" />
/** Ledger API: accounts, sync and coaching on Cloudflare Workers + D1. Static assets are served by the assets binding. */

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const id = () => b64(rand(12));

/** Browsers on these origins may call the API: the site itself and the Android app's WebView. Everything else gets no CORS headers. */
const ORIGINS = ["https://ledger.coachleonidas.com", "https://localhost", "capacitor://localhost"];
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
function harden(req: Request, res: Response, env: Env): Response {
  const out = new Response(res.body, res);
  const o = req.headers.get("origin");
  out.headers.append("vary", "Origin");
  if (o && (ORIGINS.includes(o) || o === env.PUBLIC_ORIGIN)) {
    out.headers.set("access-control-allow-origin", o);
    out.headers.set("access-control-allow-headers", "authorization,content-type");
    out.headers.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
    out.headers.set("access-control-max-age", "86400");
  }
  out.headers.set("x-content-type-options", "nosniff");
  out.headers.set("referrer-policy", "no-referrer");
  out.headers.set("strict-transport-security", "max-age=31536000");
  out.headers.set("cross-origin-opener-policy", "same-origin");
  return out;
}
const fail = (status: number, error: string) => json({ error }, status);
/** Public address used in emailed links. Set per request from PUBLIC_ORIGIN, or the address the request came in on. */
let ORIGIN = "";

/** One Durable Object per account holds that account's open sockets. A poke tells every open app to sync now, which is what makes sync live. */
export class Hub {
  constructor(private state: DurableObjectState) {}
  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === "/poke") {
      for (const ws of this.state.getWebSockets()) { try { ws.send("sync"); } catch { /* socket already gone */ } }
      return new Response("ok");
    }
    if (req.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    const proto = req.headers.get("sec-websocket-protocol");
    return new Response(null, { status: 101, webSocket: pair[0], headers: proto ? { "sec-websocket-protocol": proto } : {} } as ResponseInit);
  }
  webSocketMessage(ws: { send(m: string): void }, msg: string) { if (msg === "ping") ws.send("pong"); }
  webSocketClose(ws: { close(code?: number): void }) { try { ws.close(1000); } catch { /* already closed */ } }
}
/** Tells every open app of these accounts that something changed. Never throws: live sync is a speed-up, the next poll still catches up. */
async function poke(env: Env, ...userIds: (string | null | undefined)[]) {
  if (!env.HUB) return;
  await Promise.all([...new Set(userIds.filter(Boolean) as string[])].map((id) => env.HUB!.get(env.HUB!.idFromName(id)).fetch(new Request("https://hub/poke")).catch(() => null)));
}
const tooMany = (sec: number) => json({ error: "Too many attempts. Wait a few minutes and try again." }, 429, { "retry-after": String(sec) });

async function sha(s: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))); }
async function hashPw(pw: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256)));
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/* The schema lives in migrations/ and is applied by `wrangler d1 migrations apply` before each deploy. */

/** Fixed-window rate limit kept in D1. True when the caller is over the limit. */
async function limited(db: D1Database, key: string, limit: number, windowSec: number) {
  const now = Date.now(), win = Math.floor(now / (windowSec * 1000));
  const row = await db.prepare("INSERT INTO rl (k, w, n, exp) VALUES (?, ?, 1, ?) ON CONFLICT(k, w) DO UPDATE SET n = n + 1 RETURNING n").bind(key, win, (win + 1) * windowSec * 1000).first<{ n: number }>();
  if (Math.random() < 0.02) await db.prepare("DELETE FROM rl WHERE exp < ?").bind(now).run();
  return !!row && row.n > limit;
}
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? "";

interface User { id: string; email: string; name: string; role: "athlete" | "coach"; coach_id: string | null; invite: string | null; google_sub?: string | null; email_verified?: number; consent?: number | null; notify?: number }
/** Admins are listed by email in the ADMIN_EMAILS secret. Only a Google-verified sign-in counts, so nobody can claim an admin address by signing up with it. */
let ADMINS: string[] = [];
const isAdmin = (u: User) => !!u.google_sub && ADMINS.includes(u.email.toLowerCase());
const pub = (u: User, coachName?: string | null) => ({ id: u.id, email: u.email, name: u.name, role: u.role, coachId: u.coach_id, coachName: coachName ?? null, invite: u.role === "coach" ? u.invite : null, admin: isAdmin(u), emailVerified: !!u.email_verified, consent: u.consent ?? null, notify: u.notify !== 0 });

/** A short device name from the User-Agent, shown in the list of signed-in devices. */
function deviceLabel(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "app";
  return `${os}, ${br}`;
}
async function newToken(db: D1Database, userId: string, label = "Device") {
  const t = b64(rand(32));
  await db.prepare("INSERT INTO tokens (hash, user_id, expires, label, created) VALUES (?,?,?,?,?)").bind(await sha(t), userId, Date.now() + 90 * 864e5, label, Date.now()).run();
  return t;
}

/** Sends a plain text email through the EMAIL binding. False when email is not set up or sending failed, so callers can fall back to a link from a coach or admin. */
async function sendMail(env: Env, to: string, subject: string, text: string) {
  if (!env.EMAIL) return false;
  try { await env.EMAIL.send({ to, from: env.MAIL_FROM || "Ledger <no-reply@coachleonidas.com>", subject, text }); return true; } catch (e) { console.error("mail failed", String(e)); return false; }
}
/** One-time link tokens for password reset and email verification. Only the hash is stored. */
async function mailToken(db: D1Database, userId: string, kind: "reset" | "verify", hours: number) {
  const t = b64(rand(24));
  await db.prepare("DELETE FROM mail_tokens WHERE user_id = ? AND kind = ?").bind(userId, kind).run();
  await db.prepare("INSERT INTO mail_tokens (hash, user_id, kind, expires) VALUES (?,?,?,?)").bind(await sha(`${kind}:${t}`), userId, kind, Date.now() + hours * 3600e3).run();
  return t;
}
async function useMailToken(db: D1Database, kind: "reset" | "verify", t: unknown) {
  if (typeof t !== "string" || t.length < 16 || t.length > 64) return null;
  const h = await sha(`${kind}:${t}`);
  const row = await db.prepare("SELECT user_id FROM mail_tokens WHERE hash = ? AND expires > ?").bind(h, Date.now()).first<{ user_id: string }>();
  if (row) await db.prepare("DELETE FROM mail_tokens WHERE hash = ?").bind(h).run();
  return row?.user_id ?? null;
}
async function sendVerify(env: Env, db: D1Database, u: { id: string; email: string }) {
  const t = await mailToken(db, u.id, "verify", 72);
  return sendMail(env, u.email, "Confirm your email for Ledger", `Open this link to confirm your email address:\n\n${ORIGIN}/#verify=${t}\n\nIf you did not create a Ledger account, ignore this message.`);
}
/** Emails a user about coaching activity, when they allow it. Never throws. */
async function notify(env: Env, db: D1Database, userId: string, subject: string, text: string) {
  const u = await db.prepare("SELECT email, notify FROM users WHERE id = ?").bind(userId).first<{ email: string; notify: number }>();
  if (u && u.notify !== 0) await sendMail(env, u.email, subject, `${text}\n\nOpen Ledger: ${ORIGIN}\nYou can turn these emails off under More, Account.`);
}

/** Checks a Google ID token's signature against Google's published keys, then its claims. */
interface GClaims { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean | string; name?: string; exp?: number }
async function verifyGoogleToken(idt: string): Promise<GClaims | null> {
  try {
    const [h, p, sig] = idt.split(".");
    if (!h || !p || !sig) return null;
    const head = JSON.parse(new TextDecoder().decode(unb64(h))) as { alg?: string; kid?: string };
    if (head.alg !== "RS256" || !head.kid) return null;
    const jwks = (await (await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)).json()) as { keys: (JsonWebKey & { kid: string })[] };
    const jwk = jwks.keys.find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64(sig), enc.encode(`${h}.${p}`)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64(p))) as GClaims;
  } catch { return null; }
}
async function auth(req: Request, db: D1Database): Promise<User | null> {
  let h = req.headers.get("authorization") ?? "";
  if (!h) { const m = /bearer\.([\w-]+)/.exec(req.headers.get("sec-websocket-protocol") ?? ""); if (m) h = `Bearer ${m[1]}`; } // WebSockets carry the token as a subprotocol
  if (!h.startsWith("Bearer ")) return null;
  const row = await db.prepare("SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND t.expires > ?").bind(await sha(h.slice(7)), Date.now()).first<User>();
  return row ?? null;
}
const coachName = async (db: D1Database, cid: string | null) => (cid ? (await db.prepare("SELECT name FROM users WHERE id = ?").bind(cid).first<{ name: string }>())?.name ?? null : null);
const code = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(rand(6), (b) => a[b % a.length]).join(""); };
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

const KINDS = new Set(["settings", "mesos", "sessions", "feedback", "adjustments", "bodyweight", "kv"]);
const MAX_DOC = 900_000;

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const db = env.DB;
  ORIGIN = env.PUBLIC_ORIGIN || url.origin;
  ADMINS = (env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  const ip = ipOf(req); // empty on local dev, where address limits are skipped
  if (ip && (await limited(db, `api:${ip}`, 600, 60))) return tooMany(60);
  const body = async <T,>() => (await req.json().catch(() => ({}))) as T;

  if (path === "/api/config") return json({ google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), mail: !!env.EMAIL });

  /** Client errors land in the Worker logs (Cloudflare dashboard, Observability) so a crash is seen before the client reports it. */
  if (path === "/api/log" && req.method === "POST") {
    if (ip && (await limited(db, `log:${ip}`, 20, 600))) return tooMany(600);
    const b = await body<{ msg?: string; stack?: string; at?: string; build?: string }>();
    console.error(JSON.stringify({ client_error: clean(b.msg, 300), stack: clean(b.stack, 1200), at: clean(b.at, 120), build: clean(b.build, 20), ua: clean(req.headers.get("user-agent"), 160) }));
    return json({ ok: true });
  }

  /* ---- Password reset and email verification ---- */
  if (path === "/api/password/forgot" && req.method === "POST") {
    const b = await body<{ email?: string }>();
    const em = clean(b.email, 200).toLowerCase();
    if ((ip && (await limited(db, `forgot:${ip}`, 8, 3600))) || (await limited(db, `forgotE:${em}`, 3, 3600))) return tooMany(3600);
    const u = await db.prepare("SELECT id, email FROM users WHERE email = ?").bind(em).first<{ id: string; email: string }>();
    if (u) {
      const t = await mailToken(db, u.id, "reset", 1);
      await sendMail(env, u.email, "Reset your Ledger password", `Open this link within an hour to choose a new password:\n\n${ORIGIN}/#reset=${t}\n\nIf you did not ask for this, ignore this message. Your password stays the same.`);
    }
    return json({ ok: true, mail: !!env.EMAIL }); // same answer whether or not the account exists
  }
  if (path === "/api/password/reset" && req.method === "POST") {
    if (ip && (await limited(db, `reset:${ip}`, 20, 3600))) return tooMany(3600);
    const b = await body<{ token?: string; password?: string }>();
    if (typeof b.password !== "string" || b.password.length < 8) return fail(400, "Use a password of at least 8 characters.");
    if (b.password.length > 200) return fail(400, "That password is too long.");
    const uid = await useMailToken(db, "reset", b.token);
    if (!uid) return fail(400, "This reset link has expired or was already used. Ask for a new one.");
    const salt = rand(16);
    await db.batch([db.prepare("UPDATE users SET salt = ?, hash = ?, email_verified = 1 WHERE id = ?").bind(b64(salt), await hashPw(b.password, salt), uid), db.prepare("DELETE FROM tokens WHERE user_id = ?").bind(uid)]);
    const u = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>())!;
    return json({ token: await newToken(db, uid, deviceLabel(req)), user: pub(u, await coachName(db, u.coach_id)) });
  }
  if (path === "/api/email/verify" && req.method === "POST") {
    const b = await body<{ token?: string }>();
    const uid = await useMailToken(db, "verify", b.token);
    if (!uid) return fail(400, "This confirmation link has expired or was already used.");
    await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(uid).run();
    return json({ ok: true });
  }


  /** An unused, unexpired invite for this token, or null. */
  const findInvite = (t: unknown) => (typeof t === "string" && t.length >= 16 && t.length <= 64
    ? db.prepare("SELECT * FROM invites WHERE token = ? AND used IS NULL AND expires > ?").bind(t, Date.now()).first<{ id: string; role: string; email: string | null; note: string | null }>() : Promise.resolve(null));
  if (path === "/api/invite/check" && req.method === "GET") {
    if (ip && (await limited(db, `ichk:${ip}`, 60, 600))) return tooMany(600);
    const inv = await findInvite(url.searchParams.get("t"));
    return json(inv ? { valid: true, role: inv.role, email: inv.email, note: inv.note } : { valid: false });
  }

  if (path === "/api/signup" && req.method === "POST") {
    if (ip && (await limited(db, `signup:${ip}`, 10, 3600))) return tooMany(3600);
    const b = await body<{ email: string; password: string; name: string; code?: string; coachKey?: string; invite?: string }>();
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Enter a valid email address.");
    if (typeof b.password !== "string" || b.password.length < 8) return fail(400, "Use a password of at least 8 characters.");
    if (b.password.length > 200) return fail(400, "That password is too long.");
    if (!name) return fail(400, "Enter your name.");
    let role: "athlete" | "coach" = "athlete", coach: string | null = null, inviteId: string | null = null;
    if (b.invite) {
      const inv = await findInvite(b.invite);
      if (!inv) return fail(400, "That invite link has expired or was already used. Ask for a new one.");
      if (inv.email && inv.email.toLowerCase() !== email) return fail(400, `This invite is for ${inv.email}. Use that address.`);
      if (inv.role === "coach") role = "coach";
      inviteId = inv.id;
    } else if (b.coachKey) {
      if (!env.COACH_KEY || !safeEq(b.coachKey, env.COACH_KEY)) return fail(403, "That coach key is not valid.");
      role = "coach";
    } else if (b.code) {
      const c = await db.prepare("SELECT id FROM users WHERE invite = ? AND role = 'coach'").bind(clean(b.code, 12).toUpperCase()).first<{ id: string }>();
      if (!c) return fail(400, "That coach code was not found. Check it or leave it blank.");
      coach = c.id;
    }
    if (await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) return fail(409, "An account with this email already exists. Log in instead.");
    const uid = id(), salt = rand(16);
    await db.prepare("INSERT INTO users (id,email,name,salt,hash,role,coach_id,invite,created) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(uid, email, name, b64(salt), await hashPw(b.password, salt), role, coach, role === "coach" ? code() : null, Date.now()).run();
    if (inviteId) await db.prepare("UPDATE invites SET used_by = ?, used = ? WHERE id = ?").bind(uid, Date.now(), inviteId).run();
    const u = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>())!;
    await sendVerify(env, db, u);
    return json({ token: await newToken(db, uid, deviceLabel(req)), user: pub(u, await coachName(db, u.coach_id)) });
  }

  if (path === "/api/login" && req.method === "POST") {
    const b = await body<{ email: string; password: string }>();
    const em = clean(b.email, 200).toLowerCase();
    if ((ip && (await limited(db, `login:${ip}`, 20, 900))) || (await limited(db, `loginE:${em}`, 10, 900))) return tooMany(900);
    const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(em).first<User & { salt: string; hash: string }>();
    if (row && !row.hash) return fail(401, "This account signs in with Google. Use the Continue with Google button.");
    const ok = row && String(b.password ?? "").length <= 200 && safeEq(await hashPw(String(b.password ?? ""), unb64(row.salt)), row.hash);
    if (!row || !ok) return fail(401, "Email or password is not right.");
    return json({ token: await newToken(db, row.id, deviceLabel(req)), user: pub(row, await coachName(db, row.coach_id)) });
  }

  /* ---- Sign in with Google: authorization code flow with PKCE. The app never sees Google's tokens, only a one-time code. ---- */
  const APP_SCHEME = "com.coachleonidas.ledger";
  const origin = env.PUBLIC_ORIGIN || url.origin;
  const cookie = (v: string, age: number) => `lg_o=${v}; Max-Age=${age}; Path=/api/google; HttpOnly; Secure; SameSite=Lax`;
  const cookieVal = () => /(?:^|; )lg_o=([^;]*)/.exec(req.headers.get("cookie") ?? "")?.[1] ?? "";
  if (path === "/api/google/start" && req.method === "GET") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response("Google sign-in is not set up yet.", { status: 503 });
    if (ip && (await limited(db, `gstart:${ip}`, 30, 600))) return tooMany(600);
    const challenge = url.searchParams.get("c") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return new Response("Bad request", { status: 400 });
    const coachCode = clean(url.searchParams.get("code"), 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const state = b64(rand(24)), verifier = b64(rand(48));
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/google/callback`, response_type: "code", scope: "openid email profile",
      state, code_challenge: b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)))), code_challenge_method: "S256", prompt: "select_account",
    });
    return new Response(null, { status: 302, headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, "set-cookie": cookie(`${state}.${verifier}.${challenge}.${url.searchParams.get("app") === "1" ? "1" : "0"}.${coachCode}.${clean(url.searchParams.get("inv"), 64).replace(/[^\w-]/g, "")}`, 600), "cache-control": "no-store" } });
  }
  if (path === "/api/google/callback" && req.method === "GET") {
    const [state, verifier, challenge, app, coachCode, invTok] = cookieVal().split(".");
    const back = (why: string) => (app === "1"
      ? new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ledger</title><body style="font:18px system-ui;padding:32px 20px"><p>Google sign-in did not finish (${why}). Go back to Ledger and try again.</p>`, { status: 400, headers: { "content-type": "text/html; charset=utf-8", "set-cookie": cookie("", 0) } })
      : new Response(null, { status: 302, headers: { location: `/?signin=${why}`, "set-cookie": cookie("", 0) } }));
    if (url.searchParams.get("error")) return back("cancelled");
    if (!state || !verifier || !challenge || !safeEq(state, url.searchParams.get("state") ?? "")) return back("state");
    const gcode = url.searchParams.get("code");
    if (!gcode || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return back("code");
    const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: gcode, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${origin}/api/google/callback`, grant_type: "authorization_code", code_verifier: verifier }) });
    if (!tr.ok) return back("google");
    const claims = await verifyGoogleToken(String(((await tr.json().catch(() => ({}))) as { id_token?: string }).id_token));
    if (!claims) return back("token");
    const verified = claims.email_verified === true || claims.email_verified === "true";
    if (!["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub || !claims.email || !verified || (claims.exp ?? 0) * 1000 < Date.now()) return back("claims");
    const email = claims.email.toLowerCase();
    const inv = invTok ? await findInvite(invTok) : null;
    const invOk = !!inv && (!inv.email || inv.email.toLowerCase() === email);
    let u = await db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(claims.sub).first<User>();
    if (!u) {
      const byMail = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
      if (byMail) { await db.prepare("UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?").bind(claims.sub, byMail.id).run(); u = byMail; } // Google has verified this address
      else {
        const c = coachCode ? await db.prepare("SELECT id FROM users WHERE invite = ? AND role = 'coach'").bind(coachCode).first<{ id: string }>() : null;
        const uid = id();
        await db.prepare("INSERT INTO users (id,email,name,salt,hash,role,coach_id,invite,created,google_sub,email_verified) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
          .bind(uid, email, clean(claims.name, 80) || email.split("@")[0], "", "", invOk && inv!.role === "coach" ? "coach" : "athlete", c?.id ?? null, invOk && inv!.role === "coach" ? code() : null, Date.now(), claims.sub).run();
        u = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>())!;
      }
    }
    if (invOk && inv!.role === "coach" && u.role !== "coach") { await db.prepare("UPDATE users SET role = 'coach', invite = COALESCE(invite, ?) WHERE id = ?").bind(code(), u.id).run(); }
    if (invOk) await db.prepare("UPDATE invites SET used_by = ?, used = ? WHERE id = ?").bind(u.id, Date.now(), inv!.id).run();
    const once = b64(rand(32));
    await db.prepare("INSERT INTO tokens (hash, user_id, expires) VALUES (?,?,?)").bind(await sha(`xc:${once}:${challenge}`), u.id, Date.now() + 120000).run();
    if (app === "1") {
      const link = `${APP_SCHEME}://signin?code=${once}`;
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back to Ledger</title><body style="font:18px system-ui;padding:32px 20px"><h1 style="font-size:24px">You are signed in</h1><p>Return to the Ledger app to finish.</p><p><a href="${link}" style="display:inline-block;background:#2f6bff;color:#fff;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open Ledger</a></p><script>location.href=${JSON.stringify(link)}</script>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": cookie("", 0) } });
    }
    return new Response(null, { status: 302, headers: { location: `/#gcode=${once}`, "set-cookie": cookie("", 0), "cache-control": "no-store" } });
  }
  if (path === "/api/google/exchange" && req.method === "POST") {
    if (ip && (await limited(db, `gx:${ip}`, 30, 600))) return tooMany(600);
    const b = await body<{ code?: string; v?: string }>();
    if (typeof b.code !== "string" || typeof b.v !== "string" || b.v.length < 32 || b.v.length > 200) return fail(400, "Sign-in expired. Try again.");
    const challenge = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(b.v))));
    const h = await sha(`xc:${b.code}:${challenge}`);
    const row = await db.prepare("SELECT user_id FROM tokens WHERE hash = ? AND expires > ?").bind(h, Date.now()).first<{ user_id: string }>();
    if (!row) return fail(400, "Sign-in expired. Try again.");
    await db.prepare("DELETE FROM tokens WHERE hash = ?").bind(h).run();
    const u = await db.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first<User>();
    if (!u) return fail(400, "Sign-in expired. Try again.");
    return json({ token: await newToken(db, u.id, deviceLabel(req)), user: pub(u, await coachName(db, u.coach_id)) });
  }

  const me = await auth(req, db);
  if (!me) return fail(401, "Please log in.");
  if (await limited(db, `u:${me.id}`, 240, 60)) return tooMany(60);

  /* ---- Live sync: a WebSocket per account. The token travels in the subprotocol so it never lands in a URL or a log. ---- */
  if (path === "/api/live") {
    if (!env.HUB) return fail(501, "Live sync is not available.");
    if (req.headers.get("upgrade") !== "websocket") return fail(426, "Expected a WebSocket.");
    let room = me.id;
    const want = url.searchParams.get("c");
    if (want && want !== me.id) {
      if (me.role !== "coach" || !(await db.prepare("SELECT 1 FROM users WHERE id = ? AND coach_id = ?").bind(want, me.id).first())) return fail(403, "Not your client.");
      room = want;
    }
    return env.HUB.get(env.HUB.idFromName(room)).fetch(req);
  }

  if (path === "/api/me") return json({ user: pub(me, await coachName(db, me.coach_id)) });
  if (path === "/api/logout" && req.method === "POST") {
    await db.prepare("DELETE FROM tokens WHERE hash = ?").bind(await sha((req.headers.get("authorization") ?? "").slice(7))).run();
    return json({ ok: true });
  }
  /* ---- Signed-in devices ---- */
  if (path === "/api/sessions" && req.method === "GET") {
    const cur = (await sha((req.headers.get("authorization") ?? "").slice(7))).slice(0, 12);
    const rows = (await db.prepare("SELECT hash, label, created, expires FROM tokens WHERE user_id = ? AND expires > ? AND created IS NOT NULL ORDER BY COALESCE(created, 0) DESC").bind(me.id, Date.now()).all<{ hash: string; label: string | null; created: number | null; expires: number }>()).results;
    return json({ devices: rows.map((r) => ({ id: r.hash.slice(0, 12), label: r.label ?? "Device", created: r.created, current: r.hash.slice(0, 12) === cur })) });
  }
  if (path === "/api/sessions/revoke" && req.method === "POST") {
    const b = await body<{ id?: string; all?: boolean }>();
    const cur = await sha((req.headers.get("authorization") ?? "").slice(7));
    if (b.all) await db.prepare("DELETE FROM tokens WHERE user_id = ? AND hash != ?").bind(me.id, cur).run();
    else if (typeof b.id === "string" && /^[\w-]{12}$/.test(b.id)) await db.prepare("DELETE FROM tokens WHERE user_id = ? AND substr(hash, 1, 12) = ? AND hash != ?").bind(me.id, b.id, cur).run();
    return json({ ok: true });
  }
  /* ---- Consent, notification preference, email confirmation ---- */
  if (path === "/api/consent" && req.method === "POST") {
    await db.prepare("UPDATE users SET consent = ? WHERE id = ?").bind(Date.now(), me.id).run();
    return json({ user: pub({ ...me, consent: Date.now() }, await coachName(db, me.coach_id)) });
  }
  if (path === "/api/prefs" && req.method === "POST") {
    const b = await body<{ notify?: boolean }>();
    await db.prepare("UPDATE users SET notify = ? WHERE id = ?").bind(b.notify === false ? 0 : 1, me.id).run();
    return json({ user: pub({ ...me, notify: b.notify === false ? 0 : 1 }, await coachName(db, me.coach_id)) });
  }
  if (path === "/api/email/resend" && req.method === "POST") {
    if (me.email_verified) return json({ ok: true, sent: false });
    if (await limited(db, `resend:${me.id}`, 3, 3600)) return tooMany(3600);
    return json({ ok: true, sent: await sendVerify(env, db, me) });
  }
  /* ---- Client messages to their coach ---- */
  if (path === "/api/message" && req.method === "POST") {
    if (!me.coach_id) return fail(400, "Join a coach first.");
    const b = await body<{ body?: string; sessionId?: string }>();
    const text = clean(b.body, 2000);
    if (!text) return fail(400, "Write something first.");
    const cid = id();
    await db.prepare("INSERT INTO comments (id,coach_id,client_id,session_id,body,created,from_client,unseen) VALUES (?,?,?,?,?,?,1,1)").bind(cid, me.coach_id, me.id, b.sessionId ? clean(b.sessionId, 200) : null, text, Date.now()).run();
    await poke(env, me.coach_id, me.id);
    await notify(env, db, me.coach_id, `${me.name} sent you a message`, `${me.name}: ${text.slice(0, 300)}`);
    return json({ ok: true, id: cid });
  }
  if (path === "/api/message" && req.method === "DELETE") {
    const b = await body<{ id: string }>();
    await db.prepare("DELETE FROM comments WHERE id = ? AND client_id = ? AND from_client = 1").bind(String(b.id ?? ""), me.id).run();
    await poke(env, me.coach_id);
    return json({ ok: true });
  }
  if (path === "/api/join" && req.method === "POST") {
    const b = await body<{ code?: string }>();
    if (!b.code) { await db.prepare("UPDATE users SET coach_id = NULL WHERE id = ?").bind(me.id).run(); return json({ user: pub({ ...me, coach_id: null }) }); }
    const c = await db.prepare("SELECT id, name FROM users WHERE invite = ? AND role = 'coach'").bind(clean(b.code, 12).toUpperCase()).first<{ id: string; name: string }>();
    if (!c) return fail(400, "That coach code was not found.");
    await db.prepare("UPDATE users SET coach_id = ? WHERE id = ?").bind(c.id, me.id).run();
    return json({ user: pub({ ...me, coach_id: c.id }, c.name) });
  }
  /* ---- Coach access requests (any athlete) ---- */
  if (path === "/api/coach-request" && req.method === "POST") {
    if (me.role === "coach") return fail(400, "You are already a coach.");
    const b = await body<{ note?: string }>();
    await db.prepare("INSERT INTO coach_requests (user_id, note, created) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET note = excluded.note, created = excluded.created").bind(me.id, clean(b.note, 300), Date.now()).run();
    return json({ ok: true });
  }
  if (path === "/api/coach-request" && req.method === "GET") {
    return json({ pending: !!(await db.prepare("SELECT 1 FROM coach_requests WHERE user_id = ?").bind(me.id).first()) });
  }

  /* ---- Admin: who signed up, coach approvals and invite links ---- */
  if (path.startsWith("/api/admin/")) {
    if (!isAdmin(me)) return fail(403, "Admins only.");
    if (path === "/api/admin/overview" && req.method === "GET") {
      const users = (await db.prepare(`SELECT u.id, u.name, u.email, u.role, u.created, u.google_sub IS NOT NULL AS google, u.hash != '' AS password, u.email_verified AS verified, c.name AS coach,
        (SELECT MAX(updated) FROM docs d WHERE d.user_id = u.id) AS last,
        (SELECT COUNT(*) FROM users k WHERE k.coach_id = u.id) AS clients
        FROM users u LEFT JOIN users c ON c.id = u.coach_id ORDER BY u.created DESC LIMIT 1000`).all<Record<string, unknown>>()).results;
      const requests = (await db.prepare("SELECT r.user_id AS id, u.name, u.email, r.note, r.created FROM coach_requests r JOIN users u ON u.id = r.user_id ORDER BY r.created").all()).results;
      const invites = (await db.prepare("SELECT i.id, i.token, i.role, i.email, i.note, i.created, i.expires, i.used, u.name AS usedBy FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created DESC LIMIT 200").all()).results;
      const week = Date.now() - 7 * 864e5;
      return json({ stats: { users: users.length, coaches: users.filter((u) => u.role === "coach").length, week: users.filter((u) => Number(u.created) > week).length }, users, requests, invites });
    }
    const b = await body<{ id?: string; userId?: string; approve?: boolean; role?: string; email?: string; note?: string; days?: number; kind?: string }>();
    if (path === "/api/admin/invite" && req.method === "POST") {
      const email = clean(b.email, 200).toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "That email address is not valid.");
      const token = b64(rand(24)), days = Math.min(60, Math.max(1, Number(b.days) || 14));
      await db.prepare("INSERT INTO invites (id,token,role,email,note,created_by,created,expires) VALUES (?,?,?,?,?,?,?,?)").bind(id(), token, "coach", email || null, clean(b.note, 120) || null, me.id, Date.now(), Date.now() + days * 864e5).run();
      return json({ token });
    }
    if (path === "/api/admin/invite" && req.method === "DELETE") {
      await db.prepare("DELETE FROM invites WHERE id = ?").bind(String(b.id ?? "")).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/request" && req.method === "POST") {
      const uid = String(b.userId ?? "");
      if (b.approve) await db.prepare("UPDATE users SET role = 'coach', invite = COALESCE(invite, ?) WHERE id = ?").bind(code(), uid).run();
      await db.prepare("DELETE FROM coach_requests WHERE user_id = ?").bind(uid).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/reset" && req.method === "POST") {
      const t = await mailToken(db, String(b.userId ?? ""), "reset", 24);
      return json({ link: `${ORIGIN}/#reset=${t}` });
    }
    if (path === "/api/admin/role" && req.method === "POST") {
      const uid = String(b.userId ?? "");
      if (uid === me.id) return fail(400, "You cannot change your own role.");
      if (b.role === "coach") await db.prepare("UPDATE users SET role = 'coach', invite = COALESCE(invite, ?) WHERE id = ?").bind(code(), uid).run();
      else if (b.role === "athlete") await db.batch([db.prepare("UPDATE users SET coach_id = NULL WHERE coach_id = ?").bind(uid), db.prepare("UPDATE users SET role = 'athlete' WHERE id = ?").bind(uid)]);
      else return fail(400, "Unknown role.");
      return json({ ok: true });
    }
    return fail(404, "Not found.");
  }

  if (path === "/api/account" && req.method === "DELETE") {
    await db.batch([db.prepare("DELETE FROM docs WHERE user_id = ?").bind(me.id), db.prepare("DELETE FROM tokens WHERE user_id = ?").bind(me.id), db.prepare("DELETE FROM mail_tokens WHERE user_id = ?").bind(me.id), db.prepare("DELETE FROM coach_requests WHERE user_id = ?").bind(me.id),
      db.prepare("DELETE FROM assignments WHERE client_id = ? OR coach_id = ?").bind(me.id, me.id), db.prepare("DELETE FROM comments WHERE client_id = ? OR coach_id = ?").bind(me.id, me.id),
      db.prepare("UPDATE users SET coach_id = NULL WHERE coach_id = ?").bind(me.id), db.prepare("DELETE FROM users WHERE id = ?").bind(me.id)]);
    return json({ ok: true });
  }

  if (path === "/api/reset" && req.method === "POST") {
    await db.prepare("DELETE FROM docs WHERE user_id = ?").bind(me.id).run();
    return json({ ok: true });
  }

  /** Delta sync. The client pushes changed docs and gets back everything newer than its cursor, plus coaching items. */
  if (path === "/api/sync" && req.method === "POST") {
    const b = await body<{ since?: number; push?: { kind: string; id: string; data: unknown; ts: number; deleted?: boolean }[] }>();
    const now = Date.now();
    const writes: ReturnType<D1Database["prepare"]>[] = [];
    for (const d of (b.push ?? []).slice(0, 400)) {
      if (!KINDS.has(d.kind) || typeof d.id !== "string" || d.id.length > 200) continue;
      const data = d.deleted ? null : JSON.stringify(d.data);
      if (data && data.length > MAX_DOC) continue;
      writes.push(db.prepare("INSERT INTO docs (user_id,kind,doc_id,data,ts,updated,deleted) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,kind,doc_id) DO UPDATE SET data=excluded.data, ts=excluded.ts, updated=excluded.updated, deleted=excluded.deleted WHERE excluded.ts >= docs.ts")
        .bind(me.id, d.kind, d.id, data, Number(d.ts) || now, now, d.deleted ? 1 : 0));
    }
    if (writes.length) { await db.batch(writes); await poke(env, me.id, me.coach_id); }
    const since = Number(b.since) || 0;
    const rows = (await db.prepare("SELECT kind, doc_id, data, ts, deleted, updated FROM docs WHERE user_id = ? AND updated >= ? ORDER BY updated LIMIT 600").bind(me.id, since).all<{ kind: string; doc_id: string; data: string | null; ts: number; deleted: number; updated: number }>()).results;
    const more = rows.length === 600;
    const cursor = more ? rows[rows.length - 1].updated : now;
    const assignments = (await db.prepare("SELECT a.id, a.name, a.payload, a.note, a.state, a.created, u.name AS coach FROM assignments a JOIN users u ON u.id = a.coach_id WHERE a.client_id = ? ORDER BY a.created DESC LIMIT 30").bind(me.id).all<{ id: string; name: string; payload: string; note: string | null; state: string; created: number; coach: string }>()).results
      .map((a) => ({ ...a, payload: JSON.parse(a.payload) }));
    const comments = (await db.prepare("SELECT c.id, c.session_id AS sessionId, c.body, c.created, c.from_client AS fromClient, u.name AS coach FROM comments c JOIN users u ON u.id = c.coach_id WHERE c.client_id = ? ORDER BY c.created DESC LIMIT 100").bind(me.id).all()).results;
    return json({ docs: rows.map((r) => ({ kind: r.kind, id: r.doc_id, data: r.data ? JSON.parse(r.data) : null, ts: r.ts, deleted: !!r.deleted })), cursor, more, assignments, comments, user: pub(me, await coachName(db, me.coach_id)) });
  }

  if (path === "/api/assignments/accept" && req.method === "POST") {
    const b = await body<{ id: string }>();
    await db.prepare("UPDATE assignments SET state = 'accepted' WHERE id = ? AND client_id = ?").bind(b.id, me.id).run();
    return json({ ok: true });
  }

  // coach endpoints
  if (path.startsWith("/api/coach/")) {
    if (me.role !== "coach") return fail(403, "Coach accounts only.");
    if (path === "/api/coach/clients") {
      const clients = (await db.prepare("SELECT id, name, email, created, coach_archived AS archived FROM users WHERE coach_id = ? ORDER BY name").bind(me.id).all<{ id: string; name: string; email: string; created: number; archived: number }>()).results;
      if (!clients.length) return json({ clients: [] });
      const ids = clients.map((c) => c.id), ph = ids.map(() => "?").join(",");
      const now = Date.now(), weekAgo = now - 7 * 864e5;
      const stat = new Map((await db.prepare(`SELECT user_id, COUNT(*) AS n, MAX(updated) AS last,
        SUM(CASE WHEN json_extract(data, '$.status') = 'done' AND COALESCE(json_extract(data, '$.finished'), ts) > ? THEN 1 ELSE 0 END) AS week,
        MAX(CASE WHEN json_extract(data, '$.status') = 'done' THEN COALESCE(json_extract(data, '$.finished'), ts) END) AS lastDone
        FROM docs WHERE kind = 'sessions' AND deleted = 0 AND user_id IN (${ph}) GROUP BY user_id`).bind(weekAgo, ...ids).all<{ user_id: string; n: number; last: number | null; week: number; lastDone: number | null }>()).results.map((r) => [r.user_id, r]));
      const unseen = new Map((await db.prepare(`SELECT client_id, COUNT(*) AS n FROM comments WHERE coach_id = ? AND from_client = 1 AND unseen = 1 AND client_id IN (${ph}) GROUP BY client_id`).bind(me.id, ...ids).all<{ client_id: string; n: number }>()).results.map((r) => [r.client_id, r.n]));
      const waiting = new Map((await db.prepare(`SELECT client_id, MIN(created) AS since FROM assignments WHERE coach_id = ? AND state = 'sent' AND client_id IN (${ph}) GROUP BY client_id`).bind(me.id, ...ids).all<{ client_id: string; since: number }>()).results.map((r) => [r.client_id, r.since]));
      const out = clients.map((c) => {
        const st = stat.get(c.id);
        const idle = st?.lastDone ? Math.floor((now - st.lastDone) / 864e5) : null;
        const flags: { kind: "bad" | "warn" | "acc"; text: string }[] = [];
        if (unseen.get(c.id)) flags.push({ kind: "acc", text: `${unseen.get(c.id)} new message${unseen.get(c.id)! > 1 ? "s" : ""}` });
        if (!st?.lastDone) flags.push({ kind: "warn", text: "Has not logged a session" });
        else if (idle! >= 5) flags.push({ kind: "bad", text: `No session in ${idle} days` });
        if (waiting.has(c.id) && now - waiting.get(c.id)! > 3 * 864e5) flags.push({ kind: "warn", text: "Program not started" });
        const attention = (unseen.get(c.id) ? 3 : 0) + (flags.some((f) => f.kind === "bad") ? 4 : 0) + (flags.some((f) => f.kind === "warn") ? 2 : 0);
        return { ...c, archived: !!c.archived, sessions: st?.n ?? 0, lastSync: st?.last ?? null, lastDone: st?.lastDone ?? null, week: st?.week ?? 0, flags, attention };
      }).sort((a, b) => b.attention - a.attention || a.name.localeCompare(b.name));
      return json({ clients: out });
    }
    const m = /^\/api\/coach\/clients\/([^/]+)(?:\/(data|archive|remove|reset-link|program))?$/.exec(path);
    if (m) {
      const client = await db.prepare("SELECT id, name, email FROM users WHERE id = ? AND coach_id = ?").bind(m[1], me.id).first<{ id: string; name: string; email: string }>();
      if (!client) return fail(404, "Client not found.");
      if (m[2] === "data") {
        // Sessions older than about 14 months stay out of the first load so big accounts stay fast; ?days= widens it.
        const days = Math.min(3650, Math.max(30, Number(url.searchParams.get("days")) || 430));
        const rows = (await db.prepare("SELECT kind, doc_id, data FROM docs WHERE user_id = ? AND deleted = 0 AND (kind != 'sessions' OR ts > ?)").bind(client.id, Date.now() - days * 864e5).all<{ kind: string; doc_id: string; data: string }>()).results;
        const out: Record<string, unknown[]> = {};
        for (const r of rows) (out[r.kind] ??= []).push({ __id: r.doc_id, ...(JSON.parse(r.data) as object) });
        const comments = (await db.prepare("SELECT id, session_id AS sessionId, body, created, from_client AS fromClient FROM comments WHERE client_id = ? AND coach_id = ? ORDER BY created DESC LIMIT 300").bind(client.id, me.id).all()).results;
        await db.prepare("UPDATE comments SET unseen = 0 WHERE client_id = ? AND coach_id = ? AND from_client = 1 AND unseen = 1").bind(client.id, me.id).run();
        const assignments = (await db.prepare("SELECT id, name, note, state, created FROM assignments WHERE client_id = ? AND coach_id = ? ORDER BY created DESC LIMIT 30").bind(client.id, me.id).all()).results;
        return json({ client, data: out, comments, assignments, days });
      }
      if (m[2] === "program" && req.method === "POST") {
        // The coach edits the weeks of one of the client's blocks. Only the plan changes: logged sessions, settings and the block's other fields stay as they are.
        const b = await body<{ mesoId?: string; name?: string; weeks?: unknown; note?: string }>();
        const weeks = b.weeks as { week: unknown; sessions: unknown }[] | undefined;
        const num = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000);
        const okItem = (i: any) => i && typeof i.exercise === "string" && i.exercise.length > 0 && i.exercise.length <= 80 && typeof i.letter === "string" && i.letter.length <= 6 && typeof i.sets === "number" && i.sets >= 0 && i.sets <= 30 && num(i.repLo) && num(i.repHi) && num(i.rir);
        const okWeeks = Array.isArray(weeks) && weeks.length > 0 && weeks.length <= 30 && weeks.every((w: any) => typeof w.week === "number" && Array.isArray(w.sessions) && w.sessions.length <= 14 && w.sessions.every((s: any) => typeof s.name === "string" && s.name.length > 0 && s.name.length <= 60 && Array.isArray(s.items) && s.items.length <= 40 && s.items.every(okItem)));
        if (typeof b.mesoId !== "string" || !okWeeks) return fail(400, "That program is not valid.");
        const row = await db.prepare("SELECT data FROM docs WHERE user_id = ? AND kind = 'mesos' AND doc_id = ? AND deleted = 0").bind(client.id, b.mesoId).first<{ data: string }>();
        if (!row) return fail(404, "That block was not found.");
        const meso = { ...(JSON.parse(row.data) as object), weeks, ...(b.name ? { name: clean(b.name, 120) } : {}) };
        const data = JSON.stringify(meso);
        if (data.length > MAX_DOC) return fail(400, "That program is too large.");
        const now = Date.now();
        await db.prepare("UPDATE docs SET data = ?, ts = ?, updated = ? WHERE user_id = ? AND kind = 'mesos' AND doc_id = ?").bind(data, now, now, client.id, b.mesoId).run();
        const note = clean(b.note, 600);
        await db.prepare("INSERT INTO comments (id,coach_id,client_id,session_id,body,created) VALUES (?,?,?,?,?,?)").bind(id(), me.id, client.id, null, `I updated your program${note ? `: ${note}` : "."}`, now).run();
        await poke(env, client.id);
        await notify(env, db, client.id, `${me.name} updated your program`, `${me.name} changed your training plan${note ? `: ${note}` : "."} The new plan is already in your app.`);
        return json({ ok: true });
      }
      if (m[2] === "archive" && req.method === "POST") {
        const b = await body<{ archived?: boolean }>();
        await db.prepare("UPDATE users SET coach_archived = ? WHERE id = ?").bind(b.archived === false ? 0 : 1, client.id).run();
        return json({ ok: true });
      }
      if (m[2] === "remove" && req.method === "POST") {
        await db.prepare("UPDATE users SET coach_id = NULL, coach_archived = 0 WHERE id = ?").bind(client.id).run();
        return json({ ok: true });
      }
      if (m[2] === "reset-link" && req.method === "POST") {
        const t = await mailToken(db, client.id, "reset", 24);
        return json({ link: `${ORIGIN}/#reset=${t}` });
      }
    }
    if (path === "/api/coach/assign" && req.method === "POST") {
      const b = await body<{ clientId: string; name: string; payload: unknown; note?: string }>();
      const client = await db.prepare("SELECT id FROM users WHERE id = ? AND coach_id = ?").bind(b.clientId, me.id).first();
      if (!client) return fail(404, "Client not found.");
      const payload = JSON.stringify(b.payload);
      if (!b.payload || payload.length > MAX_DOC) return fail(400, "Program is missing or too large.");
      await db.prepare("INSERT INTO assignments (id,coach_id,client_id,name,payload,note,state,created) VALUES (?,?,?,?,?,?,'sent',?)").bind(id(), me.id, b.clientId, clean(b.name, 120) || "Program", payload, clean(b.note, 1000) || null, Date.now()).run();
      await poke(env, b.clientId);
      await notify(env, db, b.clientId, `${me.name} sent you a program`, `${me.name} assigned you "${clean(b.name, 120) || "a new program"}". Open the app and tap Start this program on the Train screen.`);
      return json({ ok: true });
    }
    if (path === "/api/coach/comment" && req.method === "POST") {
      const b = await body<{ clientId: string; sessionId?: string; body: string }>();
      const client = await db.prepare("SELECT id FROM users WHERE id = ? AND coach_id = ?").bind(b.clientId, me.id).first();
      if (!client) return fail(404, "Client not found.");
      const text = clean(b.body, 2000);
      if (!text) return fail(400, "Write something first.");
      const cid = id();
      await db.prepare("INSERT INTO comments (id,coach_id,client_id,session_id,body,created) VALUES (?,?,?,?,?,?)").bind(cid, me.id, b.clientId, b.sessionId ? clean(b.sessionId, 200) : null, text, Date.now()).run();
      await poke(env, b.clientId);
      await notify(env, db, b.clientId, `New feedback from ${me.name}`, `${me.name}: ${text.slice(0, 300)}`);
      return json({ ok: true, id: cid });
    }
    if (path === "/api/coach/comment" && req.method === "DELETE") {
      const b = await body<{ id: string }>();
      await db.prepare("DELETE FROM comments WHERE id = ? AND coach_id = ? AND from_client = 0").bind(b.id, me.id).run();
      return json({ ok: true });
    }
  }
  return fail(404, "Not found.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let res: Response;
    try { res = await handle(req, env); } catch (e) { console.error(e); res = fail(500, "Server error. Try again in a moment."); }
    if (res.status === 101) return res; // a WebSocket handshake cannot be copied into a new Response
    return harden(req, res, env);
  },
};
