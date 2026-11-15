// Run with: node scripts/test-core.mjs  (Node 22 strips types)
import { Tracker, analyze, toGray } from "../src/lib/barpath.ts";
import { buildSplit, TEMPLATES } from "../src/data/templates.ts";
import { PROGRAMS, trainingMaxes } from "../src/data/programs.ts";
import { sessionPrs } from "../src/lib/pr.ts";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };

// synthetic video: textured plate moving in a squat-like path, 3 reps, 30 fps
const W = 320, H = 240, R = 22, fps = 30;
const frame = (cx, cy) => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dist = Math.hypot(x - cx, y - cy);
    let v = 40 + ((x * 7 + y * 13) % 11); // background texture
    if (dist < R) v = 200 - dist * 2 + (Math.atan2(y - cy, x - cx) > 0 ? 25 : -25); // plate with a marking
    if (dist < 4) v = 20;
    const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return toGray(d, W, H);
};
const truth = [];
const N = fps * 9;
for (let k = 0; k < N; k++) { const t = k / fps; const rep = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 3); truth.push({ x: 160 + 3 * Math.sin(t * 2), y: 60 + 110 * rep }); }
const tr = new Tracker(frame(truth[0].x, truth[0].y), truth[0].x, truth[0].y, R);
const track = [{ t: 0, x: truth[0].x, y: truth[0].y }];
let maxErr = 0;
for (let k = 1; k < N; k++) { const s = tr.step(frame(truth[k].x, truth[k].y)); track.push({ t: k / fps, x: s.x, y: s.y }); maxErr = Math.max(maxErr, Math.hypot(s.x - truth[k].x, s.y - truth[k].y)); }
ok(maxErr < 1.5, `tracker follows the plate, max error ${maxErr.toFixed(2)} px`);
// plate radius 22 px = 0.225 m
const a = analyze(track, 0.225 / R);
ok(a.reps.length === 3, `3 reps found, got ${a.reps.length}`);
const rom = 110 * (0.225 / R);
ok(a.reps.every((r) => Math.abs(r.rom - rom) < 0.04), `ROM about ${rom.toFixed(2)} m: ${a.reps.map((r) => r.rom).join(", ")}`);
ok(a.reps.every((r) => Math.abs(r.mcv - rom / 1.5) < 0.08), `mean concentric velocity about ${(rom / 1.5).toFixed(2)} m/s: ${a.reps.map((r) => r.mcv).join(", ")}`);
ok(a.pts.length <= 140 && a.pts.length > 20, `stored path is ${a.pts.length} points`);

// templates
for (const t of TEMPLATES) {
  const g = buildSplit(t, { freq: 4, upper: 3, lower: 2 }, "m9");
  const names = g.meso.weeks[0].sessions.map((s) => s.name);
  ok(new Set(names).size === names.length && g.meso.weeks.length === 5 && g.split.length === 7, `${t.name}: ${names.join(", ")}`);
  ok(g.meso.weeks.every((w) => w.sessions.every((s) => s.items.every((i) => i.sets >= 1 && i.exercise))), `${t.name}: items valid`);
}
const ul = buildSplit(TEMPLATES.find((t) => t.id === "ul-x-y"), { freq: 3, upper: 3, lower: 2 }, "m9");
ok(ul.meso.weeks[0].sessions.filter((s) => s.name.startsWith("Upper")).length === 3 && ul.meso.weeks[0].sessions.filter((s) => s.name.startsWith("Lower")).length === 2, "3 upper 2 lower");
for (const n of [2, 3, 4, 5, 6]) ok(buildSplit(TEMPLATES[0], { freq: n, upper: 1, lower: 1 }, "m9").meso.weeks[0].sessions.length === n, `full body ${n}x`);

// programs
const m = { squat: 150, bench: 100, deadlift: 180, ohp: 60 };
for (const p of PROGRAMS) {
  const g = p.build("m9");
  const names = g.meso.weeks[0].sessions.map((s) => s.name);
  ok(new Set(names).size === names.length && g.meso.weeks.length === p.weeks, `${p.name}: ${names.join(", ")}`);
}
const tm = trainingMaxes(PROGRAMS.find((p) => p.id === "531"), m);
ok(tm.squat === 135 && tm.bench === 90, `5/3/1 training max 90%: ${JSON.stringify(tm)}`);
const w1 = PROGRAMS.find((p) => p.id === "531").build("m9").meso.weeks[0].sessions[3].items[0];
ok(w1.scheme.length === 8 && w1.scheme[2].amrap, `5/3/1 week 1 squat: ${w1.desc}`);

// PR engine
const set = (w, r, done = true) => ({ weight: w, reps: r, myo: [], done });
const ses = (id, mesoN, week, sets) => ({ id, athleteId: "me", meso: "m" + mesoN, week, name: "A", date: null, status: "done", exercises: [{ letter: "A", exercise: "Bench", unit: "kg", rir: 2, note: null, sets }] });
const hist = [ses("a", 1, 1, [set(100, 5), set(100, 4)]), ses("b", 1, 2, [set(100, 6)])];
const ctx = { mesoStart: null, split: [] };
const kinds = (cur) => sessionPrs(cur, [...hist, cur], [], ctx).map((p) => p.kind).sort().join(",");
ok(kinds(ses("c", 1, 3, [set(100, 7)])) === "e1rm,rep", `rep and e1rm PR: ${kinds(ses("c", 1, 3, [set(100, 7)]))}`);
ok(kinds(ses("c", 1, 3, [set(105, 3)])) === "e1rm,weight" || kinds(ses("c", 1, 3, [set(105, 3)])) === "weight", `weight PR: ${kinds(ses("c", 1, 3, [set(105, 3)]))}`);
ok(kinds(ses("c", 1, 3, [set(100, 5)])) === "", "no PR when equal or lower");
ok(kinds(ses("c", 1, 3, [set(90, 8)])) === "e1rm" || kinds(ses("c", 1, 3, [set(90, 8)])) === "rep,e1rm" || kinds(ses("c", 1, 3, [set(90, 8)])).includes("rep"), `heavier history beaten at lower load: ${kinds(ses("c", 1, 3, [set(90, 8)]))}`);
const bwHist = [{ id: "1", athleteId: "me", date: "2026-01-01", kg: 80 }];
const dated = (id, w, wk) => ({ ...ses(id, 1, wk, [set(w, 5)]), date: "2026-02-01" });
const h2 = [dated("x", 100, 1)];
const cur = dated("y", 105, 2);
const rel = sessionPrs(cur, [...h2, cur], bwHist, ctx).map((p) => p.kind);
ok(rel.includes("relative") && rel.includes("bwband"), `bodyweight PRs: ${rel}`);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
