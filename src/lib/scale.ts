/**
 * Xiaomi Mi Body Composition Scale 2 (XMTZC05HM, shown as "MIBFS" in Bluetooth scans).
 * The scale does not need a connection. It broadcasts its reading as service data under 0x181B, so any phone in range can read it
 * while someone stands on it. Layout follows the public notes from openScale and the Xiaomi scale integrations (not yet checked on
 * this unit, so the unit and stable bits are the first thing to confirm on the phone):
 *   byte 0      control, bit 0 set = pounds
 *   byte 1      control, bit 1 impedance present, bit 5 reading stable, bit 6 catty, bit 7 weight removed
 *   bytes 2-8   date and time of the measurement
 *   bytes 9-10  impedance, little endian
 *   bytes 11-12 weight, little endian: kg x 200, or lb x 100, or catty x 100
 */
export const MI_SCALE_SERVICE = "0000181b-0000-1000-8000-00805f9b34fb";

export interface ScaleReading { kg: number; stable: boolean; removed: boolean; impedance: number | null; raw: string }

export function parseMiScale2(b: Uint8Array): ScaleReading | null {
  if (b.length < 13) return null;
  const c0 = b[0], c1 = b[1];
  const lb = (c0 & 1) !== 0, catty = (c1 & (1 << 6)) !== 0;
  const w = b[11] | (b[12] << 8);
  const kg = lb ? (w / 100) * 0.45359237 : catty ? (w / 100) * 0.5 : w / 200;
  const imp = b[9] | (b[10] << 8);
  return {
    kg: Math.round(kg * 100) / 100,
    stable: (c1 & (1 << 5)) !== 0,
    removed: (c1 & (1 << 7)) !== 0,
    impedance: (c1 & (1 << 1)) !== 0 && imp > 0 ? imp : null,
    raw: Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""),
  };
}

export type ScaleListener = (r: ScaleReading, at: number) => void;

/** Starts a scan and calls back for every advertisement the scale sends, repeats included, so the update rate can be measured. Returns a stop function. */
export async function startScaleScan(on: ScaleListener, onError: (m: string) => void): Promise<() => Promise<void>> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    await BleClient.requestLEScan({ services: [], allowDuplicates: true }, (res) => {
      const dv = res.serviceData?.[MI_SCALE_SERVICE] ?? res.serviceData?.["181b"] ?? res.serviceData?.["0x181b"];
      if (!dv) return;
      const r = parseMiScale2(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
      if (r) on(r, performance.now() / 1000);
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
    return async () => {};
  }
  return async () => { try { await BleClient.stopLEScan(); } catch { /* already stopped */ } };
}
