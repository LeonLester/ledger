export type Unit = "kg" | "lb" | "pin";
export type Mode = "sheet" | "feedback" | "auto";

export interface PlanItem { letter: string; exercise: string; sets: number; repLo: number | null; repHi: number | null; rir: number | null }
export interface PlanSession { name: string; items: PlanItem[] }
export interface PlanWeek { week: number; sessions: PlanSession[] }
export interface Meso { id: string; name: string; weeks: PlanWeek[] }

export interface SetLog { weight: number | null; reps: number | null; myo: number[]; rir?: number | null; done?: boolean }
export interface ExLog { letter: string; exercise: string; unit: Unit | null; rir: number | null; sets: SetLog[]; note: string | null }
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
export interface BodyWeight { id: string; athleteId: string; date: string; kg: number }
export interface ExerciseDef { name: string; muscle: string; unit: Unit; increment: number; guessed?: boolean }

export interface Settings {
  athleteId: string; mode: Mode; unit: Unit; bar: number; plates: number[]; restSec: number;
  theme: "auto" | "dark" | "light"; mesoStart: string | null; activeMeso: string; week: number;
}
export interface Seed {
  mesos: Meso[]; sessions: Omit<Session, "athleteId" | "status">[]; library: Record<string, string>;
  targets: Record<string, (number | null)[]>; landmarks: Record<string, { mv: number | null; mev: number | null; mav: number | null; mrv: number | null }>;
  split: { day: string; session: string; emphasis: string }[]; mobility: { session: string; letter: string; exercise: string; sets: number | null; reps: string; tempo: string | null; note: string | null }[];
}
