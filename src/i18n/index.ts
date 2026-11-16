import { EL, EL_PATTERNS } from "./el";

export type Lang = "en" | "el";
const KEY = "ledger.lang";
export const getLang = (): Lang => { try { return localStorage.getItem(KEY) === "el" ? "el" : "en"; } catch { return "en"; } };
export function setLang(l: Lang) { try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ } location.reload(); }

/** Greek for one piece of UI text, or the text itself when nothing matches. Spaces around it are kept. */
export function tr(text: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const core = m[2];
  if (!core) return text;
  const whole = one(core);
  if (whole !== core) return m[1] + whole + m[3];
  // lists such as "6 exercises, 12 sets, Chest, shoulders, triceps": translate the longest known runs of comma-separated parts
  const parts = core.split(", ");
  if (parts.length > 1) {
    const out: string[] = []; let changed = false;
    for (let i = 0; i < parts.length;) {
      let hit = false;
      for (let j = parts.length; j > i; j--) { const piece = parts.slice(i, j).join(", "); const t = one(piece); if (t !== piece) { out.push(t); i = j; hit = true; changed = true; break; } }
      if (!hit) { out.push(parts[i]); i++; }
    }
    if (changed) return m[1] + out.join(", ") + m[3];
  }
  return text;
}

function one(core: string): string {
  const direct = Object.prototype.hasOwnProperty.call(EL, core) ? EL[core] : undefined;
  if (direct !== undefined) return direct;
  for (const [re, build] of EL_PATTERNS) {
    const x = re.exec(core);
    if (x) { const out = build(tr, ...x.slice(1)); if (out !== core) return out; }
  }
  return core;
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
function fixNode(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const v = n.nodeValue ?? ""; const t = tr(v);
    if (t !== v) n.nodeValue = t;
  } else if (n.nodeType === Node.ELEMENT_NODE) {
    const el = n as Element;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA") { /* values are user text */ }
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
  }
}
function walk(root: Node) {
  fixNode(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === Node.ELEMENT_NODE && ["SCRIPT", "STYLE"].includes((n as Element).tagName)) continue; fixNode(n); }
}

/** Greek works by translating what React renders, so every screen is covered and unknown text stays English. */
export function startI18n() {
  if (getLang() !== "el") return;
  document.documentElement.lang = "el";
  const nativeConfirm = window.confirm.bind(window), nativeAlert = window.alert.bind(window);
  window.confirm = (m?: string) => nativeConfirm(m ? tr(m) : m);
  window.alert = (m?: string) => nativeAlert(m ? tr(m) : m);
  let busy = false;
  const mo = new MutationObserver((list) => {
    if (busy) return; busy = true;
    for (const r of list) {
      if (r.type === "characterData") fixNode(r.target);
      else if (r.type === "attributes") fixNode(r.target);
      else r.addedNodes.forEach((n) => walk(n));
    }
    busy = false;
  });
  const go = () => { walk(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
}
