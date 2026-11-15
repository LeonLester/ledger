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
const tooMany = (sec: number) => json({ error: "Too many attempts. Wait a few minutes and try again." }, 429, { "retry-after": String(sec) });

async function sha(s: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))); }
async function hashPw(pw: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256)));
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'athlete', coach_id TEXT, invite TEXT UNIQUE, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL, kind TEXT NOT NULL, doc_id TEXT NOT NULL, data TEXT, ts INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, kind, doc_id))",
  "CREATE INDEX IF NOT EXISTS docs_upd ON docs (user_id, updated)",
  "CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, note TEXT, state TEXT NOT NULL DEFAULT 'sent', created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS asg_client ON assignments (client_id)",
  "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, client_id TEXT NOT NULL, session_id TEXT, body TEXT NOT NULL, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS cmt_client ON comments (client_id, created)",
  "CREATE TABLE IF NOT EXISTS rl (k TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, exp INTEGER NOT NULL, PRIMARY KEY (k, w))",
];
let ready: Promise<unknown> | null = null;
const ensure = (db: D1Database) => (ready ??= (async () => {
  await db.batch(SCHEMA.map((q) => db.prepare(q)));
  try { await db.prepare("ALTER TABLE users ADD COLUMN google_sub TEXT").run(); } catch { /* column exists */ }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_gsub ON users (google_sub)").run();
})().catch((e) => { ready = null; throw e; }));

/** Fixed-window rate limit kept in D1. True when the caller is over the limit. */
async function limited(db: D1Database, key: string, limit: number, windowSec: number) {
  const now = Date.now(), win = Math.floor(now / (windowSec * 1000));
  const row = await db.prepare("INSERT INTO rl (k, w, n, exp) VALUES (?, ?, 1, ?) ON CONFLICT(k, w) DO UPDATE SET n = n + 1 RETURNING n").bind(key, win, (win + 1) * windowSec * 1000).first<{ n: number }>();
  if (Math.random() < 0.02) await db.prepare("DELETE FROM rl WHERE exp < ?").bind(now).run();
  return !!row && row.n > limit;
}
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? "";

interface User { id: string; email: string; name: string; role: "athlete" | "coach"; coach_id: string | null; invite: string | null }
const pub = (u: User, coachName?: string | null) => ({ id: u.id, email: u.email, name: u.name, role: u.role, coachId: u.coach_id, coachName: coachName ?? null, invite: u.role === "coach" ? u.invite : null });

