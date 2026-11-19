/**
 * Bluetooth scales that broadcast their reading. None of them needs a connection: the weight is in the advertisement the scale
 * sends while someone stands on it, so the phone only scans. That keeps the scale usable with its own app at the same time and is
 * what makes a live stream possible. Each scale below sends the weight while it is still settling, flagged as not stable.
 *
 * The layouts come from public reverse engineering work (ESPHome xiaomi_miscale, openScale, bdr99/eufylife-ble-client,
 * ronnnnnnnnnnnnn/etekcity_esf551_ble and the ble-scale-sync captures). The tests build frames from those layouts. None of these
 * has been checked against a unit here, so the unit and stable bits are what to confirm first on a real scale.
 */
export type ScaleId = "mi-scale-2" | "mi-scale-1" | "etekcity-fit8s" | "eufy-c20-p3" | "okok";

export interface ScaleReading { kg: number; stable: boolean; removed: boolean; impedance: number | null; raw: string; model: ScaleId }

/** What the Bluetooth plugin hands over for one advertisement. */
export interface Advert {
  /** Android: the scale's address like AA:BB:CC:DD:EE:FF. Scales that echo their own address in the frame are matched on it. */
  address: string;
  name?: string;
  /** service data by 16 bit uuid (4 hex digits, lower case) */
  service: Record<string, Uint8Array>;
  /** manufacturer data, company id and the bytes after it */
  mfr: { id: number; data: Uint8Array }[];
}

export interface ScaleDef { id: ScaleId; name: string; note: string; parse(a: Advert): ScaleReading | null }

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const r2 = (n: number) => Math.round(n * 100) / 100;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const addr = (a: string) => a.replace(/[^0-9a-f]/gi, "").toUpperCase();
/** true when the frame names the sender, or when there is no address to compare against */
const echoes = (frame: string, a: Advert) => { const m = addr(a.address); return m.length !== 12 || m === frame.toUpperCase(); };
const reversed = (b: Uint8Array) => hex(Uint8Array.from(b).reverse());

export const MI_SCALE_SERVICE = "0000181b-0000-1000-8000-00805f9b34fb";

/**
 * Xiaomi Mi Body Composition Scale 2 (XMTZC05HM), service data 0x181B, 13 bytes:
 *   0 control (bit 0 pounds), 1 control (bit 1 impedance, bit 5 stable, bit 6 catty, bit 7 weight removed),
 *   2-8 date and time, 9-10 impedance, 11-12 weight little endian (kg x 200, lb x 100, catty x 100).
 */
export function parseMiScale2(b: Uint8Array): ScaleReading | null {
  if (b.length !== 13) return null;
  const c0 = b[0], c1 = b[1];
  const lb = (c0 & 1) !== 0, catty = (c1 & (1 << 6)) !== 0;
  const w = le16(b, 11);
  const kg = lb ? (w / 100) * 0.45359237 : catty ? (w / 100) * 0.5 : w / 200;
  const imp = le16(b, 9);
  return { kg: r2(kg), stable: (c1 & (1 << 5)) !== 0, removed: (c1 & (1 << 7)) !== 0, impedance: (c1 & 2) !== 0 && imp > 0 ? imp : null, raw: hex(b), model: "mi-scale-2" };
}

/**
 * Xiaomi Mi Scale 1 (XMTZC01HM, XMTZC02HM) and Mi Smart Scale 2 (XMTZC04HM, weight only), service data 0x181D, 10 bytes:
 *   0 flags (bit 0 pounds, bit 4 catty, bit 5 stable, bit 7 removed), 1-2 weight little endian, 3-9 date and time.
 */
export function parseMiScale1(b: Uint8Array): ScaleReading | null {
  if (b.length !== 10) return null;
  const f = b[0], w = le16(b, 1);
  const kg = (f & 1) !== 0 ? (w / 100) * 0.45359237 : (f & 0x10) !== 0 ? (w / 100) * 0.5 : w / 200;
  return { kg: r2(kg), stable: (f & 0x20) !== 0, removed: (f & 0x80) !== 0, impedance: null, raw: hex(b), model: "mi-scale-1" };
}

/**
 * Etekcity Fit 8S, manufacturer data 0x06D0, 20 bytes. It sends no name and does not accept connections.
 *   0 is 1, 1-6 the scale's own address reversed, 10-12 weight in grams (24 bit little endian),
 *   15 state (0 settling, 1 stable), 16 display unit (0 kg, 1 lb, 2 st; the weight is grams in all of them).
 */
export function parseEtekcityFit8s(a: Advert): ScaleReading | null {
  const m = a.mfr.find((x) => x.id === 0x06d0 && x.data.length === 20);
  if (!m) return null;
  const d = m.data;
  if (d[0] !== 1 || d[15] > 1 || d[16] > 2 || !echoes(reversed(d.subarray(1, 7)), a)) return null;
  const g = d[10] | (d[11] << 8) | (d[12] << 16);
  return { kg: r2(g / 1000), stable: d[15] === 1, removed: false, impedance: null, raw: hex(d), model: "etekcity-fit8s" };
}

