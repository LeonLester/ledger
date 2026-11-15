import type { LiftKey, Unit } from "../types";

export interface CatEntry { muscle: string; unit?: Unit; inc?: number }
/** Standard exercises used by generated programs. Muscle names match the app's library. */
export const CAT: Record<string, CatEntry> = {
  "Back Squat": { muscle: "Quads", inc: 2.5 }, "Front Squat": { muscle: "Quads" }, "Hack Squat": { muscle: "Quads" }, "Leg Press": { muscle: "Quads", inc: 5 },
  "Leg Extension": { muscle: "Quads" }, "Bulgarian Split Squat": { muscle: "Quads" }, "Walking Lunge": { muscle: "Quads" }, "Pause Squat": { muscle: "Quads" },
  "Deadlift": { muscle: "Erectors", inc: 5 }, "Romanian Deadlift": { muscle: "Hamstrings", inc: 2.5 }, "Stiff-Leg Deadlift": { muscle: "Hamstrings" }, "Good Morning": { muscle: "Hamstrings" },
  "Seated Leg Curl": { muscle: "Hamstrings" }, "Lying Leg Curl": { muscle: "Hamstrings" }, "Hip Thrust": { muscle: "Glutes", inc: 5 }, "Cable Pull-Through": { muscle: "Glutes" },
  "Standing Calf Raise": { muscle: "Calves" }, "Seated Calf Raise": { muscle: "Calves" }, "Back Extension": { muscle: "Erectors" },
  "Barbell Bench Press": { muscle: "Chest", inc: 2.5 }, "Incline Dumbbell Press": { muscle: "Chest" }, "Machine Chest Press": { muscle: "Chest" }, "Cable Fly": { muscle: "Chest" },
  "Dip": { muscle: "Chest" }, "Pause Bench Press": { muscle: "Chest" }, "Close-Grip Bench Press": { muscle: "Triceps (long head)" },
  "Overhead Press": { muscle: "Shoulders (Front)", inc: 2.5 }, "Dumbbell Shoulder Press": { muscle: "Shoulders (Front)" }, "Machine Shoulder Press": { muscle: "Shoulders (Front)" },
  "Lateral Raise": { muscle: "Shoulders (lateral)", inc: 1 }, "Cable Lateral Raise": { muscle: "Shoulders (lateral)", inc: 1 }, "Face Pull": { muscle: "Shoulders (lateral)" }, "Reverse Pec Deck": { muscle: "Shoulders (lateral)" },
  "Lat Pulldown": { muscle: "Mid Back" }, "Pull-Up": { muscle: "Mid Back", inc: 2.5 }, "Neutral-Grip Pulldown": { muscle: "Mid Back" },
  "Chest-Supported Row": { muscle: "Mid Back" }, "Barbell Row": { muscle: "Mid Back", inc: 2.5 }, "Seated Cable Row": { muscle: "Mid Back" }, "One-Arm Dumbbell Row": { muscle: "Mid Back" },
  "Triceps Pushdown": { muscle: "Triceps (long head)" }, "Overhead Triceps Extension": { muscle: "Triceps (long head)" }, "Skull Crusher": { muscle: "Triceps (long head)" },
  "Incline Dumbbell Curl": { muscle: "Biceps", inc: 1 }, "Barbell Curl": { muscle: "Biceps" }, "Cable Curl": { muscle: "Biceps" }, "Preacher Curl": { muscle: "Biceps" }, "Hammer Curl": { muscle: "Brachioradialis", inc: 1 },
  "Cable Crunch": { muscle: "Abs" }, "Hanging Leg Raise": { muscle: "Abs" },
};

/** Ordered exercise pools. A slot names a pool, optionally "+n" to take a later entry so a second slot differs from the first. */
export const POOL: Record<string, string[]> = {
  chest: ["Barbell Bench Press", "Incline Dumbbell Press", "Machine Chest Press", "Cable Fly", "Dip"],
  vpull: ["Lat Pulldown", "Pull-Up", "Neutral-Grip Pulldown"],
  hpull: ["Chest-Supported Row", "Barbell Row", "Seated Cable Row", "One-Arm Dumbbell Row"],
  press: ["Overhead Press", "Dumbbell Shoulder Press", "Machine Shoulder Press"],
  lateral: ["Lateral Raise", "Cable Lateral Raise"],
  rear: ["Face Pull", "Reverse Pec Deck"],
  triceps: ["Triceps Pushdown", "Overhead Triceps Extension", "Skull Crusher"],
  biceps: ["Incline Dumbbell Curl", "Barbell Curl", "Cable Curl", "Preacher Curl"],
  brachio: ["Hammer Curl"],
  squat: ["Back Squat", "Hack Squat", "Front Squat", "Leg Press"],
  quad: ["Leg Press", "Leg Extension", "Bulgarian Split Squat", "Walking Lunge"],
  hinge: ["Romanian Deadlift", "Stiff-Leg Deadlift", "Good Morning"],
  ham: ["Seated Leg Curl", "Lying Leg Curl"],
  glute: ["Hip Thrust", "Cable Pull-Through"],
  calf: ["Standing Calf Raise", "Seated Calf Raise"],
  abs: ["Cable Crunch", "Hanging Leg Raise"],
};

export const LIFT_NAME: Record<LiftKey, string> = { squat: "Back Squat", bench: "Barbell Bench Press", deadlift: "Deadlift", ohp: "Overhead Press" };
export const LIFT_LABEL: Record<LiftKey, string> = { squat: "Squat", bench: "Bench", deadlift: "Deadlift", ohp: "Overhead press" };
export const LIFTS: LiftKey[] = ["squat", "bench", "deadlift", "ohp"];