async function newToken(db: D1Database, userId: string) {
  const t = b64(rand(32));
  await db.prepare("INSERT INTO tokens (hash, user_id, expires) VALUES (?,?,?)").bind(await sha(t), userId, Date.now() + 90 * 864e5).run();
  return t;
}
async function auth(req: Request, db: D1Database): Promise<User | null> {
  const h = req.headers.get("authorization") ?? "";
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
  await ensure(db);
  const ip = ipOf(req); // empty on local dev, where address limits are skipped
  if (ip && (await limited(db, `api:${ip}`, 300, 60))) return tooMany(60);
  const body = async <T,>() => (await req.json().catch(() => ({}))) as T;

  if (path === "/api/config") return json({ google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });

  if (path === "/api/signup" && req.method === "POST") {
    if (ip && (await limited(db, `signup:${ip}`, 10, 3600))) return tooMany(3600);
    const b = await body<{ email: string; password: string; name: string; code?: string; coachKey?: string }>();
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Enter a valid email address.");
    if (typeof b.password !== "string" || b.password.length < 8) return fail(400, "Use a password of at least 8 characters.");
    if (b.password.length > 200) return fail(400, "That password is too long.");
    if (!name) return fail(400, "Enter your name.");
    let role: "athlete" | "coach" = "athlete", coach: string | null = null;
    if (b.coachKey) {
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
    const u = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>())!;
    return json({ token: await newToken(db, uid), user: pub(u, await coachName(db, u.coach_id)) });
  }

  if (path === "/api/login" && req.method === "POST") {
    const b = await body<{ email: string; password: string }>();
    const em = clean(b.email, 200).toLowerCase();
    if ((ip && (await limited(db, `login:${ip}`, 20, 900))) || (await limited(db, `loginE:${em}`, 10, 900))) return tooMany(900);
    const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(em).first<User & { salt: string; hash: string }>();
    if (row && !row.hash) return fail(401, "This account signs in with Google. Use the Continue with Google button.");
    const ok = row && String(b.password ?? "").length <= 200 && safeEq(await hashPw(String(b.password ?? ""), unb64(row.salt)), row.hash);
    if (!row || !ok) return fail(401, "Email or password is not right.");
    return json({ token: await newToken(db, row.id), user: pub(row, await coachName(db, row.coach_id)) });
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
    return new Response(null, { status: 302, headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, "set-cookie": cookie(`${state}.${verifier}.${challenge}.${url.searchParams.get("app") === "1" ? "1" : "0"}.${coachCode}`, 600), "cache-control": "no-store" } });
  }
  if (path === "/api/google/callback" && req.method === "GET") {
    const [state, verifier, challenge, app, coachCode] = cookieVal().split(".");
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
    let claims: { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean | string; name?: string; exp?: number };
    try {
      const part = String(((await tr.json()) as { id_token?: string }).id_token).split(".")[1];
      claims = JSON.parse(new TextDecoder().decode(unb64(part)));
    } catch { return back("token"); }
    // The token came straight from Google over TLS in exchange for our code, so the claims are checked rather than the signature.
    const verified = claims.email_verified === true || claims.email_verified === "true";
    if (!["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub || !claims.email || !verified || (claims.exp ?? 0) * 1000 < Date.now()) return back("claims");
    const email = claims.email.toLowerCase();
    let u = await db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(claims.sub).first<User>();
    if (!u) {
      const byMail = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
      if (byMail) { await db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(claims.sub, byMail.id).run(); u = byMail; } // Google has verified this address
      else {
        const c = coachCode ? await db.prepare("SELECT id FROM users WHERE invite = ? AND role = 'coach'").bind(coachCode).first<{ id: string }>() : null;
        const uid = id();
        await db.prepare("INSERT INTO users (id,email,name,salt,hash,role,coach_id,invite,created,google_sub) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(uid, email, clean(claims.name, 80) || email.split("@")[0], "", "", "athlete", c?.id ?? null, null, Date.now(), claims.sub).run();
        u = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>())!;
      }
    }
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
    return json({ token: await newToken(db, u.id), user: pub(u, await coachName(db, u.coach_id)) });
  }

  const me = await auth(req, db);
  if (!me) return fail(401, "Please log in.");

  if (path === "/api/me") return json({ user: pub(me, await coachName(db, me.coach_id)) });
  if (path === "/api/logout" && req.method === "POST") {
    await db.prepare("DELETE FROM tokens WHERE hash = ?").bind(await sha((req.headers.get("authorization") ?? "").slice(7))).run();
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
  if (path === "/api/account" && req.method === "DELETE") {
    await db.batch([db.prepare("DELETE FROM docs WHERE user_id = ?").bind(me.id), db.prepare("DELETE FROM tokens WHERE user_id = ?").bind(me.id),
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
    if (writes.length) await db.batch(writes);
    const since = Number(b.since) || 0;
    const rows = (await db.prepare("SELECT kind, doc_id, data, ts, deleted, updated FROM docs WHERE user_id = ? AND updated >= ? ORDER BY updated LIMIT 600").bind(me.id, since).all<{ kind: string; doc_id: string; data: string | null; ts: number; deleted: number; updated: number }>()).results;
    const more = rows.length === 600;
    const cursor = more ? rows[rows.length - 1].updated : now;
    const assignments = (await db.prepare("SELECT a.id, a.name, a.payload, a.note, a.state, a.created, u.name AS coach FROM assignments a JOIN users u ON u.id = a.coach_id WHERE a.client_id = ? ORDER BY a.created DESC LIMIT 30").bind(me.id).all<{ id: string; name: string; payload: string; note: string | null; state: string; created: number; coach: string }>()).results
      .map((a) => ({ ...a, payload: JSON.parse(a.payload) }));
    const comments = (await db.prepare("SELECT c.id, c.session_id AS sessionId, c.body, c.created, u.name AS coach FROM comments c JOIN users u ON u.id = c.coach_id WHERE c.client_id = ? ORDER BY c.created DESC LIMIT 100").bind(me.id).all()).results;
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
      const clients = (await db.prepare("SELECT id, name, email, created FROM users WHERE coach_id = ? ORDER BY name").bind(me.id).all<{ id: string; name: string; email: string; created: number }>()).results;
      const out = [];
      for (const c of clients) {
        const s = await db.prepare("SELECT COUNT(*) AS n, MAX(updated) AS last FROM docs WHERE user_id = ? AND kind = 'sessions' AND deleted = 0").bind(c.id).first<{ n: number; last: number | null }>();
        const latest = await db.prepare("SELECT data FROM docs WHERE user_id = ? AND kind = 'sessions' AND deleted = 0 ORDER BY ts DESC LIMIT 1").bind(c.id).first<{ data: string }>();
        let lastSession: string | null = null; try { const d = latest ? JSON.parse(latest.data) : null; lastSession = d ? `${d.name} (week ${d.week})${d.date ? `, ${d.date}` : ""}` : null; } catch { /* ignore */ }
        out.push({ ...c, sessions: s?.n ?? 0, lastSync: s?.last ?? null, lastSession });
      }
      return json({ clients: out });
    }
    const m = /^\/api\/coach\/clients\/([^/]+)(?:\/(data))?$/.exec(path);
    if (m) {
      const client = await db.prepare("SELECT id, name, email FROM users WHERE id = ? AND coach_id = ?").bind(m[1], me.id).first<{ id: string; name: string; email: string }>();
      if (!client) return fail(404, "Client not found.");
      if (m[2] === "data") {
        const rows = (await db.prepare("SELECT kind, doc_id, data FROM docs WHERE user_id = ? AND deleted = 0").bind(client.id).all<{ kind: string; doc_id: string; data: string }>()).results;
        const out: Record<string, unknown[]> = {};
        for (const r of rows) (out[r.kind] ??= []).push({ __id: r.doc_id, ...(JSON.parse(r.data) as object) });
        const comments = (await db.prepare("SELECT id, session_id AS sessionId, body, created FROM comments WHERE client_id = ? AND coach_id = ? ORDER BY created DESC LIMIT 200").bind(client.id, me.id).all()).results;
        const assignments = (await db.prepare("SELECT id, name, note, state, created FROM assignments WHERE client_id = ? AND coach_id = ? ORDER BY created DESC LIMIT 30").bind(client.id, me.id).all()).results;
        return json({ client, data: out, comments, assignments });
      }
    }
    if (path === "/api/coach/assign" && req.method === "POST") {
      const b = await body<{ clientId: string; name: string; payload: unknown; note?: string }>();
      const client = await db.prepare("SELECT id FROM users WHERE id = ? AND coach_id = ?").bind(b.clientId, me.id).first();
      if (!client) return fail(404, "Client not found.");
      const payload = JSON.stringify(b.payload);
      if (!b.payload || payload.length > MAX_DOC) return fail(400, "Program is missing or too large.");
      await db.prepare("INSERT INTO assignments (id,coach_id,client_id,name,payload,note,state,created) VALUES (?,?,?,?,?,?,'sent',?)").bind(id(), me.id, b.clientId, clean(b.name, 120) || "Program", payload, clean(b.note, 1000) || null, Date.now()).run();
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
      return json({ ok: true, id: cid });
    }
    if (path === "/api/coach/comment" && req.method === "DELETE") {
      const b = await body<{ id: string }>();
      await db.prepare("DELETE FROM comments WHERE id = ? AND coach_id = ?").bind(b.id, me.id).run();
      return json({ ok: true });
    }
  }
  return fail(404, "Not found.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let res: Response;
    try { res = await handle(req, env); } catch (e) { console.error(e); res = fail(500, "Server error. Try again in a moment."); }
    return harden(req, res, env);
  },
};
