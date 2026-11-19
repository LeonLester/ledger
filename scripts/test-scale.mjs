import { parseMiScale2, parseMiScale1, parseAdvert, SCALES } from "../src/lib/scale.ts";
import { pairSamples, resistanceByRom, rate } from "../src/lib/live.ts";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
const u8 = (a) => Uint8Array.from(a);
const mac = "AA:BB:CC:DD:EE:FF", macBytes = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
const ad = (o) => ({ address: mac, service: {}, mfr: [], ...o });
// These frames are built from the published layouts, not captured from a unit.

// Mi Body Composition Scale 2: 72.35 kg = 14470 = 0x3886
const frame2 = (c0, c1, raw, imp = 0) => u8([c0, c1, 0xe9, 0x07, 11, 19, 8, 30, 0, imp & 255, imp >> 8, raw & 255, raw >> 8]);
const a = parseMiScale2(frame2(0x02, 0x20, 14470));
ok(a && near(a.kg, 72.35) && a.stable && !a.removed && a.impedance == null, `Mi 2: ${a?.kg} kg stable`);
ok(!parseMiScale2(frame2(0x02, 0x00, 14470)).stable, "Mi 2: unstable frame is flagged");
ok(near(parseMiScale2(frame2(0x03, 0x20, 15950)).kg, 72.35), "Mi 2: pounds");
ok(parseMiScale2(frame2(0x02, 0x22, 14470, 512)).impedance === 512, "Mi 2: impedance");
ok(parseMiScale2(new Uint8Array(5)) === null, "Mi 2: short frame rejected");
ok(parseAdvert(ad({ service: { "181b": frame2(0x02, 0x20, 14470) } }))?.model === "mi-scale-2", "registry picks Mi 2 from service data");

// Mi Scale 1 and Mi Smart Scale 2: 10 bytes, flags then weight
const frame1 = (f, raw) => u8([f, raw & 255, raw >> 8, 0xe9, 0x07, 11, 19, 8, 30, 0]);
const m1 = parseMiScale1(frame1(0x22, 14470));
ok(m1 && near(m1.kg, 72.35) && m1.stable && !m1.removed, `Mi 1: ${m1?.kg} kg stable`);
ok(!parseMiScale1(frame1(0x02, 14470)).stable, "Mi 1: not stable");
ok(near(parseMiScale1(frame1(0x23, 15950)).kg, 72.35), "Mi 1: pounds");
ok(parseAdvert(ad({ service: { "181d": frame1(0x22, 14470) } }))?.model === "mi-scale-1", "registry picks Mi 1");

// Etekcity Fit 8S: 72.27 kg settling then stable
const fit = (g, st, mf = macBytes.slice().reverse()) => u8([1, ...mf, 0xc0, 0xa8, 1, g & 255, (g >> 8) & 255, g >> 16, 0, 0, st, 0, 2, 3, 0]);
const f1 = parseAdvert(ad({ mfr: [{ id: 0x06d0, data: fit(72270, 0) }] }));
ok(f1?.model === "etekcity-fit8s" && near(f1.kg, 72.27) && !f1.stable, "Fit 8S: settling frame carries live weight");
ok(parseAdvert(ad({ mfr: [{ id: 0x06d0, data: fit(72270, 1) }] }))?.stable === true, "Fit 8S: stable frame");
ok(parseAdvert(ad({ mfr: [{ id: 0x06d0, data: fit(72270, 1, [1, 2, 3, 4, 5, 6]) }] })) === null, "Fit 8S: frame that does not echo the sender is ignored");

// Eufy C20 / P3: company id high byte is the first address byte
const eufy = (st, w) => ({ id: (0xaa << 8) | 0x64, data: u8([0xbb, 0xcc, 0xdd, 0xee, 0xff, 0, 0, 0, 0, 0, st, 0, w & 255, w >> 8, 0, 0, 0, 0]) });
const e1 = parseAdvert(ad({ mfr: [eufy(0x01, 7235)] }));
ok(e1?.model === "eufy-c20-p3" && near(e1.kg, 72.35) && !e1.stable, "Eufy: live status 1");
ok(parseAdvert(ad({ mfr: [eufy(0x05, 7235)] }))?.stable === true, "Eufy: final status 5");
ok(parseAdvert(ad({ mfr: [eufy(0x00, 0)] })) === null, "Eufy: idle frame ignored");

// OKOK C0: weight big endian, hundredths when properties 0x24 / 0x25
const c0 = (props, w) => ({ id: 0x07c0, data: u8([w >> 8, w & 255, 0, 0, 0, 0, props, ...macBytes]) });
const o1 = parseAdvert(ad({ mfr: [c0(0x25, 7235)] }));
ok(o1?.model === "okok" && near(o1.kg, 72.35) && o1.stable, "OKOK C0: final, hundredths");
ok(!parseAdvert(ad({ mfr: [c0(0x24, 7235)] })).stable, "OKOK C0: settling");
ok(near(parseAdvert(ad({ mfr: [c0(0x21, 723)] })).kg, 72.3), "OKOK C0: tenths");
const v20 = (props, w) => { const d = [0x0b, 0, 0, 0, 0, 1, props, 7, w >> 8, w & 255, 0x17, 0x70]; let x = 0x20; for (const b of d) x ^= b; return { id: 0x20ca, data: u8([...d, x, ...macBytes]) }; };
ok(near(parseAdvert(ad({ mfr: [v20(0x05, 7235)] })).kg, 72.35), "OKOK 2.0: checksum accepted");
const bad = v20(0x05, 7235); bad.data[3] ^= 1;
ok(parseAdvert(ad({ mfr: [bad] })) === null, "OKOK 2.0: bad checksum ignored");
ok(parseAdvert(ad({ address: "11:22:33:44:55:66", mfr: [c0(0x25, 7235)] })) === null, "OKOK C0: another device's frame is ignored");
ok(SCALES.length === 5, "five scale families registered");

// resistance against height
const pos = [], reads = [];
const h = (t) => { const ph = (t % 4) / 4; return 40 * (ph < 0.5 ? ph * 2 : 2 - ph * 2); };
for (let i = 0; i <= 200; i++) pos.push({ t: i / 20, y: h(i / 20) });
for (let i = 0; i <= 200; i++) reads.push({ t: i / 20, kg: 100 - 0.75 * h(Math.max(0, i / 20 - 0.3)) });
ok(pairSamples(pos, reads, 0).length > 150, "pairs positions with readings");
const up = resistanceByRom(pairSamples(pos, reads, 0)).filter((p) => p.up != null);
ok(up.length >= 15 && up[0].up > up[up.length - 1].up, `curve falls with height: ${up[0]?.up.toFixed(0)} -> ${up[up.length - 1]?.up.toFixed(0)} kg`);
ok(near(rate([0, 0.5, 1, 1.5, 2]), 2, 0.01), "rate 2 per second");
ok(resistanceByRom([]).length === 0, "empty input gives no curve");
if (fails) { console.log(fails, "failed"); process.exit(1); }
