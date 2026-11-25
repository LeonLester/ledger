import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./ui/App";
import { BUILD, isNative } from "./native";
import { startI18n } from "./i18n";
import "./styles.css";

if (!isNative) registerSW({ immediate: true });
startI18n();
/** Reports uncaught errors to the Worker log so crashes are seen before a client has to describe them. */
let reported = 0;
const report = (msg: string, stack = "") => {
  if (reported++ >= 5) return;
  try { void fetch(`${isNative ? "https://ledger.coachleonidas.com" : ""}/api/log`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ msg, stack, at: location.hash.slice(0, 40) ? "" : location.pathname, build: BUILD }) }).catch(() => {}); } catch { /* ignore */ }
};
window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => report(String((e.reason as Error)?.message ?? e.reason), (e.reason as Error)?.stack));
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
