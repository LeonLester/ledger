import { useEffect, useRef, useState } from "react";
import { Camera, Radio, Square } from "lucide-react";
import { isNative } from "../native";
import { PLATE_M, toGray, Tracker } from "../lib/barpath";
import { startScaleScan, type ScaleReading } from "../lib/scale";
import { pairSamples, rate, resistanceByRom, type LiveSample } from "../lib/live";

const W = 480;
const f1 = (n: number | null | undefined) => (n == null ? "-" : (Math.round(n * 10) / 10).toString());

/** Two series on one chart: x is range of motion in cm, y is resistance in kg. */
function RomChart({ pts }: { pts: ReturnType<typeof resistanceByRom> }) {
  const Wd = 640, H = 220, pad = { l: 44, r: 10, t: 12, b: 28 };
  const ys = pts.flatMap((p) => [p.up, p.down]).filter((v): v is number => v != null);
  if (pts.length < 2 || !ys.length) return <p className="dim small">Record a set with the camera on to see resistance against range of motion.</p>;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const sp = hi - lo || 1; lo -= sp * 0.15; hi += sp * 0.15;
  const x0 = pts[0].cm, x1 = pts[pts.length - 1].cm;
  const X = (c: number) => pad.l + ((c - x0) / (x1 - x0 || 1)) * (Wd - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (k: "up" | "down") => pts.filter((p) => p[k] != null).map((p, i) => `${i ? "L" : "M"}${X(p.cm).toFixed(1)},${Y(p[k] as number).toFixed(1)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  return (
    <svg className="chart" viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label="Resistance in kilograms against height in centimetres">
      {ticks.map((t, i) => <g key={i}><line x1={pad.l} x2={Wd - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{t.toFixed(0)}</text></g>)}
      <path d={line("up")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d={line("down")} fill="none" stroke="var(--faint)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
      <text x={pad.l} y={H - 6}>{f1(x0)} cm (bottom)</text><text x={Wd - pad.r} y={H - 6} textAnchor="end">{f1(x1)} cm (top)</text>
    </svg>
  );
}

/** Live trace of the last seconds of scale readings. */
function Trace({ reads }: { reads: { t: number; kg: number }[] }) {
  const Wd = 640, H = 120;
  if (reads.length < 2) return null;
  const end = reads[reads.length - 1].t, start = end - 20;
  const v = reads.filter((r) => r.t >= start);
  if (v.length < 2) return null;
  const lo = Math.min(...v.map((r) => r.kg)), hi = Math.max(...v.map((r) => r.kg)), sp = hi - lo || 1;
  const d = v.map((r, i) => `${i ? "L" : "M"}${(((r.t - start) / 20) * Wd).toFixed(1)},${(H - 8 - ((r.kg - lo) / sp) * (H - 16)).toFixed(1)}`).join(" ");
  return <svg className="chart" viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label="Last 20 seconds of scale readings"><path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

/**
 * Live resistance. A Mi Body Composition Scale 2 under the user (or under the machine's foot plate) reports force in kg while the camera tracks the plate.
 * Stand on the scale with the load off, press "Zero", then load the machine: the scale then shows only what the machine adds.
 */
export function LiveResistanceTool() {
  const vid = useRef<HTMLVideoElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const reads = useRef<{ t: number; kg: number }[]>([]);
  const pos = useRef<{ t: number; y: number }[]>([]);
  const tare = useRef(0);
  const recording = useRef(false);
  const tracker = useRef<Tracker | null>(null);
  const mark = useRef<{ c: [number, number] | null; r: number }>({ c: null, r: 0 });
  const scaleY = useRef(0);
  const y0 = useRef<number | null>(null);

  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState<ScaleReading | null>(null);
  const [hz, setHz] = useState(0);
  const [err, setErr] = useState("");
  const [cam, setCam] = useState(false);
  const [step, setStep] = useState<"center" | "edge" | "ready">("center");
  const [rec, setRec] = useState(false);
  const [lag, setLag] = useState(0.3);
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const [, tick] = useState(0);
  const stopScan = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => () => { void stopScan.current?.(); stopCam(); }, []);
  const stopCam = () => { const s = vid.current?.srcObject as MediaStream | null; s?.getTracks().forEach((t) => t.stop()); };

  const toggleScan = async () => {
    if (scanning) { await stopScan.current?.(); stopScan.current = null; setScanning(false); return; }
    setErr("");
    if (!isNative) { setErr("Bluetooth scanning needs the Android app. The web version cannot read the scale's broadcasts."); return; }
    stopScan.current = await startScaleScan((r, at) => {
      setLast(r);
      const kg = r.kg - tare.current;
      reads.current.push({ t: at, kg });
      if (reads.current.length > 4000) reads.current.splice(0, 1000);
      setHz(rate(reads.current.map((x) => x.t)));
    }, setErr);
    setScanning(true);
  };

  const zero = () => { if (last) { tare.current = last.kg; reads.current = []; setErr(""); tick((n) => n + 1); } };

  const startCam = async () => {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      const v = vid.current!; v.srcObject = s; await v.play();
      const H = Math.round((v.videoHeight * W) / v.videoWidth);
      cv.current!.width = W; cv.current!.height = H;
      setCam(true); setStep("center"); mark.current = { c: null, r: 0 }; tracker.current = null;
      loop();
    } catch { setErr("Camera not available. Allow camera access for the app."); }
  };

  const loop = () => {
    const v = vid.current, c = cv.current;
    if (!v || !c || !v.srcObject) return;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(v, 0, 0, c.width, c.height);
    const m = mark.current;
    if (m.c) {
      g.strokeStyle = "#2f6bff"; g.lineWidth = 2; g.beginPath(); g.arc(m.c[0], m.c[1], Math.max(m.r, 4), 0, 7); g.stroke();
    }
    if (tracker.current) {
      const f = toGray(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      const s = tracker.current.step(f);
      if (s.quality > 0.4) {
        g.fillStyle = "#2f6bff"; g.beginPath(); g.arc(s.x, s.y, 5, 0, 7); g.fill();
        if (y0.current == null) y0.current = s.y;
        if (recording.current) pos.current.push({ t: performance.now() / 1000, y: -(s.y - y0.current) * scaleY.current * 100 });
      }
    }
    requestAnimationFrame(loop);
  };

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - b.left) * e.currentTarget.width) / b.width, y = ((e.clientY - b.top) * e.currentTarget.height) / b.height;
    if (step === "center") { mark.current = { c: [x, y], r: 0 }; setStep("edge"); }
    else if (step === "edge" && mark.current.c) {
      const r = Math.max(6, Math.hypot(x - mark.current.c[0], y - mark.current.c[1]));
      mark.current.r = r; scaleY.current = PLATE_M / 2 / r;
      const g = cv.current!.getContext("2d", { willReadFrequently: true })!;
      tracker.current = new Tracker(toGray(g.getImageData(0, 0, cv.current!.width, cv.current!.height).data, cv.current!.width, cv.current!.height), mark.current.c[0], mark.current.c[1], r);
      y0.current = null; setStep("ready");
    }
  };

  const start = () => { pos.current = []; y0.current = tracker.current ? tracker.current.y : null; recording.current = true; setRec(true); setSamples([]); };
  const stop = () => {
    recording.current = false; setRec(false);
    // heights are relative to the lowest point reached, so the chart starts at zero at the bottom of the rep
    const p = pos.current, lo = p.length ? Math.min(...p.map((q) => q.y)) : 0;
    const base = p.map((q) => ({ t: q.t, y: q.y - lo }));
    setSamples(base.length ? pairSamples(base, reads.current, lag) : []);
  };
  useEffect(() => { if (!rec && pos.current.length) { const lo = Math.min(...pos.current.map((q) => q.y)); setSamples(pairSamples(pos.current.map((q) => ({ t: q.t, y: q.y - lo })), reads.current, lag)); } /* eslint-disable-next-line */ }, [lag]);

  const curve = resistanceByRom(samples);
  const shown = last ? last.kg - tare.current : null;
  const ups = curve.map((p) => p.up).filter((v): v is number => v != null);
  const stats = ups.length ? { bottom: ups[0], top: ups[ups.length - 1], peak: Math.max(...ups), low: Math.min(...ups) } : null;

  return (
    <div className="stack">
      <p className="dim small">Put the scale where the load passes through it: under your feet on the platform, or under a foot plate. Stand on it with the machine unloaded, press Zero, then do the set. The scale then shows only what the machine adds, and the camera pairs each reading with the height of the plate.</p>
      <div className="row wrap">
        <button className={`btn ${scanning ? "" : "primary"}`} onClick={toggleScan}><Radio size={18} /> {scanning ? "Stop scale" : "Connect scale"}</button>
        <button className="btn" onClick={zero} disabled={!last}>Zero</button>
        {!cam && <button className="btn" onClick={startCam}><Camera size={18} /> Camera</button>}
      </div>
      <div className="panel" style={{ padding: 14 }} aria-live="off">
        <div className="faint xs">Scale reading above zero</div>
        <div className="num" style={{ fontSize: "2.4rem", fontWeight: 700 }}>{shown == null ? "-" : `${f1(shown)} kg`}</div>
        <div className="faint xs">{last ? `${last.stable ? "Stable" : "Moving"}, ${hz.toFixed(1)} readings per second, raw ${f1(last.kg)} kg, zero at ${f1(tare.current)} kg` : scanning ? "Step on the scale to wake it." : "Not connected."}</div>
        <Trace reads={reads.current} />
      </div>
      <video ref={vid} muted playsInline style={{ display: "none" }} />
      {cam && (
        <>
          <div className="canvas-wrap"><canvas ref={cv} onPointerDown={tap} aria-label="Camera. Tap the plate centre, then its edge." /></div>
          <p className="small" role="status">{step === "center" ? "Tap the centre of a 45 cm plate." : step === "edge" ? "Tap the outer edge of the plate." : rec ? "Recording. Do your reps." : "Ready. Press Record, do the set, then Stop."}</p>
          <div className="row wrap">
            <button className="btn primary" disabled={step !== "ready" || rec} onClick={start}>Record</button>
            <button className="btn" disabled={!rec} onClick={stop}><Square size={16} /> Stop</button>
            <button className="btn ghost" onClick={() => { setStep("center"); tracker.current = null; mark.current = { c: null, r: 0 }; }}>Re-mark plate</button>
          </div>
        </>
      )}
      {err && <p className="small" role="alert" style={{ color: "var(--bad, #e5483c)" }}>{err}</p>}
      {samples.length > 0 && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Resistance against range of motion</h3>
          <RomChart pts={curve} />
          <p className="faint xs">Solid line is moving up, dashed is moving down. Height is measured from the lowest point of the set.</p>
          {stats && <p className="small">Bottom {f1(stats.bottom)} kg, top {f1(stats.top)} kg, hardest {f1(stats.peak)} kg, easiest {f1(stats.low)} kg.</p>}
          <label className="field"><span>Scale delay {lag.toFixed(1)} s</span><input type="range" min={0} max={1.5} step={0.1} value={lag} onChange={(e) => setLag(Number(e.target.value))} /><span className="faint xs" style={{ fontWeight: 400 }}>The scale smooths its reading, so it trails the movement. Slide until the up and down lines meet.</span></label>
        </div>
      )}
    </div>
  );
}
