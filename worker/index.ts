/// <reference path="./env.d.ts" />
/** Ledger API: accounts, sync and coaching on Cloudflare Workers + D1. Static assets are served by the assets binding. */

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const id = () => b64(rand(12));

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-max-age": "86400" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
const fail = (status: number, error: string) => json({ error }, status);

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
];
let ready: Promise<unknown> | null = null;
const ensure = (db: D1Database) => (ready ??= db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => { ready = null; throw e; }));

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const db = env.DB;
  await ensure(db);
  const body = async <T,>() => (await req.json().catch(() => ({}))) as T;

  if (path === "/api/signup" && req.method === "POST") {
    const b = await body<{ email: string; password: string; name: string; code?: string; coachKey?: string }>();
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Enter a valid email address.");
    if (!b.password || b.password.length < 8) return fail(400, "Use a password of at least 8 characters.");
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
    const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(clean(b.email, 200).toLowerCase()).first<User & { salt: string; hash: string }>();
    const ok = row && safeEq(await hashPw(String(b.password ?? ""), unb64(row.salt)), row.hash);
    if (!row || !ok) return fail(401, "Email or password is not right.");
    return json({ token: await newToken(db, row.id), user: pub(row, await coachName(db, row.coach_id)) });
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
    try { return await handle(req, env); } catch (e) { console.error(e); return fail(500, "Server error. Try again in a moment."); }
  },
};
