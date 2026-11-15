import { create } from "zustand";
import { api, ApiError, loadAuth, saveAuth, setToken, type Account } from "./api";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { HOME, isNative } from "./native";
import { db, KINDS, LedgerDB, onRowChange, openDb, type SyncKind } from "./db";

/** Offline-first sync. Rows are written locally, queued in an outbox and pushed when online. Last write wins per row. */
export interface Assignment { id: string; name: string; payload: { meso: unknown; split: unknown; mode?: string; effort?: string; tms?: unknown }; note: string | null; state: string; created: number; coach: string }
export interface CoachComment { id: string; sessionId: string | null; body: string; created: number; coach: string }
interface SyncUI {
  user: Account | null; phase: "out" | "booting" | "in";
  status: "idle" | "syncing" | "offline" | "error"; last: number | null; error: string | null;
  assignments: Assignment[]; comments: CoachComment[]; seenComments: number;
}
export const useSync = create<SyncUI>(() => ({ user: null, phase: "out", status: "idle", last: null, error: null, assignments: [], comments: [], seenComments: 0 }));

let uid = "";
let applying = false;
let outbox = new Map<string, number>();
let afterPull: () => Promise<void> | void = () => {};
export const setAfterPull = (fn: typeof afterPull) => { afterPull = fn; };

const okey = (k: string, id: string) => `${k}\u0000${id}`;
const boxKey = () => `ledger.outbox.${uid}`;
const sinceKey = () => `ledger.since.${uid}`;
const persistBox = () => { try { localStorage.setItem(boxKey(), JSON.stringify([...outbox])); } catch { /* storage blocked */ } };
let timer: ReturnType<typeof setTimeout> | undefined;
const schedule = (ms = 2500) => { clearTimeout(timer); timer = setTimeout(() => void syncNow(), ms); };

onRowChange((kind, id) => {
  if (applying || !uid) return;
  outbox.set(okey(kind, id), Date.now()); persistBox(); schedule();
});

const table = (k: SyncKind) => db.table(k);
const dbKey = (k: SyncKind) => (k === "settings" || k === "kv" ? "key" : "id");

export async function markAllDirty() {
  const now = Date.now();
  for (const k of KINDS) for (const key of await table(k).toCollection().primaryKeys()) outbox.set(okey(k, String(key)), now);
  persistBox(); schedule(500);
}
export async function resetRemote() {
  outbox = new Map(); persistBox();
  try { localStorage.removeItem(sinceKey()); } catch { /* storage blocked */ }
  try { await api("/api/reset", {}); } catch { /* offline: server rows are replaced by the next full push */ }
}

let running = false, again = false;
export async function syncNow(): Promise<boolean> {
  if (!uid) return false;
  if (running) { again = true; return false; }
  running = true;
  useSync.setState({ status: "syncing" });
  try {
    let pulled = 0;
    for (let round = 0; round < 20; round++) {
      const batch = [...outbox].slice(0, 300);
      const push = [];
      for (const [k, ts] of batch) {
        const [kind, id] = k.split("\u0000") as [SyncKind, string];
        const row = await table(kind).get(id);
        push.push(row ? { kind, id, data: row, ts } : { kind, id, data: null, ts, deleted: true });
      }
      const since = Number(localStorage.getItem(sinceKey()) ?? 0) || 0;
      const r = await api<{ docs: { kind: SyncKind; id: string; data: unknown; ts: number; deleted: boolean }[]; cursor: number; more: boolean; assignments: Assignment[]; comments: CoachComment[]; user: Account }>("/api/sync", { since, push });
      for (const [k, ts] of batch) if (outbox.get(k) === ts) outbox.delete(k);
      persistBox();
      applying = true;
      try {
        for (const d of r.docs) {
          if (outbox.has(okey(d.kind, d.id))) continue;
          if (d.deleted) await table(d.kind).delete(d.id); else await table(d.kind).put(d.data);
          pulled++;
        }
      } finally { applying = false; }
      try { localStorage.setItem(sinceKey(), String(r.cursor)); } catch { /* storage blocked */ }
      useSync.setState({ assignments: r.assignments, comments: r.comments });
      if (JSON.stringify(r.user) !== JSON.stringify(useSync.getState().user)) { useSync.setState({ user: r.user }); saveAuth({ token: loadAuth()?.token ?? "", user: r.user }); }
      if (!r.more && outbox.size === 0) break;
    }
    if (pulled) await afterPull();
    useSync.setState({ status: "idle", last: Date.now(), error: null });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { await logout(false); return false; }
    useSync.setState({ status: e instanceof ApiError && e.status === 0 ? "offline" : "error", error: (e as Error).message });
    return false;
  } finally {
    running = false;
    if (again) { again = false; schedule(300); }
  }
}

