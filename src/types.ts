export type Unit = "kg" | "lb" | "pin";
export type Mode = "sheet" | "feedback" | "auto";

export type LiftKey = "squat" | "bench" | "deadlift" | "ohp";
export interface SetScheme { pct: number; reps: number; amrap?: boolean }
export interface RirType { id: string; name: string; /** reps in reserve in the first week of a block */ start: number; /** reps in reserve in the last build week */ end: number }
export interface PlanItem {
  letter: string; exercise: string; sets: number; repLo: number | null; repHi: number | null; rir: number | null;
  /** which RIR type this exercise follows on this day; its RIR then moves from the type's first week to its last */
  rirType?: string;
  /** sets in the last build week; sets then ramp from `sets` in week 1 to this */
  setsEnd?: number;
  /** powerlifting: lift whose training max the percentages refer to */
  lift?: LiftKey; pct?: number; scheme?: SetScheme[]; desc?: string;
}
export interface PlanSession { name: string; items: PlanItem[] }
export interface PlanWeek { week: number; sessions: PlanSession[]; /** set when the weekday layout differs from week to week */ split?: { day: string; session: string; emphasis: string }[] }
export interface Meso { id: string; name: string; weeks: PlanWeek[]; deload?: boolean; /** no fixed weekdays: sessions run in order, whenever the lifter can train */ flexible?: boolean; /** weekly hard-set targets per muscle, one value per week (null = none) */ volTargets?: Record<string, (number | null)[]> }

export interface SetLog { weight: number | null; reps: number | null; /** reps of each mini-set after the first (myo-reps or rest-pause) */ myo: number[]; /** this set is a myo-rep set even before any mini-set is logged */ myoOn?: boolean; rir?: number | null; done?: boolean; tr?: number | null; amrap?: boolean }
export interface RepMetric { rom: number; mcv: number; pv: number; dev: number; tUp: number }
export interface BarPathRec { set: number; at: number; fps: number; pts: [number, number][]; reps: RepMetric[] }
export interface ExLog { letter: string; exercise: string; unit: Unit | null; rir: number | null; sets: SetLog[]; note: string | null; /** share of bodyweight added to the logged load (1 for a pull-up) */ bwf?: number; /** kg already on the implement before any plates (sled, machine carriage) */ base?: number; /** bodyweight in kg when the exercise was added */ bw?: number | null; tech?: number | null; form?: string[]; paths?: BarPathRec[] }
export interface Muscle3 { pump: number; workload: number }
export interface Session {
  id: string; athleteId: string; meso: string; week: number; name: string;
  date: string | null; status: "done" | "active"; exercises: ExLog[]; started?: number; finished?: number; /** note for the whole session */ note?: string;
}
export interface Feedback {
  id: string; athleteId: string; sessionId: string; meso: string; week: number; muscle: string;
  pump: number; workload: number; soreness: number | null; delta: number | null;
  state: "pending" | "applied" | "skipped";
}
export interface Adjustment { id: string; athleteId: string; meso: string; week: number; muscle: string; delta: number; source: "feedback" | "manual" }
export interface BodyWeight { id: string; athleteId: string; date: string; kg: number; src?: "mealcost" }
/** lever geometry of a plate-loaded or pin machine, any length unit as long as both arms use it */
export interface LeverSpec {
  /** pivot to plates */ loadArm: number; /** pivot to handle or pad */ userArm: number;
  /** handle arm angle above level at the bottom and top of the rep, degrees */ start: number; end: number;
  /** angle of the plate arm relative to the handle arm, 0 same side or 180 opposite */ offset: number;
  /** empty arm mass in kg and the distance from the pivot to its centre */ armMass: number; armCom: number;
  path: "arc" | "fixed"; /** fixed pull direction in degrees from level */ pull: number;
}
/** how far the load rises and how far the limb travels, any length unit: true resistance is the logged load times rise over travel */
export interface MechSpec { dxVer: number; dx: number }
export interface ExerciseDef {
  name: string; /** primary muscle: the one that limits the set */ muscle: string; unit: Unit; increment: number; guessed?: boolean;
  /** secondary muscles and the share of a set each one earns (0 to 1) */ contrib?: Record<string, number>;
  /** share of bodyweight that counts as load (pull-up 1, dip 0.9) */ bwf?: number;
  /** kg on the implement with no plates, for example a leg press sled */ base?: number;
  /** note shown every time this exercise is logged */ note?: string;
  /** RIR type a new plan row starts with */ rirType?: string;
  /** vertical rise of the load over limb travel, gives the true resistance */ ma?: MechSpec;
  /** lever geometry, used to show the effective load at the bottom and top */ lever?: LeverSpec;
}

export interface Settings {
  athleteId: string; mode: Mode; unit: Unit; bar: number; plates: number[]; restSec: number;
  theme: "auto" | "dark" | "light"; rirTypes?: RirType[]; /** how many hard sets a myo-rep set counts as */ myoSet?: number; /** extra sets each mini-set adds to that */ myoMini?: number; /** seconds of rest between mini-sets */ myoRest?: number; mesoStart: string | null; activeMeso: string; week: number;
  fx?: import("./lib/formulas").Formulas; onboarded?: boolean; effort?: "rir" | "rpe"; sex?: "m" | "f"; tms?: Partial<Record<LiftKey, number>>; liftMap?: Partial<Record<LiftKey, string>>;
}
export interface Seed {
  mesos: Meso[]; sessions: Omit<Session, "athleteId" | "status">[]; library: Record<string, string>;
  targets: Record<string, (number | null)[]>; landmarks: Record<string, { mv: number | null; mev: number | null; mav: number | null; mrv: number | null }>;
  split: { day: string; session: string; emphasis: string }[]; mobility: { session: string; letter: string; exercise: string; sets: number | null; reps: string; tempo: string | null; note: string | null }[];
}
