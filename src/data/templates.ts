import type { Meso, PlanItem, PlanSession } from "../types";
import { POOL } from "./catalog";

export interface SplitRow { day: string; session: string; emphasis: string }
export interface Generated { meso: Meso; split: SplitRow[]; mode?: "sheet" | "feedback" | "auto"; effort?: "rir" | "rpe"; tms?: Partial<Record<"squat" | "bench" | "deadlift" | "ohp", number>> }

type Slot = [pool: string, sets: number, lo: number, hi: number];
const DAYS: Record<string, { note: string; slots: Slot[] }> = {
  Push: { note: "Chest, shoulders, triceps", slots: [["chest", 3, 6, 10], ["chest+1", 3, 8, 12], ["press", 3, 8, 12], ["lateral", 3, 12, 20], ["triceps", 3, 10, 15], ["triceps+1", 2, 12, 15]] },
  Pull: { note: "Back, rear delts, biceps", slots: [["vpull", 3, 8, 12], ["hpull", 3, 8, 12], ["hpull+1", 3, 10, 14], ["rear", 3, 12, 20], ["biceps", 3, 8, 12], ["brachio", 2, 10, 15]] },
  Legs: { note: "Quads, hamstrings, calves", slots: [["squat", 3, 6, 10], ["hinge", 3, 8, 12], ["quad+1", 3, 10, 15], ["ham", 3, 10, 15], ["calf", 4, 10, 15], ["abs", 2, 10, 15]] },
  Upper: { note: "Chest, back, shoulders, arms", slots: [["chest", 3, 6, 10], ["vpull", 3, 8, 12], ["press", 3, 8, 12], ["hpull", 3, 8, 12], ["lateral", 2, 12, 20], ["biceps", 2, 10, 14], ["triceps", 2, 10, 14]] },
  Lower: { note: "Quads, hamstrings, glutes, calves", slots: [["squat", 3, 6, 10], ["hinge", 3, 8, 12], ["quad+1", 2, 10, 15], ["ham", 3, 10, 15], ["glute", 2, 8, 12], ["calf", 3, 10, 15]] },
  Full: { note: "Whole body", slots: [["squat", 3, 6, 10], ["chest", 3, 6, 10], ["hpull", 3, 8, 12], ["hinge", 2, 8, 12], ["press", 2, 8, 12], ["vpull", 2, 8, 12], ["lateral", 2, 12, 20]] },
  Chest: { note: "Chest, triceps", slots: [["chest", 4, 6, 10], ["chest+1", 3, 8, 12], ["chest+2", 3, 10, 15], ["chest+3", 3, 12, 15], ["triceps", 3, 10, 15]] },
  Back: { note: "Back, biceps", slots: [["vpull", 4, 8, 12], ["hpull", 3, 8, 12], ["hpull+1", 3, 10, 14], ["rear", 3, 12, 20], ["biceps", 3, 8, 12]] },
  Shoulders: { note: "Shoulders, abs", slots: [["press", 4, 6, 10], ["lateral", 4, 12, 20], ["lateral+1", 3, 12, 20], ["rear", 3, 12, 20], ["abs", 3, 10, 15]] },
  Arms: { note: "Biceps, triceps", slots: [["biceps", 4, 8, 12], ["triceps", 4, 8, 12], ["biceps+1", 3, 10, 14], ["triceps+1", 3, 10, 14], ["brachio", 3, 10, 15]] },
  "Chest & Back": { note: "Chest, back", slots: [["chest", 4, 6, 10], ["vpull", 4, 8, 12], ["chest+1", 3, 8, 12], ["hpull", 3, 8, 12], ["chest+3", 2, 12, 15], ["hpull+1", 2, 10, 14]] },
  "Shoulders & Arms": { note: "Shoulders, biceps, triceps", slots: [["press", 4, 6, 10], ["lateral", 3, 12, 20], ["biceps", 3, 8, 12], ["triceps", 3, 8, 12], ["biceps+1", 3, 10, 14], ["triceps+1", 3, 10, 14]] },
  Torso: { note: "Chest, back, shoulders", slots: [["chest", 3, 6, 10], ["hpull", 3, 6, 10], ["vpull", 3, 8, 12], ["press", 2, 8, 12], ["lateral", 2, 12, 20], ["rear", 2, 12, 20]] },
  Limbs: { note: "Legs, arms", slots: [["squat", 3, 6, 10], ["hinge", 3, 8, 12], ["ham", 3, 10, 15], ["biceps", 3, 8, 12], ["triceps", 3, 8, 12], ["calf", 3, 10, 15]] },
  "Upper Power": { note: "Heavy upper", slots: [["chest", 4, 3, 5], ["hpull", 4, 3, 5], ["press", 3, 5, 8], ["vpull", 3, 6, 10], ["biceps", 3, 6, 10], ["triceps", 3, 6, 10]] },
  "Lower Power": { note: "Heavy lower", slots: [["squat", 4, 3, 5], ["hinge", 3, 5, 8], ["quad+1", 3, 8, 12], ["ham", 3, 6, 10], ["calf", 3, 6, 10]] },
  "Upper Hyp": { note: "Upper volume", slots: [["chest+1", 4, 8, 12], ["vpull+1", 4, 8, 12], ["press+1", 3, 8, 12], ["hpull+2", 3, 10, 14], ["lateral", 3, 12, 20], ["biceps+1", 3, 10, 14], ["triceps+1", 3, 10, 14]] },
  "Lower Hyp": { note: "Lower volume", slots: [["squat+1", 4, 8, 12], ["hinge+1", 3, 8, 12], ["quad+2", 3, 10, 15], ["ham+1", 3, 10, 15], ["glute", 3, 8, 12], ["calf+1", 4, 10, 15]] },
  Anterior: { note: "Quads, chest, shoulders, triceps", slots: [["squat", 3, 6, 10], ["quad+1", 3, 10, 15], ["chest", 3, 6, 10], ["press", 3, 8, 12], ["lateral", 3, 12, 20], ["triceps", 3, 10, 15]] },
  Posterior: { note: "Hamstrings, glutes, back, biceps", slots: [["hinge", 3, 6, 10], ["ham", 3, 10, 15], ["glute", 3, 8, 12], ["vpull", 3, 8, 12], ["hpull", 3, 8, 12], ["rear", 3, 12, 20], ["biceps", 3, 8, 12]] },
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SPREAD: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };

