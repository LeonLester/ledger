import { create } from "zustand";

/** Simple mode keeps clients to the four screens they need. Coaches and anyone who switches it on see every tool. */
const KEY = "ledger.adv";
const read = (): boolean | null => { try { const v = localStorage.getItem(KEY); return v == null ? null : v === "1"; } catch { return null; } };
export const useAdvanced = create<{ pref: boolean | null; set(v: boolean): void }>((set) => ({
  pref: read(),
  set: (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* blocked */ } set({ pref: v }); },
}));
/** True when the full toolset should show. The default follows the role: coaches yes, clients no. */
export const useShowAdvanced = (role: "athlete" | "coach" | undefined) => {
  const pref = useAdvanced((s) => s.pref);
  return pref ?? role === "coach";
};
/** Screens a client sees in simple mode. */
export const SIMPLE_TABS = new Set(["train", "plan", "progress", "more"]);
