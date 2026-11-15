import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";

/** Where the Android build is published by .github/workflows/android.yml */
const REPO = "LeonLester/ledger";
const REL = `https://api.github.com/repos/${REPO}/releases/tags/android-latest`;
export const APK_URL = `https://github.com/${REPO}/releases/download/android-latest/ledger.apk`;
export const HOME = "https://ledger.coachleonidas.com";

declare const __BUILD__: string;
export const BUILD: string = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
export const isNative = Capacitor.isNativePlatform();
export const canUpdate = isNative && Capacitor.getPlatform() === "android";

const AppUpdate = registerPlugin<{ install(o: { url: string }): Promise<{ started?: boolean; needsPermission?: boolean }> }>("AppUpdate");

export interface UpdateInfo { current: number; latest: number; available: boolean; url: string }

/** The release notes carry "Build N". A newer N than the installed build means an update. */
export async function checkUpdate(force = false): Promise<UpdateInfo | null> {
  if (!canUpdate) return null;
  try { if (!force && Date.now() - Number(localStorage.getItem("ledger.upd.at") || 0) < 6 * 3600e3) return null; } catch { /* storage blocked */ }
  const cur = Number((await App.getInfo()).build) || 0;
  const res = await fetch(REL, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error("release");
  const m = /Build (\d+)/.exec(((await res.json()) as { body?: string }).body ?? "");
  if (!m) throw new Error("notes");
  try { localStorage.setItem("ledger.upd.at", String(Date.now())); } catch { /* storage blocked */ }
  const latest = Number(m[1]);
  return { current: cur, latest, available: latest > cur, url: APK_URL };
}

/** Downloads the APK inside the app and opens the system installer. */
export function installUpdate(url: string) { return AppUpdate.install({ url }); }

/** Web: ask the service worker for a newer build. It installs and reloads by itself when one exists. */
export async function checkWebUpdate(): Promise<"checked" | "unsupported"> {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) return "unsupported";
  await r.update();
  return "checked";
}

/** Keeps the status and navigation bar icons readable against the app theme. */
export function syncSystemBars(theme: "auto" | "dark" | "light") {
  if (!isNative) return;
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}


/* Rest timer alarm. The WebView stops running timers when the app is in the background, so the phone is rung by a scheduled system notification. */
const REST_ID = 7001;
let channelReady = false;
let notifOk = false;
let ctx: AudioContext | null = null;

/** Call from a tap: unlocks audio for the beep and asks once for notification permission. */
export async function primeAlarm() {
  try { ctx = ctx ?? new AudioContext(); if (ctx.state === "suspended") await ctx.resume(); } catch { /* no audio */ }
  if (!isNative) return;
  try {
    const p = await LocalNotifications.checkPermissions();
    const r = p.display === "granted" ? p : await LocalNotifications.requestPermissions();
    notifOk = r.display === "granted";
    if (!channelReady) {
      await LocalNotifications.createChannel({ id: "rest", name: "Rest timer", description: "Rings when your rest is over", importance: 5, visibility: 1, vibration: true, lights: true });
      channelReady = true;
    }
  } catch { /* permission or plugin missing */ }
}

export async function scheduleRest(at: number) {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] });
    await LocalNotifications.schedule({ notifications: [{ id: REST_ID, title: "Rest over", body: "Next set", channelId: "rest", schedule: { at: new Date(at), allowWhileIdle: true }, autoCancel: true }] });
  } catch { /* notifications blocked */ }
}

export async function cancelRest() {
  if (!isNative) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }); } catch { /* none pending */ }
}

/** In-app alert: three beeps and a buzz. */
export function ringNow() {
  if (notifOk) return; // the system notification rings instead
  try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* unsupported */ }
  try {
    const a = ctx ?? new AudioContext(); ctx = a;
    const t0 = a.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "square"; o.frequency.value = k === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + k * 0.32); g.gain.exponentialRampToValueAtTime(0.5, t0 + k * 0.32 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.32 + 0.25);
      o.connect(g); g.connect(a.destination); o.start(t0 + k * 0.32); o.stop(t0 + k * 0.32 + 0.27);
    }
  } catch { /* audio blocked */ }
}