export interface Opts { freq: number; upper: number; lower: number }
export interface Template {
  id: string; name: string; blurb: string; sessions: number; opts?: "freq" | "ul";
  /** one entry per weekday slot; "Rest" for off days. Without rest entries the sessions are spread over the week. */
  cycle: (o: Opts) => string[];
}

/** upper and lower days interleaved so the same kind never runs back to back where it can be avoided */
function interleave(u: number, l: number) {
  const out: string[] = []; let a = u, b = l;
  while (a + b > 0) {
    const last = out[out.length - 1];
    if (a >= b && !(last === "Upper" && b > 0)) { out.push("Upper"); a--; } else if (b > 0) { out.push("Lower"); b--; } else { out.push("Upper"); a--; }
  }
  return out;
}
const R = "Rest";
export const TEMPLATES: Template[] = [
  { id: "full", name: "Full body", blurb: "Every muscle every session. Choose 2 to 6 sessions per week.", sessions: 3, opts: "freq", cycle: (o) => Array(o.freq).fill("Full") },
  { id: "ul-x-y", name: "Upper / Lower, any X and Y", blurb: "Pick the number of upper and lower sessions, for example 3 upper and 2 lower.", sessions: 4, opts: "ul", cycle: (o) => interleave(o.upper, o.lower) },
  { id: "ul4", name: "Upper Lower, 4 days", blurb: "Upper, lower, rest, upper, lower. Each muscle twice a week.", sessions: 4, cycle: () => ["Upper", "Lower", R, "Upper", "Lower", R, R] },
  { id: "ulf", name: "Upper Lower Full, 3 days", blurb: "Three days a week for people short on time.", sessions: 3, cycle: () => ["Upper", R, "Lower", R, "Full", R, R] },
  { id: "ppl3", name: "Push Pull Legs, 3 days", blurb: "One round of PPL a week.", sessions: 3, cycle: () => ["Push", "Pull", "Legs", R, R, R, R] },
  { id: "ppl6", name: "PPL PPL Rest (6 days)", blurb: "Two rounds of push, pull, legs, then a rest day. Each muscle twice a week.", sessions: 6, cycle: () => ["Push", "Pull", "Legs", "Push", "Pull", "Legs", R] },
  { id: "pplr", name: "PPL Rest PPL (6 days)", blurb: "Three on, one off, three on. A midweek rest day.", sessions: 6, cycle: () => ["Push", "Pull", "Legs", R, "Push", "Pull", "Legs"] },
  { id: "pplul", name: "PPLUL (5 days)", blurb: "Push, pull, legs, rest, upper, lower, rest. Legs and arms twice, the rest at least twice.", sessions: 5, cycle: () => ["Push", "Pull", "Legs", R, "Upper", "Lower", R] },
  { id: "arnold", name: "Arnold split (6 days)", blurb: "Chest and back, shoulders and arms, legs, twice a week.", sessions: 6, cycle: () => ["Chest & Back", "Shoulders & Arms", "Legs", "Chest & Back", "Shoulders & Arms", "Legs", R] },
  { id: "bro", name: "Body part split (5 days)", blurb: "Chest, back, shoulders, arms and legs, each once a week.", sessions: 5, cycle: () => ["Chest", "Back", R, "Shoulders", "Arms", "Legs", R] },
  { id: "tl", name: "Torso Limbs (4 days)", blurb: "Torso and limbs alternate, each twice a week.", sessions: 4, cycle: () => ["Torso", "Limbs", R, "Torso", "Limbs", R, R] },
  { id: "phul", name: "PHUL (4 days)", blurb: "Power and hypertrophy, upper and lower. Heavy days and volume days.", sessions: 4, cycle: () => ["Upper Power", "Lower Power", R, "Upper Hyp", "Lower Hyp", R, R] },
  { id: "ap", name: "Anterior Posterior (4 days)", blurb: "Front of the body, then the back, twice a week.", sessions: 4, cycle: () => ["Anterior", "Posterior", R, "Anterior", "Posterior", R, R] },
];