/** Copies data from the pre-account "ledger" database into a new account, once per device. */
async function claimLegacy() {
  try {
    if (localStorage.getItem("ledger.legacy.claimed")) return;
    const st = await db.settings.get("main");
    if (st?.onboarded) return;
    if (!(await (await import("dexie")).default.exists("ledger"))) return;
    const old = new LedgerDB("ledger");
    await old.open();
    const main = await old.settings.get("main");
    if (main?.onboarded !== false && main) {
      await db.transaction("rw", db.tables, async () => {
        await db.settings.put(main); await db.mesos.bulkPut(await old.mesos.toArray()); await db.sessions.bulkPut(await old.sessions.toArray());
        await db.feedback.bulkPut(await old.feedback.toArray()); await db.adjustments.bulkPut(await old.adjustments.toArray());
        await db.bodyweight.bulkPut(await old.bodyweight.toArray()); await db.kv.bulkPut(await old.kv.toArray());
      });
      localStorage.setItem("ledger.legacy.claimed", uid);
    }
    old.close();
  } catch { /* nothing to claim */ }
}

/** Opens the account's database, pulls the latest data, then hands control to the app. */
export async function enterAccount(user: Account) {
  useSync.setState({ user, phase: "booting", assignments: [], comments: [] });
  uid = user.id;
  openDb(user.id);
  try { outbox = new Map(JSON.parse(localStorage.getItem(boxKey()) ?? "[]")); } catch { outbox = new Map(); }
  const first = localStorage.getItem(sinceKey()) == null;
  if (first) await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 8000))]);
  await claimLegacy();
  if (outbox.size === 0 && (await db.settings.count()) > 0 && first) await markAllDirty();
  await afterPull();
  useSync.setState({ phase: "in" });
  void syncNow();
}

export async function authenticate(kind: "login" | "signup", body: Record<string, unknown>) {
  const r = await api<{ token: string; user: Account }>(`/api/${kind}`, body);
  setToken(r.token); saveAuth(r);
  await enterAccount(r.user);
}
export async function resume() {
  const a = loadAuth();
  if (!a) { useSync.setState({ phase: "out" }); return; }
  setToken(a.token);
  await enterAccount(a.user);
}
export async function logout(tellServer = true) {
  if (tellServer) { await syncNow().catch(() => {}); try { await api("/api/logout", {}); } catch { /* offline */ } }
  clearTimeout(timer);
  setToken(null); saveAuth(null); uid = "";
  useSync.setState({ user: null, phase: "out", assignments: [], comments: [], status: "idle" });
  await afterPull();
}
export async function joinCoach(code: string) {
  const r = await api<{ user: Account }>("/api/join", { code });
  useSync.setState({ user: r.user }); saveAuth({ token: loadAuth()?.token ?? "", user: r.user });
}

for (const ev of ["online", "focus"] as const) window.addEventListener(ev, () => void syncNow());
setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, 60_000);


/* ---- Sign in with Google ---- */
const GV = "ledger.gv";
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const googleEnabled = () => api<{ google: boolean }>("/api/config").then((c) => c.google).catch(() => false);

/** Opens Google in the browser (a Custom Tab in the app). A random verifier stays on this device; only its hash goes to the server. */
export async function googleStart(coachCode?: string) {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(48)));
  try { localStorage.setItem(GV, verifier); } catch { throw new Error("Storage is blocked, so Google sign-in cannot work."); }
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const q = new URLSearchParams({ c: challenge, ...(isNative ? { app: "1" } : {}), ...(coachCode ? { code: coachCode } : {}) });
  const url = `${HOME}/api/google/start?${q}`;
  if (isNative) await Browser.open({ url }); else location.href = url;
}

/** Trades the one-time code from the redirect for a session. */
export async function googleFinish(code: string) {
  let v = "";
  try { v = localStorage.getItem(GV) ?? ""; localStorage.removeItem(GV); } catch { /* storage blocked */ }
  const r = await api<{ token: string; user: Account }>("/api/google/exchange", { code, v });
  setToken(r.token); saveAuth(r);
  await enterAccount(r.user);
}

/** Picks up the return from Google: a #gcode on the web, a deep link in the app. Returns true when it handled one. */
export function watchGoogleReturn(onError: (m: string) => void) {
  const run = (code: string) => { try { void Browser.close(); } catch { /* not open */ } googleFinish(code).catch((e) => onError((e as Error).message)); };
  const m = /gcode=([\w-]+)/.exec(location.hash);
  if (m) { history.replaceState(null, "", location.pathname); run(m[1]); return true; }
  const why = new URLSearchParams(location.search).get("signin");
  if (why) { history.replaceState(null, "", location.pathname); onError(why === "cancelled" ? "Google sign-in was cancelled." : "Google sign-in did not finish. Try again."); }
  if (isNative) void CapApp.addListener("appUrlOpen", (e) => { const c = /[?&]code=([\w-]+)/.exec(e.url); if (e.url.includes("://signin") && c) run(c[1]); });
  return false;
}
