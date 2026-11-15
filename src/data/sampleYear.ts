import { CAT } from "./catalog";
import { buildSplit, TEMPLATES, WEEKDAYS, type Opts, type Template } from "./templates";
import type { BodyWeight, ExLog, Meso, Session, SetLog } from "../types";

/** Typical working loads for a mid-level lifter at the start of the year, in kg. 0 means bodyweight. */
const START: Record<string, number> = {
  "Back Squat": 85, "Front Squat": 62, "Hack Squat": 95, "Leg Press": 170, "Leg Extension": 48, "Bulgarian Split Squat": 28, "Walking Lunge": 28,
  "Romanian Deadlift": 95, "Stiff-Leg Deadlift": 85, "Good Morning": 55, "Seated Leg Curl": 42, "Lying Leg Curl": 38, "Hip Thrust": 105, "Cable Pull-Through": 36,
  "Standing Calf Raise": 85, "Seated Calf Raise": 50, "Cable Crunch": 42, "Hanging Leg Raise": 0,
  "Barbell Bench Press": 72, "Incline Dumbbell Press": 28, "Machine Chest Press": 62, "Cable Fly": 16, "Dip": 0, "Overhead Press": 44, "Dumbbell Shoulder Press": 24, "Machine Shoulder Press": 48,
  "Lateral Raise": 9, "Cable Lateral Raise": 6, "Face Pull": 26, "Reverse Pec Deck": 32, "Lat Pulldown": 58, "Pull-Up": 0, "Neutral-Grip Pulldown": 58,
  "Chest-Supported Row": 52, "Barbell Row": 62, "Seated Cable Row": 52, "One-Arm Dumbbell Row": 30, "Triceps Pushdown": 32, "Overhead Triceps Extension": 26, "Skull Crusher": 28,
  "Incline Dumbbell Curl": 13, "Barbell Curl": 32, "Cable Curl": 26, "Preacher Curl": 27, "Hammer Curl": 15,
};
const COMPOUND = /Squat|Press|Row|Deadlift|Thrust|Pulldown|Pull-Up|Dip|Lunge|Good Morning/;

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const SAMPLE_OPTS = (t: Template): Opts => (t.id === "ul-x-y" ? { freq: 3, upper: 3, lower: 2 } : { freq: 3, upper: 2, lower: 2 });
export const SAMPLE_TEMPLATES = TEMPLATES;

export interface Year {
  mesos: Meso[]; sessions: Omit<Session, "athleteId" | "status">[]; bodyweight: Omit<BodyWeight, "athleteId">[];
  split: { day: string; session: string; emphasis: string }[]; start: string; activeMeso: string; week: number; exercises: string[];
}

/** A year of believable training for one split: eleven 5-week blocks, loads climbing about 15% with deloads and noise, plus weekly weigh-ins. */
export function sampleYear(t: Template, today = new Date()): Year {
  const r = rng([...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const opts = SAMPLE_OPTS(t);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const start = addDays(monday, -51 * 7);
  const todayIso = iso(today);
  const mesos: Meso[] = [], sessions: Year["sessions"] = [], exercises = new Set<string>();
  let split: Year["split"] = [], lastWeek = 1;
  for (let b = 0; b < 11; b++) {
    const id = `m${b + 1}`;
    const g = buildSplit(t, opts, id);
    split = g.split;
    mesos.push({ ...g.meso, name: `${g.meso.name.replace(/ \(.*\)/, "")}, block ${b + 1}` });
    for (const wk of g.meso.weeks) {
      const gw = b * 5 + (wk.week - 1);
      if (gw > 51) continue;
      for (const s of wk.sessions) {
        const row = g.split.find((x) => x.session === s.name);
        const date = iso(addDays(start, gw * 7 + (row ? WEEKDAYS.indexOf(row.day) : 0)));
        if (date > todayIso || r() < 0.04) continue; // future, or a missed session
        const exs: ExLog[] = s.items.map((it) => {
          exercises.add(it.exercise);
          const inc = CAT[it.exercise]?.inc ?? 2.5;
          const base = START[it.exercise] ?? 30;
          const gain = 1 + (COMPOUND.test(it.exercise) ? 0.17 : 0.11) * (gw / 51);
          const deload = wk.week === 5 ? 0.9 : 1;
          const w = base === 0 ? null : Math.max(inc, Math.round((base * gain * deload * (1 + (r() - 0.5) * 0.03)) / inc) * inc);
          const lo = it.repLo ?? 8, hi = it.repHi ?? lo;
          const sets: SetLog[] = Array.from({ length: it.sets }, (_, k) => {
            const reps = Math.max(Math.max(1, lo - 1), Math.min(hi, hi - Math.floor(r() * Math.max(1, (hi - lo) * 0.7)) - (k > 0 ? Math.floor(k * 0.7 + r()) : 0)));
            return { weight: w, reps, myo: [], rir: it.rir, done: true };
          });
          return { letter: it.letter, exercise: it.exercise, unit: "kg", rir: it.rir, note: null, sets };
        });
        sessions.push({ id: `${id}w${wk.week}-${s.name}`, meso: id, week: wk.week, name: s.name, date, exercises: exs, finished: new Date(date + "T19:00:00").getTime() });
        lastWeek = wk.week;
      }
    }
  }
  const bodyweight: Year["bodyweight"] = [];
  for (let gw = 0; gw < 52; gw++) {
    const d = addDays(start, gw * 7 + 1);
    if (iso(d) <= todayIso) bodyweight.push({ id: `bw-${t.id}-${gw}`, date: iso(d), kg: Math.round((81 + 3.2 * (gw / 51) + (r() - 0.5) * 1.2) * 10) / 10 });
  }
  const lastMeso = [...sessions].sort((a, b) => a.date!.localeCompare(b.date!)).pop()?.meso ?? "m11";
  return { mesos, sessions, bodyweight, split, start: iso(start), activeMeso: lastMeso, week: lastWeek, exercises: [...exercises] };
}