const pick = (key: string, occ: number) => {
  const [pool, plus] = key.split("+");
  const list = POOL[pool];
  return list[(Number(plus ?? 0) + occ) % list.length];
};

/** Weeks 1 to 4 build, week 5 is a deload. Sets rise a little midblock, RIR falls. */
const RIR = [3, 2, 1, 1, 4];
const setsFor = (base: number, week: number, scale: number) => {
  const b = Math.max(2, Math.round(base * scale));
  if (week === 5) return Math.max(1, Math.ceil(b / 2));
  return week >= 3 ? b + 1 : b;
};

export function buildSplit(t: Template, o: Opts, mesoId: string): Generated {
  const cycle = t.cycle(o);
  const hasRest = cycle.includes(R);
  const kinds = cycle.filter((c) => c !== R);
  const n = kinds.length;
  const scale = n >= 5 ? 0.75 : n === 4 ? 0.9 : 1;
  const total: Record<string, number> = {};
  for (const k of kinds) total[k] = (total[k] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const sessions = kinds.map((k) => {
    const idx = seen[k] = (seen[k] ?? 0) + 1;
    return { kind: k, name: total[k] > 1 ? `${k} ${idx}` : k, occ: idx - 1 };
  });
  const weeks = [1, 2, 3, 4, 5].map((week) => ({
    week,
    sessions: sessions.map<PlanSession>((s) => ({
      name: s.name,
      items: DAYS[s.kind].slots.map<PlanItem>(([pk, sets, lo, hi], i) => ({
        letter: String.fromCharCode(65 + i), exercise: pick(pk, s.occ), sets: setsFor(sets, week, scale), repLo: lo, repHi: hi, rir: RIR[week - 1],
      })),
    })),
  }));
  const slots = hasRest ? cycle : SPREAD[Math.min(7, n)].reduce<string[]>((acc, d, i) => { acc[d] = kinds[i]; return acc; }, Array(7).fill(R));
  let k = 0;
  const split: SplitRow[] = WEEKDAYS.map((day, i) => {
    const kind = slots[i] ?? R;
    if (kind === R) return { day, session: R, emphasis: "" };
    const s = sessions[k++];
    return { day, session: s.name, emphasis: DAYS[kind].note };
  });
  return { meso: { id: mesoId, name: t.id === "ul-x-y" ? `Upper ${o.upper} Lower ${o.lower}` : t.id === "full" ? `Full body ${o.freq}x` : t.name, weeks }, split, mode: "feedback", effort: "rir" };
}
