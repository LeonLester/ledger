import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";

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
