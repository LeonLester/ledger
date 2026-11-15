import { create } from "zustand";
import { useStore } from "./store";

/** Reads your weight log from Mealcost with a read-only link code. The code stays on this device. */
const ORIGIN = "https://mealcost.coachleonidas.com";
export const LINK_PAGE = `${ORIGIN}/ledger-link.html`;
const KEY = "ledger.mealcost";

interface Saved { token: string; last: number | null; count: number }
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
const save = (s: Saved | null) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

export const useMealcost = create<{ linked: boolean; last: number | null; count: number; busy: boolean; error: string | null }>(() => {
  const s = load();
  return { linked: !!s, last: s?.last ?? null, count: s?.count ?? 0, busy: false, error: null };
});

export async function syncMealcost(): Promise<boolean> {
  const s = load();
  if (!s || useMealcost.getState().busy) return false;
  useMealcost.setState({ busy: true, error: null });
  try {
    const res = await fetch(`${ORIGIN}/api/weights`, { headers: { authorization: `Bearer ${s.token}` } });
    if (res.status === 401) { useMealcost.setState({ error: "The link was removed or replaced in Mealcost. Paste a new code." }); return false; }
    if (!res.ok) throw new Error("server");
    const d = (await res.json()) as { weights: { date: string; kg: number }[] };
    useStore.getState().applyMealcost(d.weights);
    const next = { token: s.token, last: Date.now(), count: d.weights.length };
    save(next); useMealcost.setState({ last: next.last, count: next.count });
    return true;
  } catch {
    useMealcost.setState({ error: "Could not reach Mealcost. It will retry when you are online." });
    return false;
  } finally { useMealcost.setState({ busy: false }); }
}

export async function connectMealcost(code: string) {
  const token = code.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("That does not look like a link code.");
  save({ token, last: null, count: 0 });
  useMealcost.setState({ linked: true, error: null });
  if (!(await syncMealcost())) { const e = useMealcost.getState().error; if (e?.startsWith("The link")) { save(null); useMealcost.setState({ linked: false }); throw new Error("Mealcost did not accept that code. Make a new one and try again."); } }
}
export function disconnectMealcost() {
  save(null);
  useStore.getState().applyMealcost([]);
  useMealcost.setState({ linked: false, last: null, count: 0, error: null });
}

let at = 0;
const soon = () => { if (Date.now() - at > 30 * 60e3) { at = Date.now(); void syncMealcost(); } };
window.addEventListener("focus", soon);
window.addEventListener("online", () => { at = 0; soon(); });
