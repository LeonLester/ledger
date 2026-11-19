import { angle3, jointAngle, bestSide, trunkLean, repsFromAngle } from "../src/lib/joints.ts";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a, b, e = 0.1) => Math.abs(a - b) <= e;
const p = (x, y, z = 0, v = 1) => ({ x, y, z, v });

ok(near(angle3(p(0, 1), p(0, 0), p(0, -1)), 180), "straight limb is 180");
ok(near(angle3(p(0, 1), p(0, 0), p(1, 0)), 90), "right angle is 90");
ok(near(angle3(p(1, 0, 0), p(0, 0, 0), p(0, 0, 1)), 90), "depth counts: 90 in the z plane");
ok(angle3(p(0, 0), p(0, 0), p(1, 0)) === null, "zero length segment gives null");

// left leg: hip (23), knee (25), ankle (27); thigh level, shin vertical = knee at 90
const w = Array.from({ length: 33 }, () => p(0, 0));
w[23] = p(-0.4, 0); w[25] = p(0, 0); w[27] = p(0, 0.4);
ok(near(jointAngle(w, "knee", "L"), 90), "knee at the bottom of a squat reads 90");
w[24] = p(0, 0); w[26] = p(0, 0.4); w[28] = p(0, 0.8);
ok(near(jointAngle(w, "knee", "R"), 180), "right leg straight reads 180");

const lm = Array.from({ length: 33 }, () => p(0, 0, 0, 0.1));
lm[12].v = lm[24].v = lm[26].v = lm[28].v = 0.9;
ok(bestSide(lm) === "R", "picks the side the camera sees");
lm[11] = p(0.5, 0.3); lm[23] = p(0.5, 0.6);
ok(near(trunkLean(lm, "L", 1), 0), "upright torso leans 0");
lm[11] = p(0.6, 0.5); lm[23] = p(0.5, 0.6);
ok(near(trunkLean(lm, "L", 1), 45), "torso at 45 degrees");

// three reps between 170 and 80 degrees at 10 Hz
const s = [];
for (let i = 0; i <= 90; i++) s.push({ t: i / 10, a: 125 + 45 * Math.cos((i / 30) * 2 * Math.PI) - 0 });
const reps = repsFromAngle(s);
ok(reps.length >= 5 && reps.every((r) => near(r.range, 90, 1)), `finds the swings: ${reps.length} of range ${reps[0]?.range.toFixed(0)}`);
ok(repsFromAngle(s.map((x) => ({ ...x, a: 120 + (x.a - 125) * 0.1 }))).length === 0, "small wobble is not a rep");
if (fails) { console.log(fails, "failed"); process.exit(1); }
