import { loadAuth } from "./api";
import { HOME, isNative } from "./native";

/** Opens a socket that is poked whenever the account (or, for a coach, one client) changes anywhere else.
 *  Reconnects by itself with a growing pause. Returns a function that closes it for good. */
export function watch(onPoke: () => void, clientId?: string): () => void {
  let ws: WebSocket | null = null, stopped = false, tries = 0, retry: ReturnType<typeof setTimeout> | undefined, beat: ReturnType<typeof setInterval> | undefined, hold: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    const a = loadAuth();
    if (stopped || !a || ws) return;
    const base = (isNative ? HOME : location.origin).replace(/^http/, "ws");
    try { ws = new WebSocket(`${base}/api/live${clientId ? `?c=${encodeURIComponent(clientId)}` : ""}`, [`bearer.${a.token}`]); } catch { ws = null; return; }
    ws.onopen = () => { tries = 0; clearInterval(beat); beat = setInterval(() => { try { ws?.send("ping"); } catch { /* closing */ } }, 25_000); onPoke(); };
    ws.onmessage = (e) => { if (e.data === "sync") { clearTimeout(hold); hold = setTimeout(onPoke, 120); } };
    ws.onclose = () => { clearInterval(beat); ws = null; if (!stopped) { clearTimeout(retry); retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(tries++, 5))); } };
    ws.onerror = () => { try { ws?.close(); } catch { /* already closed */ } };
  };
  const wake = () => { if (document.visibilityState === "visible") connect(); };
  window.addEventListener("online", connect); document.addEventListener("visibilitychange", wake);
  connect();
  return () => { stopped = true; clearTimeout(retry); clearTimeout(hold); clearInterval(beat); window.removeEventListener("online", connect); document.removeEventListener("visibilitychange", wake); try { ws?.close(); } catch { /* already closed */ } };
}
