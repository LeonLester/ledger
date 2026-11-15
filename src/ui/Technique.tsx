import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { useStore } from "../store";
import { analyze, PLATE_M, toGray, Tracker, type Analysis, type Pt } from "../lib/barpath";
import type { BarPathRec } from "../types";
import { Seg, Sheet } from "./common";

const TAGS = ["Depth", "Bar drift", "Hips rise", "Lockout", "Pause", "Grip", "Brace", "Setup"];
const FPS = 30;

/** Small plot of a stored path. x is centimetres right, y centimetres up. */
export function PathPlot({ pts, w = 120, h = 170 }: { pts: [number, number][]; w?: number; h?: number }) {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...ys) - Math.min(...ys), (Math.max(...xs) - Math.min(...xs)) * 1.5, 10);
  const sc = (h - 16) / span, cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const P = (p: [number, number]) => `${(w / 2 + (p[0] - cx) * sc).toFixed(1)},${(h / 2 - (p[1] - cy) * sc).toFixed(1)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Bar path">
      <line x1={w / 2 + (pts[0][0] - cx) * sc} x2={w / 2 + (pts[0][0] - cx) * sc} y1={4} y2={h - 4} stroke="var(--line)" strokeDasharray="3 4" />
      <polyline points={pts.map(P).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={P(pts[pts.length - 1]).split(",")[0]} cy={P(pts[pts.length - 1]).split(",")[1]} r="4" fill="var(--accent)" />
    </svg>
  );
}

function BarPathTool({ id, i, nSets, onSaved }: { id: string; i: number; nSets: number; onSaved: () => void }) {
  const { updateEx, say } = useStore();
  const vid = useRef<HTMLVideoElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, dur: 0 });
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [step, setStep] = useState<"center" | "edge" | "ready">("center");
  const [c, setC] = useState<[number, number] | null>(null);
  const [r, setR] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [res, setRes] = useState<{ a: Analysis; track: Pt[] } | null>(null);
  const [setNo, setSetNo] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const seek = (t: number) => new Promise<void>((ok) => { const v = vid.current!; const h = () => { v.removeEventListener("seeked", h); ok(); }; v.addEventListener("seeked", h); v.currentTime = Math.min(Math.max(0, t), v.duration || t); });
  const draw = () => { const g = cv.current!.getContext("2d", { willReadFrequently: true })!; g.drawImage(vid.current!, 0, 0, dim.w, dim.h); return g; };
  const showFrame = async (t: number) => { await seek(t); draw(); };

  const onFile = (f: File | undefined) => { if (!f) return; setRes(null); setC(null); setStep("center"); setMsg(""); setSrc(URL.createObjectURL(f)); };
  const onMeta = async () => {
    const v = vid.current!; const W = Math.min(480, v.videoWidth || 480); const H = Math.round(((v.videoHeight || 270) * W) / (v.videoWidth || 480));
    setDim({ w: W, h: H, dur: v.duration }); setRange([0, Math.min(v.duration, 40)]);
  };
  useEffect(() => { if (dim.w && src) void showFrame(range[0]); /* eslint-disable-next-line */ }, [dim.w, src]);

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy != null || res) return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - b.left) * dim.w) / b.width, y = ((e.clientY - b.top) * dim.h) / b.height;
    if (step === "center") { setC([x, y]); setStep("edge"); const g = draw(); mark(g, x, y, 0); }
    else if (step === "edge" && c) { const rr = Math.max(6, Math.hypot(x - c[0], y - c[1])); setR(rr); setStep("ready"); const g = draw(); mark(g, c[0], c[1], rr); }
  };
  const mark = (g: CanvasRenderingContext2D, x: number, y: number, rr: number) => {
    g.strokeStyle = "#2f6bff"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(rr, 3), 0, 7); g.stroke();
    g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke();
  };
  const reset = async () => { setC(null); setR(0); setStep("center"); setRes(null); await showFrame(range[0]); };

  const run = async () => {
    if (!c) return;
    setMsg(""); setRes(null);
    const t0 = range[0], t1 = range[1], n = Math.floor((t1 - t0) * FPS);
    if (n < 10) { setMsg("Pick at least a third of a second."); return; }
    await showFrame(t0);
    let g = draw(); let f = toGray(g.getImageData(0, 0, dim.w, dim.h).data, dim.w, dim.h);
    const tr = new Tracker(f, c[0], c[1], r);
    const track: Pt[] = [{ t: 0, x: c[0], y: c[1] }]; let lost = 0;
    for (let k = 1; k <= n; k++) {
      await seek(t0 + k / FPS); g = draw(); f = toGray(g.getImageData(0, 0, dim.w, dim.h).data, dim.w, dim.h);
      const s = tr.step(f); track.push({ t: k / FPS, x: s.x, y: s.y });
      lost = s.quality < 0.4 ? lost + 1 : 0;
      if (lost > 10) { track.splice(track.length - 10); setMsg("Lost the plate partway. The path up to that point is kept."); break; }
      if (k % 6 === 0) { setBusy(Math.round((k / n) * 100)); await new Promise((ok) => setTimeout(ok)); }
    }
    setBusy(null);
    const a = analyze(track, PLATE_M / 2 / r);
    await showFrame(t0);
    const g2 = draw(); g2.lineWidth = 3; g2.lineCap = "round";
    const vmax = Math.max(0.3, ...a.series.map((s) => Math.abs(s.v)));
    for (let k = 1; k < track.length; k++) {
      const q = Math.min(1, Math.abs(a.series[k]?.v ?? 0) / vmax);
      g2.strokeStyle = q > 0.66 ? "#35b36b" : q > 0.33 ? "#f2c230" : "#e5483c";
      g2.beginPath(); g2.moveTo(track[k - 1].x, track[k - 1].y); g2.lineTo(track[k].x, track[k].y); g2.stroke();
    }
    setRes({ a, track });
    if (a.reps.length === 0) setMsg("No full reps found. Check the plate stayed marked and the clip covers the whole set.");
  };

  const save = () => {
    if (!res) return;
    const rec: BarPathRec = { set: setNo, at: Date.now(), fps: FPS, pts: res.a.pts, reps: res.a.reps };
    updateEx(id, i, (e) => ({ ...e, paths: [...(e.paths ?? []).filter((p) => p.set !== setNo), rec] }));
    say("Bar path saved"); onSaved();
  };

  return (
    <div className="stack">
      <p className="dim small">Film from the side with the whole plate in view and the camera still. Mark the plate centre and its edge: the 45 cm plate sets the scale.</p>
      <div className="row wrap">
        <label className="btn"><Video size={18} /> Choose or record video<input type="file" accept="video/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label>
      </div>
      {src && <video ref={vid} src={src} muted playsInline preload="auto" onLoadedMetadata={onMeta} style={{ display: "none" }} />}
      {src && dim.w > 0 && (
        <>
          <div className="canvas-wrap"><canvas ref={cv} width={dim.w} height={dim.h} onPointerDown={tap} aria-label="Video frame. Tap the plate centre, then its edge." /></div>
          <p className="small" role="status">{busy != null ? `Tracking ${busy}%` : res ? "Done" : step === "center" ? "Tap the centre of the plate." : step === "edge" ? "Tap the outer edge of the plate." : "Ready. Trim the clip to the set, then track."}</p>
          <div className="row wrap">
            <label className="field" style={{ flex: "1 1 140px" }}><span>Start {range[0].toFixed(1)} s</span><input type="range" min={0} max={dim.dur} step={0.1} value={range[0]} disabled={busy != null} onChange={(e) => { const v = Math.min(Number(e.target.value), range[1] - 0.5); setRange([v, range[1]]); setC(null); setStep("center"); setRes(null); void showFrame(v); }} /></label>
            <label className="field" style={{ flex: "1 1 140px" }}><span>End {range[1].toFixed(1)} s</span><input type="range" min={0} max={dim.dur} step={0.1} value={range[1]} disabled={busy != null} onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + 0.5)])} /></label>
          </div>
          <div className="row wrap"><button className="btn primary" disabled={step !== "ready" || busy != null} onClick={run}>Track bar path</button><button className="btn ghost" disabled={busy != null} onClick={reset}>Re-mark plate</button></div>
        </>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
      {res && res.a.reps.length > 0 && (
        <div className="stack">
          <table className="t"><thead><tr><th>Rep</th><th>ROM</th><th>Avg up</th><th>Peak</th><th>Drift</th></tr></thead><tbody>
            {res.a.reps.map((m, k) => <tr key={k}><td>{k + 1}</td><td className="num">{(m.rom * 100).toFixed(0)} cm</td><td className="num">{m.mcv.toFixed(2)} m/s</td><td className="num">{m.pv.toFixed(2)} m/s</td><td className="num">{m.dev.toFixed(1)} cm</td></tr>)}
          </tbody></table>
          <p className="small">{res.a.velLoss != null ? `Velocity loss first to last rep: ${res.a.velLoss}%. ` : ""}Mean horizontal drift {res.a.meanDev} cm. Line colour: green fast, yellow medium, red slow.</p>
          <div className="field"><span>Save to set</span><Seg value={setNo} onChange={setSetNo} options={Array.from({ length: nSets }, (_, k) => ({ v: k, label: String(k + 1) }))} label="Set" /></div>
          <button className="btn primary" onClick={save}>Save bar path</button>
        </div>
      )}
    </div>
  );
}

export function TechSheet({ id, i, onClose }: { id: string; i: number; onClose: () => void }) {
  const { sessions, updateEx } = useStore();
  const e = sessions.find((s) => s.id === id)!.exercises[i];
  const [tab, setTab] = useState<"form" | "path">("form");
  return (
    <Sheet title={`Technique: ${e.exercise}`} onClose={onClose}>
      <Seg full value={tab} onChange={setTab} options={[{ v: "form", label: "Form" }, { v: "path", label: "Bar path" }]} label="Section" />
      {tab === "form" ? (
        <div className="stack">
          <div className="field"><span>Rate your technique this session</span>
            <Seg full value={e.tech ?? 0} onChange={(v) => updateEx(id, i, (x) => ({ ...x, tech: v }))} options={[1, 2, 3, 4, 5].map((v) => ({ v, label: String(v) }))} label="Technique rating" /></div>
          <div className="field"><span>What to work on</span>
            <div className="row wrap" style={{ gap: 6 }}>{TAGS.map((t) => { const on = e.form?.includes(t); return <button key={t} className={`pill ${on ? "acc" : ""}`} aria-pressed={!!on} style={{ minHeight: 36, fontSize: ".85rem" }} onClick={() => updateEx(id, i, (x) => ({ ...x, form: on ? x.form!.filter((q) => q !== t) : [...(x.form ?? []), t] }))}>{t}</button>; })}</div></div>
          {(e.paths ?? []).length > 0 && <div className="field"><span>Saved bar paths</span><div className="row wrap" style={{ gap: 14 }}>{e.paths!.map((p) => <div key={p.set}><PathPlot pts={p.pts} w={110} h={150} /><div className="small">Set {p.set + 1}, {p.reps.length} reps</div></div>)}</div></div>}
        </div>
      ) : <BarPathTool id={id} i={i} nSets={e.sets.length} onSaved={() => setTab("form")} />}
    </Sheet>
  );
}
