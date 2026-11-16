import { curve, LEVER_DEFAULT, LEVER_PRESETS, loadFor, summarize } from "../src/lib/lever.ts";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;

const base = { ...LEVER_DEFAULT, loadArm: 200, userArm: 100, start: 10, end: 40 };
const arc = summarize(base, 50);
ok(near(arc.bottom, 100 * Math.cos(Math.PI / 18)) && near(arc.top, 100 * Math.cos((40 * Math.PI) / 180)), `arc: ${arc.bottom.toFixed(1)} kg bottom, ${arc.top.toFixed(1)} kg top`);
ok(near(arc.change, ((76.6044 - 98.4808) / 98.4808) * 100, 0.05), `arc change ${arc.change.toFixed(1)}%`);
ok(near(arc.maBottom, 1.9696, 0.001), `per kg of plates ${arc.maBottom.toFixed(3)}`);

const vert = summarize({ ...base, path: "fixed", pull: 90 }, 50);
ok(curve({ ...base, path: "fixed", pull: 90 }, 50).every((p) => near(p.kg, 100, 1e-6)), "vertical pull on a lever is constant (load x arm ratio)");
ok(near(vert.change, 0, 0.001), "no change for a vertical pull");

const pend = LEVER_PRESETS.find((p) => p.id === "pendulum").spec;
const ps = summarize(pend, 100);
ok(ps.bottom > ps.top && near(ps.bottom, (100 * 90 * Math.cos((35 * Math.PI) / 180)) / 60, 0.01), `pendulum is heavier at the bottom: ${ps.bottom.toFixed(1)} vs ${ps.top.toFixed(1)}`);

const opp = summarize({ ...base, offset: 180 }, 50);
ok(near(opp.bottom, arc.bottom) && !opp.assists, "plates on the far side give the same size resistance, positive at the start");

const heavyArm = summarize({ ...base, armMass: 10, armCom: 50 }, 50);
ok(near(heavyArm.bottom, ((50 * 200 + 10 * 50) * Math.cos(Math.PI / 18)) / 100), `arm weight adds load: ${heavyArm.bottom.toFixed(1)} kg`);

ok(summarize({ ...base, start: 60, end: 120 }, 50).assists, "flags when the arm starts to assist");
const blind = summarize({ ...base, path: "fixed", pull: 10 }, 50);
ok(blind.blind && blind.bottom === null, "points where the pull runs along the arm are dropped");
ok(near(loadFor(100, arc.maTop), 100 / 1.5321, 0.01), `plates for 100 kg at the top: ${loadFor(100, arc.maTop).toFixed(1)}`);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
