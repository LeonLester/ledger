import type { LiftKey, PlanItem, PlanSession, PlanWeek, SetScheme } from "../types";
import { LIFT_NAME } from "./catalog";
import type { Generated, SplitRow } from "./templates";

export interface Maxes { squat: number; bench: number; deadlift: number; ohp: number }
export interface Program {
  id: string; name: string; level: string; days: number; weeks: number; blurb: string; tmFactor: number; rpe?: boolean;
  build: (id: string) => Omit<Generated, "tms">;
}

const WD = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const split = (names: string[], at: number[]): SplitRow[] => WD.map((day, i) => { const k = at.indexOf(i); return { day, session: k < 0 ? "Rest" : names[k], emphasis: "" }; });
const L = (i: number) => String.fromCharCode(65 + i);
const desc = (sc: SetScheme[]) => sc.map((s) => `${Math.round(s.pct * 100)}% x${s.reps}${s.amrap ? "+" : ""}`).join(", ");
const rd = (r: number | null, rpe: number) => (r == null ? 10 - rpe : r);

/** main lift with a percentage scheme taken from the training max */
function main(i: number, lift: LiftKey, scheme: SetScheme[], rpe = 8, exercise = LIFT_NAME[lift]): PlanItem {
  const reps = scheme.map((s) => s.reps);
  return { letter: L(i), exercise, sets: scheme.length, repLo: Math.min(...reps), repHi: Math.max(...reps), rir: rd(null, rpe), lift, scheme, desc: desc(scheme) };
}
const flat = (n: number, pct: number, reps: number, amrapLast = false): SetScheme[] => Array.from({ length: n }, (_, k) => ({ pct, reps, amrap: amrapLast && k === n - 1 }));
function acc(i: number, exercise: string, sets: number, lo: number, hi: number, rir = 2): PlanItem { return { letter: L(i), exercise, sets, repLo: lo, repHi: hi, rir }; }
/** straight sets that progress by double progression. pct only seeds the very first session of the lift. */
function lp(i: number, lift: LiftKey, sets: number, reps: number, firstPct: number | null, exercise = LIFT_NAME[lift]): PlanItem {
  const it: PlanItem = { letter: L(i), exercise, sets, repLo: reps, repHi: reps, rir: 2, lift };
  if (firstPct != null) { it.pct = firstPct; it.desc = `${Math.round(firstPct * 100)}% to start, then add load each session`; }
  return it;
}
const weeksOf = (n: number, f: (w: number) => PlanSession[]): PlanWeek[] => Array.from({ length: n }, (_, k) => ({ week: k + 1, sessions: f(k + 1) }));

function linear(id: string, name: string, setsMain: number, dlSets: number, tail: (first: (l: LiftKey) => number | null) => PlanItem[]): Omit<Generated, "tms"> {
  const seen = new Set<string>();
  const first = (lift: LiftKey) => { if (seen.has(lift)) return null; seen.add(lift); return 0.65; };
  const days = ["Mon", "Wed", "Fri"];
  const meso = {
    id, name, deload: false, weeks: weeksOf(4, (w) => days.map((d, k) => {
      const ab: "A" | "B" = (w + k) % 2 === 1 ? "A" : "B";
      const items: PlanItem[] = ab === "A"
        ? [lp(0, "squat", setsMain, 5, first("squat")), lp(1, "bench", setsMain, 5, first("bench")), ...tail(first)]
        : [lp(0, "squat", setsMain, 5, first("squat")), lp(1, "ohp", setsMain, 5, first("ohp")), lp(2, "deadlift", dlSets, 5, first("deadlift"))];
      return { name: `${d} ${ab}`, items };
    })),
  };
  return { meso, split: split(["Mon", "Wed", "Fri"], [0, 2, 4]), mode: "sheet", effort: "rir" };
}

