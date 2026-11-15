// Run with: node scripts/test-core.mjs  (Node 22 strips types)
import { Tracker, analyze, toGray } from "../src/lib/barpath.ts";
import { buildSplit, TEMPLATES } from "../src/data/templates.ts";
import { PROGRAMS, trainingMaxes } from "../src/data/programs.ts";
import { sessionPrs } from "../src/lib/pr.ts";
import { parseSets } from "../src/lib/sheet.ts";
import { linkPrev, relabel, runs, muscleColor } from "../src/lib/groups.ts";
import { sampleYear } from "../src/data/sampleYear.ts";
import { expand, expandLayouts } from "../src/lib/expand.ts";
import { setFormulas, est1rm, weightForReps, checkFormula, compile, score, parseWarm } from "../src/lib/formulas.ts";

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

// spreadsheet cell parsing
const p1 = parseSets("100x8 100x8 95x9");
ok(p1 && p1.length === 3 && p1[2].weight === 95 && p1[2].reps === 9, "sheet cell: three sets");
const p2 = parseSets("60x12+4+3, 55 x 10");
ok(p2 && p2.length === 2 && p2[0].myo.join() === "4,3" && p2[1].weight === 55, "sheet cell: myo reps and commas");
ok(parseSets("abc") === null && parseSets("100x") === null, "sheet cell: rejects junk");
ok(parseSets("62.5x8")?.[0].weight === 62.5, "sheet cell: decimal weight");
// custom program expansion
const base = [{ name: "A", items: [{ letter: "A", exercise: "Squat", sets: 4, repLo: 5, repHi: 8, rir: 2 }, { letter: "B", exercise: " ", sets: 3, repLo: 8, repHi: 12, rir: 2 }] }];
const ex = expand(base, 5, 3, 1, true);
ok(ex.length === 5 && ex[0].sessions[0].items[0].rir === 3 && ex[3].sessions[0].items[0].rir === 1, "custom block: RIR ramps");
ok(ex[4].sessions[0].items[0].sets === 2 && ex[4].sessions[0].items[0].rir === 4, "custom block: deload halves sets");
ok(ex[0].sessions[0].items.length === 1, "custom block: blank exercises dropped");

// formulas
ok(Math.abs(est1rm(100, 5) - 116.667) < 0.01, "e1RM epley default");
setFormulas({ e1rm: "brzycki" });
ok(Math.abs(est1rm(100, 5) - 112.5) < 0.01, "e1RM brzycki");
ok(Math.abs(weightForReps(est1rm(100, 8), 8) - 100) < 0.01, "rep max inverts the formula");
setFormulas({ e1rm: "custom", custom: "w * (1 + 0.03 * r)" });
ok(Math.abs(est1rm(100, 5) - 115) < 0.01, "e1RM custom formula");
ok(checkFormula("w *") !== null && checkFormula("process.exit()") !== null && checkFormula("w * (1 + r / 30)") === null, "custom formula validation");
ok(compile("2 ^ 3 ^ 2")(0, 0) === 512 && compile("-w + 10")(4, 0) === 6, "expression precedence");
setFormulas({ e1rm: "epley", useRir: true });
ok(Math.abs(est1rm(100, 5 + 2) - 123.33) < 0.01, "rir option uses effective reps");
setFormulas(undefined);
const d = score(500, 80, "m", "dots"), w = score(500, 80, "m", "wilks"), g = score(500, 80, "m", "ipf");
ok(d > 300 && d < 400 && w > 300 && w < 450 && g > 60 && g < 90, `scores in range: ${d.toFixed(1)} ${w.toFixed(1)} ${g.toFixed(1)}`);
ok(parseWarm("40%x8, 60 x 5")?.length === 2 && parseWarm("junk") === null, "warm-up parsing");

