/** guess a muscle group from an exercise name when the library says Unknown */
const RULES: [RegExp, string][] = [
  [/wrist (curl)/i, "Wrist Flexors"], [/wrist ext/i, "Wrist Extensors"], [/neck.*(curl|flex)/i, "Neck Flexors"], [/neck.*ext/i, "Neck Extensors"],
  [/tib/i, "Tibialis Anterior"], [/calf/i, "Calves"], [/hip thrust|glute|abduct|adductor|kickback/i, "Glutes"],
  [/crunch|ab |abs|hollow|plank|rollout/i, "Abs"], [/lat pull|pulldown|chin|pull-?up|row|pullover|lat /i, "Mid Back"],
  [/shrug|trap/i, "Mid Back"], [/oh tricep|tricep|weeb|katana|pushdown|\bpd\b|skull|dip/i, "Triceps (long head)"],
  [/hammer|brachi/i, "Brachioradialis"], [/curl/i, "Biceps"], [/ohp|overhead|shoulder press|military/i, "Shoulders (Front)"],
  [/lateral|diagonal|raise|face pull|rear delt/i, "Shoulders (lateral)"], [/bp|bench|fly|chest|push-?up|press|pec/i, "Chest"],
  [/leg curl|sldl|rdl|\bgm\b|good ?morning|nordic|hamstring|deadlift|\bdl\b/i, "Hamstrings"], [/back ext|hyper|erector/i, "Erectors"],
  [/squat|bbs|hack|leg press|lunge|split|extension|sissy/i, "Quads"],
];
export function guessMuscle(name: string): string {
  for (const [re, m] of RULES) if (re.test(name)) return m;
  return "Unknown";
}
/** fine muscle -> coarse landmark group used by the Volume Periodization sheet */
export function coarse(m: string): string {
  if (/Back|Lats/.test(m)) return "Back";
  if (/Shoulders/.test(m)) return "Shoulders";
  if (/Triceps/.test(m)) return "Triceps";
  if (m === "Biceps" || m === "Brachioradialis") return "Biceps";
  if (m === "Abs") return "Core";
  if (m === "Tibialis Anterior") return "Tibialis";
  if (/Neck/.test(m)) return "Neck";
  return m;
}

/** Secondary muscles that usually fail close behind the primary one, with the share of a set each earns. A starting point the user edits. */
const CONTRIB: [RegExp, Record<string, number>][] = [
  [/overhead (tricep|extension)|skull|pushdown|kickback/i, {}],
  [/close.?grip bench|dip|push-?up/i, { Chest: 0.5, "Shoulders (Front)": 0.33 }],
  [/bench|chest press|incline.*press|decline|\bbp\b|pec/i, { "Triceps (long head)": 0.33, "Shoulders (Front)": 0.33 }],
  [/overhead press|\bohp\b|shoulder press|military/i, { "Triceps (long head)": 0.33 }],
  [/pull-?up|chin|pulldown|lat pull/i, { Biceps: 0.33 }],
  [/row/i, { Biceps: 0.33, "Shoulders (lateral)": 0.25 }],
  [/romanian|stiff|good ?morning|\brdl\b|\bsldl\b/i, { Glutes: 0.5, Erectors: 0.5 }],
  [/deadlift|\bdl\b/i, { Hamstrings: 0.5, Glutes: 0.5, "Mid Back": 0.25 }],
  [/hip thrust|pull-?through/i, { Hamstrings: 0.25 }],
  [/lunge|split squat|step.?up/i, { Glutes: 0.5 }],
  [/squat|leg press|hack/i, { Glutes: 0.5 }],
];
export function suggestContrib(name: string, primary: string): Record<string, number> | undefined {
  for (const [re, c] of CONTRIB) if (re.test(name)) { const out = Object.fromEntries(Object.entries(c).filter(([m]) => m !== primary)); return Object.keys(out).length ? out : undefined; }
  return undefined;
}
