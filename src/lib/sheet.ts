import { fmtW, workedSets } from "./math";
import { parseReps, repsText } from "./selectors";
import type { ExLog, SetLog } from "../types";

const TOKEN = /^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:\+\d+)*)$/i;
/** "100x8 100x8 95x9" becomes three sets. Returns null when any token does not parse. */
export function parseSets(text: string, rir?: number | null): SetLog[] | null {
  const parts = text.split(/[,;\n]+|\s{2,}|\s(?=\d+(?:[.,]\d+)?\s*[x×*])/i).map((t) => t.trim()).filter(Boolean);
  const out: SetLog[] = [];
  for (const p of parts) {
    const m = TOKEN.exec(p);
    if (!m) return null;
    const r = parseReps(m[2]);
    if (!r) return null;
    out.push({ weight: Number(m[1].replace(",", ".")), reps: r.reps, myo: r.myo, rir: rir ?? null, done: true });
  }
  return out;
}
export const setsText = (e: ExLog | undefined) => (e ? workedSets(e).map((s) => `${fmtW(s.weight) || "bw"}x${repsText(s)}`).join(" ") : "");