/**
 * Eufy Smart Scale C20 (T9130) and P3 (T9150), manufacturer data, 18, 23 or 24 bytes after the company id. The company id's high
 * byte plus bytes 0-4 spell the scale's own address. 5 is 0, 10 status (1 live, 5 15 25 65 a5 final, 0 and d idle), 12-13 weight
 * in hundredths of a kg, little endian.
 */
const EUFY_FINAL = new Set([0x05, 0x15, 0x25, 0x65, 0xa5]);
export function parseEufyC20P3(a: Advert): ScaleReading | null {
  for (const m of a.mfr) {
    const d = m.data;
    if (d.length < 18 || d.length > 24 || d[5] !== 0) continue;
    if (!echoes(((m.id >> 8) & 0xff).toString(16).padStart(2, "0") + hex(d.subarray(0, 5)), a)) continue;
    const st = d[10];
    if (st !== 1 && !EUFY_FINAL.has(st)) continue;
    return { kg: r2(le16(d, 12) / 100), stable: st !== 1, removed: false, impedance: null, raw: hex(d), model: "eufy-c20-p3" };
  }
  return null;
}

/**
 * OKOK and Chipsea scales sold under many brands (NIX, Xiaogui, MaxxMee and others, with the OKOK or similar app). Weight in kg only.
 *  C0 dialect: company id with low byte 0xC0, 13 bytes: 0-1 weight big endian, 6 properties, 7-12 own address.
 *  2.0 dialect: company id 0x20CA, 19 bytes, checksum at 12 (0x20 xor bytes 0-11): 6 properties, 8-9 weight big endian, 13-18 own address.
 */
const C0_PROPS: Record<number, [boolean, number]> = { 0x20: [false, 10], 0x21: [true, 10], 0x24: [false, 100], 0x25: [true, 100] };
const V20_PROPS: Record<number, [boolean, number]> = { 0x01: [true, 10], 0x04: [false, 100], 0x05: [true, 100] };
export function parseOkok(a: Advert): ScaleReading | null {
  for (const m of a.mfr) {
    const d = m.data;
    if ((m.id & 0xff) === 0xc0 && d.length === 13 && (d[6] & 0xe0) === 0x20) {
      const p = C0_PROPS[d[6]];
      const own = hex(d.subarray(7, 13));
      const yoda = /^yoda[01]/i.test(a.name ?? "") && own === "000000000000";
      if (!p || !(yoda || echoes(own, a))) continue;
      return { kg: r2(be16(d, 0) / p[1]), stable: p[0], removed: false, impedance: null, raw: hex(d), model: "okok" };
    }
    if (m.id === 0x20ca && d.length === 19) {
      let x = 0x20;
      for (let i = 0; i < 12; i++) x ^= d[i];
      const p = V20_PROPS[d[6]];
      if (x !== d[12] || !p || !echoes(hex(d.subarray(13, 19)), a)) continue;
      return { kg: r2(be16(d, 8) / p[1]), stable: p[0], removed: false, impedance: null, raw: hex(d), model: "okok" };
    }
  }
  return null;
}

export const SCALES: ScaleDef[] = [
  { id: "mi-scale-2", name: "Xiaomi Mi Body Composition Scale 2", note: "XMTZC05HM, shown as MIBFS", parse: (a) => (a.service["181b"] ? parseMiScale2(a.service["181b"]) : null) },
  { id: "mi-scale-1", name: "Xiaomi Mi Scale 1 and Mi Smart Scale 2", note: "XMTZC01HM, XMTZC02HM, XMTZC04HM", parse: (a) => (a.service["181d"] ? parseMiScale1(a.service["181d"]) : null) },
  { id: "etekcity-fit8s", name: "Etekcity Fit 8S", note: "broadcast only, no name", parse: parseEtekcityFit8s },
  { id: "eufy-c20-p3", name: "Eufy Smart Scale C20 and P3", note: "T9130, T9150", parse: parseEufyC20P3 },
  { id: "okok", name: "OKOK and Chipsea white label scales", note: "NIX, Xiaogui, MaxxMee and many others, kg display", parse: parseOkok },
];

/** The first supported scale that recognises this advertisement. */
export function parseAdvert(a: Advert): ScaleReading | null {
  for (const s of SCALES) { const r = s.parse(a); if (r) return r; }
  return null;
}

export type ScaleListener = (r: ScaleReading, at: number) => void;

const short = (k: string) => { const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(k); return (m ? m[1] : k.replace(/^0x/i, "")).toLowerCase(); };
const bytes = (v: DataView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

/** Starts a scan and calls back for every advertisement from a supported scale, repeats included, so the update rate can be measured. Returns a stop function. */
export async function startScaleScan(on: ScaleListener, onError: (m: string) => void): Promise<() => Promise<void>> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    await BleClient.requestLEScan({ services: [], allowDuplicates: true }, (res) => {
      const service: Record<string, Uint8Array> = {};
      for (const [k, v] of Object.entries(res.serviceData ?? {})) service[short(k)] = bytes(v);
      const mfr = Object.entries(res.manufacturerData ?? {}).map(([k, v]) => ({ id: Number(k), data: bytes(v) }));
      const r = parseAdvert({ address: res.device.deviceId, name: res.localName ?? res.device.name, service, mfr });
      if (r) on(r, performance.now() / 1000);
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
    return async () => {};
  }
  return async () => { try { await BleClient.stopLEScan(); } catch { /* already stopped */ } };
}