export const PROGRAMS: Program[] = [
  {
    id: "sl5x5", name: "StrongLifts 5x5", level: "Beginner", days: 3, weeks: 4, tmFactor: 1,
    blurb: "Two alternating workouts, 5 sets of 5 on squat, bench, press and row, 1 set of 5 on deadlift. Add weight every session.",
    build: (id) => linear(id, "StrongLifts 5x5", 5, 1, () => [{ ...lp(2, "bench", 5, 5, null, "Barbell Row"), lift: undefined }]),
  },
  {
    id: "ss", name: "Starting Strength", level: "Beginner", days: 3, weeks: 4, tmFactor: 1,
    blurb: "Squat every session, bench or press alternating, one heavy set of deadlift. 3 sets of 5, linear loading.",
    build: (id) => {
      return linear(id, "Starting Strength", 3, 1, (first) => [lp(2, "deadlift", 1, 5, first("deadlift"))]);
    },
  },
  {
    id: "gzclp", name: "GZCLP (simplified)", level: "Novice", days: 4, weeks: 4, tmFactor: 1,
    blurb: "Tiered volume. T1 heavy 5 sets of 3, T2 3 sets of 10, T3 light 3 sets of 15 to 25. Loads progress by double progression.",
    build: (id) => {
      const seen = new Set<string>();
      const fp = (k: string, p: number) => (seen.has(k) ? null : (seen.add(k), p));
      const day = (t1: LiftKey, t2: LiftKey, t3: string): PlanItem[] => [
        { ...lp(0, t1, 5, 3, fp(t1, 0.75)), desc: "T1: 5 sets of 3, last set as many as possible" },
        { ...lp(1, t2, 3, 10, fp(t2 + "2", 0.6), LIFT_NAME[t2] + " (T2)"), desc: "T2: 3 sets of 10" },
        { ...acc(2, t3, 3, 15, 25), desc: "T3: 3 sets of 15 to 25" },
      ];
      const meso = { id, name: "GZCLP", deload: false, weeks: weeksOf(4, () => [
        { name: "Day 1", items: day("squat", "bench", "Lat Pulldown") }, { name: "Day 2", items: day("ohp", "deadlift", "One-Arm Dumbbell Row") },
        { name: "Day 3", items: day("bench", "squat", "Lat Pulldown") }, { name: "Day 4", items: day("deadlift", "ohp", "One-Arm Dumbbell Row") }]) };
      return { meso, split: split(["Day 1", "Day 2", "Day 3", "Day 4"], [0, 1, 3, 4]), mode: "sheet", effort: "rir" };
    },
  },
  {
    id: "531", name: "5/3/1 Boring But Big", level: "Intermediate", days: 4, weeks: 4, tmFactor: 0.9,
    blurb: "Wendler 5/3/1 with a 5 by 10 supplemental block. Four-week wave, training max at 90% of your 1RM, last set of each main wave is a rep test.",
    build: (id) => {
      const wave: SetScheme[][] = [
        [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: 5, amrap: true }],
        [{ pct: 0.7, reps: 3 }, { pct: 0.8, reps: 3 }, { pct: 0.9, reps: 3, amrap: true }],
        [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: 1, amrap: true }],
        [{ pct: 0.4, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.6, reps: 5 }],
      ];
      const bbb = [0.5, 0.6, 0.7, 0];
      const lifts: { lift: LiftKey; day: string; acc: [string, number, number, number][] }[] = [
        { lift: "ohp", day: "OHP day", acc: [["Lat Pulldown", 3, 8, 12], ["Triceps Pushdown", 3, 10, 15]] },
        { lift: "deadlift", day: "Deadlift day", acc: [["Hanging Leg Raise", 3, 10, 15], ["Seated Leg Curl", 3, 10, 15]] },
        { lift: "bench", day: "Bench day", acc: [["Barbell Row", 3, 8, 12], ["Incline Dumbbell Curl", 3, 10, 15]] },
        { lift: "squat", day: "Squat day", acc: [["Leg Press", 3, 10, 15], ["Back Extension", 3, 10, 15]] },
      ];
      const meso = { id, name: "5/3/1 BBB", deload: false, weeks: weeksOf(4, (w) => lifts.map<PlanSession>((d) => {
        const sc = [...wave[w - 1], ...(bbb[w - 1] ? flat(5, bbb[w - 1], 10) : [])];
        return { name: d.day, items: [{ ...main(0, d.lift, sc, 8), desc: `${desc(wave[w - 1])}${bbb[w - 1] ? `, then 5 x10 at ${Math.round(bbb[w - 1] * 100)}%` : ""}` }, ...d.acc.map((a, i) => acc(i + 1, ...a))] };
      })) };
      return { meso, split: split(lifts.map((d) => d.day), [0, 1, 3, 4]), mode: "sheet", effort: "rir" };
    },
  },
  {
    id: "texas", name: "Texas Method", level: "Intermediate", days: 3, weeks: 4, tmFactor: 1,
    blurb: "Weekly cycle: volume day, light day, intensity day where you set a 5-rep PR. Percentages are of your 1RM and creep up each week.",
    build: (id) => {
      const meso = { id, name: "Texas Method", deload: false, weeks: weeksOf(4, (w) => {
        const up = 0.01 * (w - 1);
        return [
          { name: "Mon volume", items: [main(0, "squat", flat(5, 0.78 + up, 5), 8), main(1, "bench", flat(5, 0.78 + up, 5), 8), acc(2, "Barbell Row", 3, 6, 10)] },
          { name: "Wed light", items: [main(0, "squat", flat(2, 0.62 + up, 5), 6), main(1, "ohp", flat(3, 0.68 + up, 5), 7), acc(2, "Back Extension", 3, 10, 15)] },
          { name: "Fri intensity", items: [main(0, "squat", [{ pct: 0.85 + up, reps: 5, amrap: true }], 9), main(1, "bench", [{ pct: 0.85 + up, reps: 5, amrap: true }], 9), main(2, "deadlift", [{ pct: 0.8 + up, reps: 5 }], 8)] },
        ];
      }) };
      return { meso, split: split(["Mon volume", "Wed light", "Fri intensity"], [0, 2, 4]), mode: "sheet", effort: "rir" };
    },
  },
  {
    id: "peak", name: "Peaking block (RPE, 6 weeks)", level: "Advanced", days: 3, weeks: 6, tmFactor: 1, rpe: true,
    blurb: "Six weeks of heavier singles and triples, then back-off sets. Log RPE on every top set and the app compares it to your e1RM.",
    build: (id) => {
      const top = [0.78, 0.82, 0.86, 0.9, 0.93, 0.96];
      const reps = [5, 5, 3, 3, 2, 1];
      const dl = [0.75, 0.8, 0.85, 0.9, 0.93, 0.97];
      const dlr = [5, 4, 3, 2, 2, 1];
      const rpe = [7, 7.5, 8, 8, 8.5, 9];
      const meso = { id, name: "Peaking block", deload: false, weeks: weeksOf(6, (w) => {
        const t = top[w - 1], r = reps[w - 1];
        const bo = (p: number, n: number, rp: number) => flat(n, Math.max(0.5, p - 0.1), rp);
        return [
          { name: "Day 1 Squat", items: [main(0, "squat", [{ pct: t, reps: r }, ...bo(t, 3, 5)], rpe[w - 1]), main(1, "bench", [{ pct: t - 0.04, reps: r }, ...bo(t - 0.04, 3, 5)], rpe[w - 1]), acc(2, "Chest-Supported Row", 3, 8, 12)] },
          { name: "Day 2 Deadlift", items: [main(0, "deadlift", [{ pct: dl[w - 1], reps: dlr[w - 1] }, ...flat(1, dl[w - 1] - 0.12, 5)], rpe[w - 1]), main(1, "ohp", flat(3, 0.62, 8), 8), acc(2, "Hanging Leg Raise", 3, 10, 15)] },
          { name: "Day 3 Bench", items: [main(0, "bench", flat(5, Math.max(0.6, t - 0.1), 3), 7), main(1, "squat", flat(3, Math.max(0.6, t - 0.14), 4), 7, "Pause Squat"), acc(2, "Barbell Row", 4, 6, 10)] },
        ];
      }) };
      return { meso, split: split(["Day 1 Squat", "Day 2 Deadlift", "Day 3 Bench"], [0, 2, 4]), mode: "sheet", effort: "rpe" };
    },
  },
];
export const programById = (id: string) => PROGRAMS.find((p) => p.id === id)!;
export const trainingMaxes = (p: Program, m: Maxes): NonNullable<Generated["tms"]> => ({
  squat: Math.round((m.squat * p.tmFactor) / 2.5) * 2.5, bench: Math.round((m.bench * p.tmFactor) / 2.5) * 2.5,
  deadlift: Math.round((m.deadlift * p.tmFactor) / 2.5) * 2.5, ohp: Math.round((m.ohp * p.tmFactor) / 2.5) * 2.5,
});
