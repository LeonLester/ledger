import { useEffect, useRef, useState } from "react";
import { Camera, Square } from "lucide-react";
import { JOINTS, LM, bestSide, jointAngle, repsFromAngle, trunkLean, type JointId, type Side } from "../lib/joints";
import { BONES, loadPose, type PoseModel } from "../lib/pose";
import { LineChart, Seg } from "./common";

const W = 480;
const TRAIL = 120;
const f0 = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toString());

/**
 * Live pose. MediaPipe finds the body in each camera frame on the phone, nothing is uploaded. The joint angles come from the 3D world
 * landmarks, so a camera that is not exactly side on still reads sensibly. The line behind the wrists is a bar path for lifts where
 * the hands stay on the bar. Hold the phone still and keep the whole body in view.
 */
export function LivePoseTool() {
  const vid = useRef<HTMLVideoElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const model = useRef<PoseModel | null>(null);
  const run = useRef(false);
  const trail = useRef<[number, number][]>([]);
  const rec = useRef<{ t: number; a: Partial<Record<JointId, number>>; lean: number | null }[]>([]);
  const recording = useRef(false);
  const t0 = useRef(0);
  const sel = useRef<JointId[]>(["knee", "hip"]);
  const sideRef = useRef<Side | "auto">("auto");

  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [joints, setJoints] = useState<JointId[]>(["knee", "hip"]);
  const [side, setSide] = useState<Side | "auto">("auto");
  const [live, setLive] = useState<{ side: Side; a: Partial<Record<JointId, number>>; lean: number | null; fps: number } | null>(null);
  const [rec_, setRec] = useState(false);
  const [done, setDone] = useState<typeof rec.current | null>(null);
  const [chartJoint, setChartJoint] = useState<JointId>("knee");

  useEffect(() => { sel.current = joints; if (!joints.includes(chartJoint) && joints[0]) setChartJoint(joints[0]); /* eslint-disable-next-line */ }, [joints]);
  useEffect(() => { sideRef.current = side; }, [side]);
  useEffect(() => () => stop(), []);

  const stop = () => {
    run.current = false;
    const s = vid.current?.srcObject as MediaStream | null; s?.getTracks().forEach((t) => t.stop());
    model.current?.close(); model.current = null;
    setOn(false);
  };

  const start = async () => {
    setErr(""); setBusy(true); setDone(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      const v = vid.current!; v.srcObject = s; await v.play();
      cv.current!.width = W; cv.current!.height = Math.round((v.videoHeight * W) / v.videoWidth);
      model.current = await loadPose();
      trail.current = []; run.current = true; setOn(true);
      loop();
    } catch (e) {
      setErr(e instanceof DOMException && e.name === "NotAllowedError" ? "Camera not available. Allow camera access for the app." : "Could not start pose tracking on this device.");
      stop();
    } finally { setBusy(false); }
  };

  let frames = 0, fpsAt = performance.now(), fps = 0;
  const loop = () => {
    const v = vid.current, c = cv.current, m = model.current;
    if (!run.current || !v || !c || !m) return;
    const g = c.getContext("2d")!;
    g.drawImage(v, 0, 0, c.width, c.height);
    const now = performance.now();
    const r = v.readyState >= 2 ? m.detect(v, now) : null;
    if (r) {
      const sd = sideRef.current === "auto" ? bestSide(r.lm) : sideRef.current;
      const X = (p: { x: number }) => p.x * c.width, Y = (p: { y: number }) => p.y * c.height;
      g.lineWidth = 3; g.lineCap = "round"; g.strokeStyle = "rgba(255,255,255,.55)";
      for (const [a, b] of BONES) { const pa = r.lm[a], pb = r.lm[b]; if ((pa.v ?? 1) > 0.4 && (pb.v ?? 1) > 0.4) { g.beginPath(); g.moveTo(X(pa), Y(pa)); g.lineTo(X(pb), Y(pb)); g.stroke(); } }
      const angles: Partial<Record<JointId, number>> = {};
      g.font = "600 14px system-ui, sans-serif"; g.textBaseline = "middle";
      for (const id of sel.current) {
        const a = jointAngle(r.world, id, sd);
        if (a == null) continue;
        angles[id] = a;
        const j = JOINTS.find((x) => x.id === id)!;
        const p = r.lm[LM[j.b] + (sd === "R" ? 1 : 0)];
        g.fillStyle = "#2f6bff"; g.beginPath(); g.arc(X(p), Y(p), 6, 0, 7); g.fill();
        g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 4; g.strokeText(`${Math.round(a)}°`, X(p) + 10, Y(p)); g.fillText(`${Math.round(a)}°`, X(p) + 10, Y(p));
      }
      // wrists: bar path trail
      const wl = r.lm[15], wr = r.lm[16];
      if ((wl.v ?? 1) > 0.4 && (wr.v ?? 1) > 0.4) { trail.current.push([(X(wl) + X(wr)) / 2, (Y(wl) + Y(wr)) / 2]); if (trail.current.length > TRAIL) trail.current.shift(); }
      g.strokeStyle = "#35b36b"; g.lineWidth = 3; g.beginPath();
      trail.current.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      const lean = trunkLean(r.lm, sd, c.width / c.height);
      if (recording.current) rec.current.push({ t: (now - t0.current) / 1000, a: angles, lean });
      frames++;
      if (now - fpsAt > 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; setLive({ side: sd, a: angles, lean, fps }); }
    }
    requestAnimationFrame(loop);
  };

  const toggleJoint = (id: JointId) => setJoints((j) => (j.includes(id) ? j.filter((x) => x !== id) : [...j, id]));
  const startRec = () => { rec.current = []; t0.current = performance.now(); recording.current = true; setRec(true); setDone(null); };
  const stopRec = () => { recording.current = false; setRec(false); setDone(rec.current.slice()); };

  const series = done ? done.filter((f) => f.a[chartJoint] != null).map((f) => ({ t: f.t, a: f.a[chartJoint] as number })) : [];
  const reps = repsFromAngle(series);

  return (
    <div className="stack">
      <p className="dim small">Film yourself from the side with your whole body in view and the phone still. The angles and the green wrist line update live, and a recorded set gives the angle through each rep. Tracking runs on the phone.</p>
      <div className="field"><span>Joints to show</span>
        <div className="row wrap" style={{ gap: 6 }}>{JOINTS.map((j) => { const onj = joints.includes(j.id); return <button key={j.id} className={`pill ${onj ? "acc" : ""}`} aria-pressed={onj} style={{ minHeight: 36, fontSize: ".85rem" }} onClick={() => toggleJoint(j.id)}>{j.label}</button>; })}</div></div>
      <div className="field"><span>Side</span><Seg full value={side} onChange={setSide} options={[{ v: "auto", label: "Auto" }, { v: "L", label: "Left" }, { v: "R", label: "Right" }]} label="Body side" /></div>
      <div className="row wrap">
        {!on && <button className="btn primary" disabled={busy} onClick={start}><Camera size={18} /> {busy ? "Loading" : "Start camera"}</button>}
        {on && !rec_ && <button className="btn primary" onClick={startRec}>Record</button>}
        {on && rec_ && <button className="btn" onClick={stopRec}><Square size={16} /> Stop</button>}
        {on && <button className="btn ghost" onClick={stop}>Close camera</button>}
      </div>
      <video ref={vid} muted playsInline style={{ display: "none" }} />
      <div className="canvas-wrap" style={{ display: on ? undefined : "none" }}><canvas ref={cv} aria-label="Camera with body tracking" /></div>
      {on && live && <p className="small" role="status">{live.side === "L" ? "Left" : "Right"} side{live.lean != null ? `, torso ${f0(live.lean)}° from vertical` : ""}, {live.fps.toFixed(0)} frames per second{rec_ ? ", recording" : ""}.</p>}
      {on && !live && <p className="small" role="status">Step back until your whole body is in view.</p>}
      {err && <p className="small" role="alert" style={{ color: "var(--bad, #e5483c)" }}>{err}</p>}
      {done && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Angle through the set</h3>
          {joints.length > 1 && <Seg full value={chartJoint} onChange={setChartJoint} options={joints.map((id) => ({ v: id, label: JOINTS.find((j) => j.id === id)!.label }))} label="Joint" />}
          {series.length < 2 ? <p className="dim small">No frames with this joint in view.</p> : <LineChart points={series.filter((_, i) => i % Math.max(1, Math.ceil(series.length / 120)) === 0).map((s) => ({ x: s.t, y: s.a, label: `${s.t.toFixed(0)} s` }))} unit="degrees" />}
          {reps.length > 0 ? (
            <table className="t"><thead><tr><th>Rep</th><th>Smallest</th><th>Largest</th><th>Range</th></tr></thead><tbody>
              {reps.map((r, k) => <tr key={k}><td>{k + 1}</td><td className="num">{f0(r.min)}°</td><td className="num">{f0(r.max)}°</td><td className="num">{f0(r.range)}°</td></tr>)}
            </tbody></table>
          ) : <p className="dim small">No full swings of 25 degrees or more found.</p>}
        </div>
      )}
    </div>
  );
}
