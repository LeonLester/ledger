export type Unit = "kg" | "lb" | "pin";
export type Mode = "sheet" | "feedback" | "auto";

export type LiftKey = "squat" | "bench" | "deadlift" | "ohp";
export interface SetScheme { pct: number; reps: number; amrap?: boolean }
export interface PlanItem {
  letter: string; exercise: string; sets: number; repLo: number | null; repHi: number | null; rir: number | null;
  /** powerlifting: lift whose training max the percentages refer to */
  lift?: LiftKey; pct?: number; scheme?: SetScheme[]; desc?: string;
}
export interface PlanSession { name: string; items: PlanItem[] }
export interface PlanWeek { week: number; sessions: PlanSession[]; /** set when the weekday layout differs from week to week */ split?: { day: string; session: string; emphasis: string }[] }
export interface Meso { id: string; name: string; weeks: PlanWeek[]; deload?: boolean }

export interface SetLog { weight: number | null; reps: number | null; myo: number[]; rir?: number | null; done?: boolean; tr?: number | null; amrap?: boolean }
export interface RepMetric { rom: number; mcv: number; pv: number; dev: number; tUp: number }
export interface BarPathRec { set: number; at: number; fps: number; pts: [number, number][]; reps: RepMetric[] }
export interface ExLog { letter: string; exercise: string; unit: Unit | null; rir: number | null; sets: SetLog[]; note: string | null; tech?: number | null; form?: string[]; paths?: BarPathRec[] }
export interface Muscle3 { pump: number; workload: number }
export interface Session {
  id: string; athleteId: string; meso: string; week: number; name: string;
  date: string | null; status: "done" | "active"; exercises: ExLog[]; started?: number; finished?: number;
}
export interface Feedback {
  id: string; athleteId: string; sessionId: string; meso: string; week: number; muscle: string;
  pump: number; workload: number; soreness: number | null; delta: number | null;
  state: "pending" | "applied" | "skipped";
}
export interface Adjustment { id: string; athleteId: string; meso: string; week: number; muscle: string; delta: number; source: "feedback" | "manual" }
export interface BodyWeight { id: string; athleteId: string; date: string; kg: number; src?: "mealcost" }
export interface ExerciseDef { name: string; muscle: string; unit: Unit; increment: number; guessed?: boolean }

export interface Settings {
  athleteId: string; mode: Mode; unit: Unit; bar: number; plates: number[]; restSec: number;
  theme: "auto" | "dark" | "light"; mesoStart: string | null; activeMeso: string; week: number;
  fx?: import("./lib/formulas").Formulas; onboarded?: boolean; effort?: "rir" | "rpe"; sex?: "m" | "f"; tms?: Partial<Record<LiftKey, number>>; liftMap?: Partial<Record<LiftKey, string>>;
}
export interface Seed {
  mesos: Meso[]; sessions: Omit<Session, "athleteId" | "status">[]; library: Record<string, string>;
  targets: Record<string, (number | null)[]>; landmarks: Record<string, { mv: number | null; mev: number | null; mav: number | null; mrv: number | null }>;
  split: { day: string; session: string; emphasis: string }[]; mobility: { session: string; letter: string; exercise: string; sets: number | null; reps: string; tempo: string | null; note: string | null }[];
}
