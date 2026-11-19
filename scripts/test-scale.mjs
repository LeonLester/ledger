import { parseMiScale2 } from "../src/lib/scale.ts";
import { pairSamples, resistanceByRom, rate } from "../src/lib/live.ts";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;

// 72.35 kg, stable, no impedance: 14470 = 0x3886
const frame = (c0, c1, raw, imp = 0) => Uint8Array.from([c0, c1, 0xe9, 0x07, 11, 19, 8, 30, 0, imp & 255, imp >> 8, raw & 255, raw >> 8]);
const a = parseMiScale2(frame(0x02, 0x20, 14470));
ok(a && near(a.kg, 72.35) && a.stable && !a.removed && a.impedance == null, `kg frame -> ${a?.kg} kg stable`);
const m = parseMiScale2(frame(0x02, 0x00, 14470));
ok(m && !m.stable, "unstable frame is flagged");
const lb = parseMiScale2(frame(0x03, 0x20, 15950));
ok(lb && near(lb.kg, 72.35, 0.01), `pounds frame -> ${lb?.kg} kg`);
const imp = parseMiScale2(frame(0x02, 0x22, 14470, 512));
ok(imp && imp.impedance === 512, "impedance read when present");
ok(parseMiScale2(new Uint8Array(5)) === null, "short frame rejected");

// synthetic set: plate rises 0..40 cm and falls, resistance 100 -> 70 on the way up, scale lags 0.3 s
const pos = [], reads = [];
for (let i = 0; i <= 200; i++) { const t = i / 20; const ph = (t % 4) / 4; const y = 40 * (ph < 0.5 ? ph * 2 : 2 - ph * 2); pos.push({ t, y }); }
for (let i = 0; i <= 200; i++) { const t = i / 20; const y = 40 * (((t - 0.3) % 4) / 4 < 0.5 ? (((t - 0.3) % 4) / 4) * 2 : 2 - (((t - 0.3) % 4) / 4) * 2); reads.push({ t: t + 0.0, kg: 100 - (0.75 * Math.max(0, Math.min(40, y))) }); }
const pairedLag = pairSamples(pos, reads, 0);
ok(pairedLag.length > 150, "pairs positions with readings");
const curve = resistanceByRom(pairSamples(pos, reads, 0));
const up = curve.filter((p) => p.up != null);
ok(up.length >= 15 && up[0].up > up[up.length - 1].up, `curve falls with height: ${up[0]?.up.toFixed(0)} -> ${up[up.length - 1]?.up.toFixed(0)} kg`);
ok(near(rate([0, 0.5, 1, 1.5, 2]), 2, 0.01), "rate 2 per second");
ok(resistanceByRom([]).length === 0, "empty input gives no curve");
if (fails) { console.log(fails, "failed"); process.exit(1); }
