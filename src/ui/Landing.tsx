import { useMemo, useState } from "react";
import { buildSplit, TEMPLATES } from "../data/templates";
import { curve, LEVER_PRESETS, summarize } from "../lib/lever";
import { fmtW } from "../lib/math";
import { PROG_INFO, suggestTarget } from "../lib/progression";
import type { ExLog, ExerciseDef, PlanItem, ProgKind } from "../types";
import { APK_URL, isNative } from "../native";
import { LineChart, Seg } from "./common";

type Go = (mode: "login" | "signup") => void;

const num = (t: string) => { const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const f1 = (n: number) => String(Math.round(n * 10) / 10);

/* ---------- 1. the logger: weight and true resistance calculate each other, PR check on tick ---------- */

const RATIO = 0.71, PREV = { w: 110, reps: 8 };
const e1 = (w: number, r: number) => w * (1 + r / 30);

function LoggerDemo() {
  const [rows, setRows] = useState([{ kg: "100", tr: f1(100 * RATIO), reps: "10", done: false }, { kg: "100", tr: f1(100 * RATIO), reps: "9", done: false }, { kg: "100", tr: f1(100 * RATIO), reps: "8", done: false }]);
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const prs = rows.map((r) => {
    const w = num(r.kg), n = num(r.reps);
    if (!r.done || !w || !n) return null;
    if (w > PREV.w) return { tag: "Weight PR", text: `Heaviest yet: ${fmtW(w)} kg x ${n} (was ${PREV.w})` };
    if (w >= PREV.w && n > PREV.reps) return { tag: "Rep PR", text: `${n} reps at ${fmtW(w)} kg, previous best ${PREV.reps}` };
    const best = e1(PREV.w, PREV.reps);
    if (e1(w, n) > best + 0.4) return { tag: "e1RM PR", text: `Predicts a ${f1(e1(w, n))} kg 1RM, up ${f1(e1(w, n) - best)}` };
    return null;
  });
  return (
    <div className="lp-card" aria-label="Live logger demo">
      <div className="lp-card-head">
        <div><div className="lp-ex"><span className="lp-badge">A1</span> Leg Press</div><div className="faint xs">45 degree sled, last week {PREV.w} x {PREV.reps}</div></div>
        <span className="lp-tag" title="Resistance on the legs per kg on the sled">true = kg x {RATIO}</span>
      </div>
      <div className="lp-set lp-head faint xs"><span /><span>kg</span><span>True</span><span>Reps</span><span /></div>
      {rows.map((r, i) => (
        <div key={i}>
          <div className="lp-set">
            <span className="faint">{i + 1}</span>
            <input className="cell" inputMode="decimal" aria-label={`Set ${i + 1} weight on the sled`} value={r.kg} onChange={(e) => { const v = e.target.value; if (/^\d*[.,]?\d*$/.test(v)) patch(i, { kg: v, tr: v ? f1(num(v) * RATIO) : "" }); }} />
            <input className="cell lp-true" inputMode="decimal" aria-label={`Set ${i + 1} true resistance`} value={r.tr} onChange={(e) => { const v = e.target.value; if (/^\d*[.,]?\d*$/.test(v)) patch(i, { tr: v, kg: v ? f1(num(v) / RATIO) : "" }); }} />
            <input className="cell" inputMode="numeric" aria-label={`Set ${i + 1} reps`} value={r.reps} onChange={(e) => { const v = e.target.value; if (/^\d{0,2}$/.test(v)) patch(i, { reps: v }); }} />
            <button className={`lp-tick ${r.done ? "on" : ""}`} aria-pressed={r.done} aria-label={`Complete set ${i + 1}`} onClick={() => patch(i, { done: !r.done })}>{r.done ? "✓" : ""}</button>
          </div>
          {prs[i] && <p className="lp-pr" role="status"><b>{prs[i]!.tag}</b> {prs[i]!.text}</p>}
        </div>
      ))}
      <p className="faint xs" style={{ margin: "10px 0 0" }}>Change the weight or the true resistance and the other follows. Raise the weight, then tick a set to run the PR check.</p>
    </div>
  );
}

/* ---------- 2. progression: the real engine, editable last session ---------- */

type Preset = { kind: ProgKind; lo: number; hi: number; last: number[]; hist?: number; prog?: ExerciseDef["prog"] };
const PRESETS: Preset[] = [
  { kind: "double", lo: 8, hi: 12, last: [12, 12, 11] },
  { kind: "dynamic", lo: 8, hi: 12, last: [12, 10, 9] },
  { kind: "triple", lo: 8, hi: 12, last: [12, 12, 12], prog: { kind: "triple", maxSets: 5 } },
  { kind: "linear", lo: 5, hi: 5, last: [5, 5, 5] },
  { kind: "step", lo: 8, hi: 12, last: [10, 9, 9], hist: 2, prog: { kind: "step", hold: 2, step: 5 } },
  { kind: "amrap", lo: 5, hi: 8, last: [5, 5, 9] },
  { kind: "pct", lo: 5, hi: 5, last: [5, 5, 5], prog: { kind: "pct", pct: 75, ref: 140 } },
];
const SHORT: Record<ProgKind, string> = { double: "Double", dynamic: "Dynamic double", triple: "Triple", linear: "Linear", step: "Step loading", amrap: "Last set AMRAP", pct: "Fixed percentage" };

function ProgDemo() {
  const [kind, setKind] = useState<ProgKind>("double");
  const [reps, setReps] = useState<Record<string, number[]>>({});
  const p = PRESETS.find((x) => x.kind === kind)!;
  const last = reps[kind] ?? p.last;
  const out = useMemo(() => {
    const item: PlanItem = { letter: "A", exercise: "Row", sets: 3, repLo: p.lo, repHi: p.hi, rir: 2 };
    const def: ExerciseDef = { name: "Row", muscle: "Back", unit: "kg", increment: 2.5, prog: p.prog ?? { kind } };
    const log: ExLog = { letter: "A", exercise: "Row", unit: "kg", rir: 2, note: null, sets: last.map((r) => ({ weight: 100, reps: r, myo: [], done: true })) };
    const hist = p.hist ? Array.from({ length: p.hist }, () => log) : [log];
    return suggestTarget(item, kind === "pct" ? null : log, def, hist);
  }, [kind, last, p]);
  const n = out.sets ?? out.perSet?.length ?? last.length;
  const next = Array.from({ length: n }, (_, j) => ({ w: out.perSet?.[j]?.weight ?? out.weight, r: out.perSet?.[j]?.reps ?? out.reps, amrap: !!out.amrapLast && j === n - 1 }));
  return (
    <div className="lp-card">
      <div className="lp-chips" role="group" aria-label="Progression scheme">
        {PRESETS.map((x) => <button key={x.kind} aria-pressed={kind === x.kind} onClick={() => setKind(x.kind)}>{SHORT[x.kind]}</button>)}
      </div>
      <p className="dim small" style={{ margin: "12px 0 14px" }}>{PROG_INFO[kind].text}</p>
      <div className="lp-two">
        <div>
          <div className="lp-label">Last session at 100 kg</div>
          {kind === "pct" ? <p className="faint small">No history needed. Reference 1RM 140 kg at 75%.</p> : last.map((r, i) => (
            <div className="lp-step" key={i}>
              <span className="faint">{i + 1}</span>
              <button className="lp-pm" aria-label={`Set ${i + 1} fewer reps`} onClick={() => setReps({ ...reps, [kind]: last.map((x, j) => (j === i ? Math.max(1, x - 1) : x)) })}>-</button>
              <span className="num lp-reps">{r}</span>
              <button className="lp-pm" aria-label={`Set ${i + 1} more reps`} onClick={() => setReps({ ...reps, [kind]: last.map((x, j) => (j === i ? Math.min(30, x + 1) : x)) })}>+</button>
              <span className="faint xs">reps</span>
            </div>
          ))}
          <p className="faint xs" style={{ margin: "8px 0 0" }}>Plan: 3 sets of {p.lo === p.hi ? p.lo : `${p.lo} to ${p.hi}`}. Tap the buttons to change what you did.</p>
        </div>
        <div>
          <div className="lp-label">Next session</div>
          {next.map((s, i) => (
            <div className="lp-next" key={i}><span className="faint">{i + 1}</span><b className="num">{s.w == null ? "-" : fmtW(s.w)} kg</b><span className="num">x {s.amrap ? `${s.r}+` : s.r}</span>{s.amrap && <span className="lp-tag">AMRAP</span>}</div>
          ))}
          <p className="small" style={{ margin: "8px 0 0" }}>{out.note}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- 3. machines: lever geometry, resistance through the rep ---------- */

function MachineDemo() {
  const [id, setId] = useState("landmine");
  const [load, setLoad] = useState(60);
  const spec = LEVER_PRESETS.find((x) => x.id === id)!;
  const s = summarize(spec.spec, load);
  const pts = curve(spec.spec, load).filter((q) => q.kg != null).map((q, i) => ({ x: i, y: q.kg as number, label: `${Math.round(q.deg)}°` }));
  const verdict = s.change == null ? "" : Math.abs(s.change) < 3 ? "about the same all the way" : s.change > 0 ? `${Math.round(s.change)}% harder at the top` : `${Math.round(-s.change)}% easier at the top`;
  return (
    <div className="lp-card">
      <Seg full value={id} onChange={setId} label="Machine" options={LEVER_PRESETS.filter((x) => x.id !== "lever").map((x) => ({ v: x.id, label: x.id === "landmine" ? "Landmine row" : "Pendulum squat" }))} />
      <label className="lp-range"><span>Plates on the arm</span><b className="num">{load} kg</b><input type="range" min={20} max={200} step={2.5} value={load} onChange={(e) => setLoad(Number(e.target.value))} aria-label="Plates on the arm in kg" /></label>
      <div className="lp-three">
        <div><div className="faint xs">Bottom</div><div className="lp-big num">{f1(s.bottom ?? 0)} kg</div></div>
        <div><div className="faint xs">Top</div><div className="lp-big num">{f1(s.top ?? 0)} kg</div></div>
        <div><div className="faint xs">Average</div><div className="lp-big num">{f1(s.mean ?? 0)} kg</div></div>
      </div>
      <p className="small" style={{ margin: "4px 0 8px" }}><b>{load} kg of plates feels {verdict}.</b></p>
      <LineChart points={pts} unit="kg" height={150} />
      <p className="faint xs" style={{ margin: "6px 0 0" }}>Example geometry. In the app you enter your own lever arms or the two distances, and the log shows true resistance next to the weight.</p>
    </div>
  );
}

/* ---------- 4. splits: the real template builder ---------- */

function SplitDemo() {
  const [id, setId] = useState("pplul");
  const [freq, setFreq] = useState(4);
  const [upper, setUpper] = useState(3);
  const [lower, setLower] = useState(2);
  const t = TEMPLATES.find((x) => x.id === id)!;
  const rows = useMemo(() => buildSplit(t, { freq, upper, lower }, "landing").split, [t, freq, upper, lower]);
  return (
    <div className="lp-card">
      <label className="field"><span>Template</span><select className="input" value={id} onChange={(e) => setId(e.target.value)} aria-label="Split template">{TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <p className="dim small" style={{ margin: "8px 0 12px" }}>{t.blurb}</p>
      {t.opts === "freq" && <Seg full value={freq} onChange={setFreq} label="Sessions per week" options={[2, 3, 4, 5, 6].map((v) => ({ v, label: `${v} a week` }))} />}
      {t.opts === "ul" && (
        <div className="row" style={{ gap: 14 }}>
          <label className="field" style={{ flex: 1 }}><span>Upper sessions</span><Seg full value={upper} onChange={setUpper} label="Upper sessions" options={[1, 2, 3, 4].map((v) => ({ v, label: String(v) }))} /></label>
          <label className="field" style={{ flex: 1 }}><span>Lower sessions</span><Seg full value={lower} onChange={setLower} label="Lower sessions" options={[1, 2, 3, 4].map((v) => ({ v, label: String(v) }))} /></label>
        </div>
      )}
      <div className="lp-week" role="table" aria-label="Week layout">
        {rows.map((r) => (
          <div key={r.day} className={`lp-day ${r.session === "Rest" ? "rest" : ""}`} role="row"><span className="faint">{r.day.slice(0, 3)}</span><b>{r.session}</b><span className="faint xs">{r.emphasis}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

const EVERYTHING: [string, string][] = [
  ["Your own sheet", "Edit the plan, rotate two week layouts, build custom programs with repeated sessions."],
  ["Supersets of any size", "A1 and A2 share a letter. The rest timer waits for the last set of the group."],
  ["RIR or RPE", "Switch at any time. Plans move RIR from week to week by RIR type."],
  ["Myo-reps", "Write 8+3+3, set how many hard sets each mini-set counts for in your volume."],
  ["Powerlifting programs", "StrongLifts 5x5, Starting Strength, GZCLP, 5/3/1 BBB, Texas Method and a six week RPE peak, from your training maxes."],
  ["Volume against landmarks", "Weekly hard sets per muscle against your volume landmarks, with soreness, pump and workload feedback."],
  ["Strength and records", "Estimated 1RM per lift, total and DOTS, rep maxes, and PR checks that know your bodyweight."],
  ["Plate calculator and warm-ups", "What goes on the bar, and ramp-up sets to your first working set."],
  ["Swap an exercise", "Your sets move to the new machine at the same true resistance."],
  ["Technique and bar path", "Rate technique, tag form errors, or track the bar in a side-on video: range of motion, velocity, drift."],
  ["Duplicate and rename", "Two leg presses with different levers keep separate records. Renaming carries your history."],
  ["Offline first", "Log in the gym without signal. It syncs when you are back online."],
  ["English and Greek", "Switch the language in the app."],
  ["Your data stays yours", "Export and back up. No subscription."],
];

export function Landing({ go }: { go: Go }) {
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap lp-bar">
          <span className="lp-mark">Ledger</span>
          <nav className="row" style={{ gap: 8, flexWrap: "nowrap" }} aria-label="Account">
            <button className="btn ghost" onClick={() => go("login")}>Log in</button>
            <button className="btn primary" onClick={() => go("signup")}>Create account</button>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-wrap lp-hero">
          <div className="lp-hero-copy">
            <h1>A training log that works like your spreadsheet.</h1>
            <p className="lp-lede">Plan the block, log every set and see what to lift next. Ledger is offline in the gym, synced when you are back, and built by a coach for lifters and the coaches who program them.</p>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn primary lp-cta" onClick={() => go("signup")}>Create account</button>
              <button className="btn lp-cta" onClick={() => go("login")}>Log in</button>
            </div>
            <p className="faint small" style={{ margin: "14px 0 0" }}>No subscription. Works in any browser, installs on Android and iPhone.</p>
          </div>
          <LoggerDemo />
        </section>

        <section className="lp-wrap lp-sec" aria-labelledby="h-machines">
          <div className="lp-side"><h2 id="h-machines">Know what the machine really loads</h2><p className="dim">The weight on the stack is not the weight on your legs. Enter two distances or two lever arms once. The log then shows true resistance beside the weight, bodyweight share and machine weight included, and converts either way.</p><p className="dim">Change gym and swap the exercise: your sets move to the weight that gives the same true resistance.</p></div>
          <MachineDemo />
        </section>

        <section className="lp-wrap lp-sec" aria-labelledby="h-prog">
          <div className="lp-side"><h2 id="h-prog">Your next weight, filled in</h2><p className="dim">Pick a progression scheme for each exercise. When you start the session, the load, reps and set count come from what you did last time.</p><p className="dim">This is the same engine the app runs. Change the reps and watch the target move.</p></div>
          <ProgDemo />
        </section>

        <section className="lp-wrap lp-sec" aria-labelledby="h-split">
          <div className="lp-side"><h2 id="h-split">Start from a split, then make it yours</h2><p className="dim">Thirteen hypertrophy splits, including full body two to six days and upper/lower with any X and Y. Every session is editable afterwards.</p></div>
          <SplitDemo />
        </section>

        <section className="lp-wrap lp-sec lp-shots" aria-labelledby="h-shots">
          <div className="lp-side"><h2 id="h-shots">In the app</h2><p className="dim">Screens from the app with the coach's own training data.</p></div>
          <div className="lp-strip">
            {([["log", "Logging with true resistance"], ["plan", "The plan"], ["volume", "Volume per muscle"], ["strength", "Strength and records"], ["prog", "Progression per exercise"]] as const).map(([k, cap]) => (
              <figure key={k}><img src={`/landing/${k}.webp`} alt={cap} loading="lazy" width={300} height={k === "log" ? 843 : 843} /><figcaption className="faint xs">{cap}</figcaption></figure>
            ))}
          </div>
          <figure className="lp-desk"><img src="/landing/desktop.webp" alt="Progress charts on a desktop screen" loading="lazy" width={900} height={563} /><figcaption className="faint xs">On a computer, with the sidebar</figcaption></figure>
        </section>

        <section className="lp-wrap lp-sec" aria-labelledby="h-more">
          <div className="lp-side"><h2 id="h-more">Everything else</h2></div>
          <dl className="lp-list">{EVERYTHING.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
        </section>

        <section className="lp-wrap lp-sec" aria-labelledby="h-coach">
          <div className="lp-side"><h2 id="h-coach">For coaches</h2></div>
          <div className="lp-coach">
            <p className="dim">Your clients register under your coach code. You see their logs and charts, comment on each session, assign programs and read their soreness and PR feeds. Add other coaches by invite link.</p>
            <ul className="lp-bullets"><li>Client list with logs and charts</li><li>Comments on any session</li><li>Assign programs</li><li>Invite links and a coach code</li></ul>
          </div>
        </section>

        <section className="lp-wrap lp-sec lp-final">
          <div className="lp-side"><h2>Start logging</h2><p className="dim">Load sample data to look around, or build your own program.</p></div>
          <div className="lp-final-box">
            <div className="row" style={{ gap: 10 }}>
              <button className="btn primary lp-cta" onClick={() => go("signup")}>Create account</button>
              <button className="btn lp-cta" onClick={() => go("login")}>Log in</button>
            </div>
            {!isNative && <p className="small dim" style={{ margin: "18px 0 0" }}><a href={APK_URL}>Download the Android app</a>. On iPhone, tap Share, then Add to Home Screen.</p>}
          </div>
        </section>
      </main>
      <footer className="lp-wrap lp-foot faint xs">Ledger by Coach Leonidas</footer>
    </div>
  );
}