{
  const L = (...l) => l.map((letter) => ({ letter }));
  ok(relabel(L("A", "B", "C")).map((x) => x.letter).join() === "A1,B1,C1", "relabel turns old A B C into A1 B1 C1");
  const ss = linkPrev(L("A1", "B1", "C1"), 1, true);
  ok(ss.map((x) => x.letter).join() === "A1,A2,B1", "link makes a superset and renumbers");
  const tri = linkPrev(ss, 2, true);
  ok(tri.map((x) => x.letter).join() === "A1,A2,A3", "superset of three");
  ok(linkPrev(tri, 1, false).map((x) => x.letter).join() === "A1,B1,B2", "unlink splits the group at that exercise");
  ok(runs(L("A1", "A2", "B1")).map((r) => `${r.size}${r.last ? "L" : ""}`).join() === "2,2L,1L", "runs mark group ends");
  ok(runs(L("1", "2")).every((r) => r.size === 1), "digit-only legacy letters are not supersets");
  ok(muscleColor("Chest") === "#6d9eeb" && muscleColor("Quads") === "#e06666" && muscleColor("Calves") === "#d5a6bd", "muscle colours");
}
for (const t of TEMPLATES) {
  const y = sampleYear(t, new Date("2026-11-15T12:00:00"));
  const dates = y.sessions.map((s) => s.date).sort();
  const ids = new Set(y.sessions.map((s) => s.id));
  const span = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 864e5;
  ok(y.sessions.length > 80 && ids.size === y.sessions.length && span > 330 && dates[dates.length - 1] <= "2026-11-15" && y.mesos.length === 11 && y.bodyweight.length > 45, `sample year ${t.id}: ${y.sessions.length} sessions over ${Math.round(span)} days`);
  ok(y.sessions.every((s) => s.exercises.every((e) => e.sets.every((x) => x.reps > 0 && (x.weight === null || x.weight > 0)))), `sample year ${t.id} sets valid`);
}
{
  const t = TEMPLATES.find((x) => x.id === "ulab");
  const g = buildSplit(t, { freq: 3, upper: 3, lower: 3 }, "mX");
  const seq = (sp) => sp.map((r) => r.session).join(",");
  ok(seq(g.meso.weeks[0].split) === "Upper A 1,Lower A 1,Upper B,Lower B,Upper A 2,Lower A 2,Rest", "A/B week 1: " + seq(g.meso.weeks[0].split));
  ok(seq(g.meso.weeks[1].split) === "Upper B 1,Lower B 1,Upper A,Lower A,Upper B 2,Lower B 2,Rest", "A/B week 2: " + seq(g.meso.weeks[1].split));
  ok(g.meso.weeks[2].split && seq(g.meso.weeks[2].split) === seq(g.meso.weeks[0].split) && g.meso.weeks[4].sessions.length === 6, "A/B rotates every two weeks");
  const names = g.meso.weeks[0].sessions.map((s) => s.name); ok(new Set(names).size === 6, "A/B week sessions have unique names");
}
{
  const D = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const mk = (n) => ({ name: n, items: [{ letter: "A", exercise: n + " lift", sets: 3, repLo: 8, repHi: 12, rir: 2 }] });
  const lay = (...x) => D.map((day, i) => ({ day, session: x[i] ?? "Rest", emphasis: "" }));
  const r = expandLayouts([mk("Ua"), mk("La")], 4, 3, 1, false, lay("Ua", "La", "Ua", "La"), lay("La", "Ua"));
  const names = (w) => w.sessions.map((s) => s.name).join();
  ok(names(r.weeks[0]) === "Ua 1,La 1,Ua 2,La 2" && r.weeks[0].split, "builder: repeated sessions are numbered");
  ok(names(r.weeks[1]) === "La,Ua" && r.weeks[1].split[0].session === "La", "builder: even weeks use the second layout");
  const plain = expandLayouts([mk("Ua"), mk("La")], 2, 3, 1, false, lay("Ua", "La"), null);
  ok(!plain.weeks[0].split && names(plain.weeks[0]) === "Ua,La", "builder: plain week stays unchanged");
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
