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
