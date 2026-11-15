import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Disc3, Flame, Plus, Minus, Repeat, StickyNote, Trash2, Video } from "lucide-react";
import { PR_LABEL, sessionPrs } from "../lib/pr";
import { TechSheet } from "./Technique";
import { useStore } from "../store";
import { bestE1rm, defaultIncrement, fmtW, PLATE_COLORS, plateLoad, warmups, workedSets } from "../lib/math";
import { effectiveSessions, feedbackDelta, pumpLabels, sorenessLabels, suggestTarget, workloadLabels } from "../lib/progression";
import { lastLog, parseReps, repsText, sortSessions } from "../lib/selectors";
import { SessionComments } from "./CoachInbox";
import type { ExLog, SetLog } from "../types";
import { Seg, Sheet } from "./common";

function RepsCell({ s, placeholder, onChange }: { s: SetLog; placeholder: string; onChange: (v: { reps: number | null; myo: number[] }) => void }) {
  const [t, setT] = useState(repsText(s));
  useEffect(() => { setT(repsText(s)); }, [s.reps, s.myo.join()]);
  return <input className="cell" inputMode="numeric" aria-label="Reps" placeholder={placeholder} value={t}
    onChange={(e) => { setT(e.target.value); const p = parseReps(e.target.value); if (p) onChange(p); }} />;
}

function EffCell({ rir, rpe, placeholder, label, onChange }: { rir: number | null | undefined; rpe: boolean; placeholder: string; label: string; onChange: (v: number | null) => void }) {
  const show = rir == null ? "" : String(rpe ? 10 - rir : rir);
  const parse = (t: string) => (t === "" ? null : rpe ? 10 - Number(t) : Number(t));
  const [t, setT] = useState(show);
  useEffect(() => { if (parse(t) !== (rir ?? null)) setT(show); /* eslint-disable-next-line */ }, [rir, rpe]);
  return <input className="cell" inputMode="decimal" aria-label={label} placeholder={placeholder} value={t}
    onChange={(e) => { const v = e.target.value.replace(",", "."); setT(v); if (v === "" || (/^\d+(\.\d?)?$/.test(v) && !v.endsWith("."))) onChange(parse(v)); }} />;
}

export function SessionView({ id }: { id: string }) {
  const st = useStore();
  const { sessions, settings, mesos, adjustments, library, feedback, muscleOf, closeSession, updateEx, toggleSet, bodyweight, split } = st;
  const sess = sessions.find((s) => s.id === id);
  const [menu, setMenu] = useState<{ i: number; kind: "warm" | "plates" | "note" | "swap" | "tech" } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const meso = mesos.find((m) => m.id === sess?.meso);
  const plan = useMemo(() => (meso && sess ? effectiveSessions(meso, sess.week, adjustments, muscleOf).find((p) => p.name === sess.name) : undefined), [meso, sess?.week, sess?.name, adjustments]);
  const prs = useMemo(() => (sess ? sessionPrs(sess, sessions, bodyweight, { mesoStart: settings.mesoStart, split }, sess.status === "active") : []), [sess, sessions, bodyweight]);
  if (!sess) return null;
  const rpeMode = settings.effort === "rpe";
  const muscles = [...new Set(sess.exercises.map((e) => muscleOf(e.exercise)))];
  const needSoreness = settings.mode === "sheet" ? [] : feedback.filter((f) => f.soreness == null && muscles.includes(f.muscle) && f.sessionId !== sess.id);
  const total = sess.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = sess.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const readOnly = sess.status === "done";

  const patchSet = (i: number, j: number, p: Partial<SetLog>) => updateEx(id, i, (e) => ({ ...e, sets: e.sets.map((s, k) => (k === j ? { ...s, ...p } : s)) }));

  return (
    <div>
      <header className="top">
        <button className="btn ghost icon" onClick={closeSession} aria-label="Back to sessions"><ArrowLeft /></button>
        <div><h2 style={{ lineHeight: 1 }}>{sess.name}</h2><div className="dim small">Week {sess.week}, {done} of {total} sets</div></div>
        {readOnly ? <button className="btn" onClick={() => st.reopenSession(id)}>Edit</button> : <button className="btn primary" onClick={() => (settings.mode === "sheet" ? st.finishSession(id, {}) : setFinishing(true))}>Finish</button>}
      </header>

      <SessionComments sessionId={id} />

      {needSoreness.length > 0 && (
        <section className="panel stack" style={{ padding: 16, marginBottom: 14 }} aria-label="Soreness check">
          <div><h3>How sore were these muscles after last time?</h3><p className="dim small">It tells the app whether to add or hold sets next week.</p></div>
          {needSoreness.map((f) => (
            <div key={f.id} className="fb-row">
              <b>{f.muscle}</b>
              <Seg full value={-1} label={`${f.muscle} soreness`} options={sorenessLabels.map((l, v) => ({ v, label: l.replace("Healed just in time", "Just healed").replace("Never sore", "None").replace("Healed early", "Early") }))} onChange={(v) => st.setSoreness(f.id, v)} />
            </div>
          ))}
        </section>
      )}

      {sess.exercises.map((ex, i) => {
        const item = plan?.items.find((p) => p.letter === ex.letter && p.exercise === ex.exercise) ?? plan?.items.find((p) => p.exercise === ex.exercise) ?? plan?.items[i];
        const last = lastLog(ex.exercise, sessions, sess);
        const def = library[ex.exercise];
        const tgt = item ? suggestTarget(item, last, def) : null;
        const inc = def?.increment ?? defaultIncrement(ex.unit ?? "kg");
        const unit = ex.unit ?? "kg";
        const prevSets = last ? last.sets : [];
        const first = ex.sets.find((s) => s.weight != null)?.weight ?? null;
        return (
          <article className="ex" key={ex.letter + ex.exercise + i}>
            <div className="ex-head">
              <span className="letter">{ex.letter}</span>
              <div>
                <div className="ex-name">{ex.exercise}</div>
                <div className="dim small">{muscleOf(ex.exercise)}{ex.rir != null ? `, plan RIR ${ex.rir}` : ""}</div>
              </div>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost icon sm" aria-label="Warm-up sets" onClick={() => setMenu({ i, kind: "warm" })}><Flame size={18} /></button>
                <button className="btn ghost icon sm" aria-label="Plate calculator" onClick={() => setMenu({ i, kind: "plates" })}><Disc3 size={18} /></button>
                <button className="btn ghost icon sm" aria-label="Swap exercise" onClick={() => setMenu({ i, kind: "swap" })}><Repeat size={18} /></button>
                <button className="btn ghost icon sm" aria-label="Note" onClick={() => setMenu({ i, kind: "note" })}><StickyNote size={18} color={ex.note ? "var(--accent)" : undefined} /></button>
                <button className="btn ghost icon sm" aria-label="Technique and bar path" onClick={() => setMenu({ i, kind: "tech" })}><Video size={18} color={ex.tech || ex.paths?.length ? "var(--accent)" : undefined} /></button>
              </div>
            </div>
            {item?.desc && <div className="target"><span>Prescribed <b>{item.desc}</b></span></div>}
            {tgt && !item?.scheme && !(item?.pct != null && item.lift && settings.tms?.[item.lift]) && (
              <div className="target">
                {tgt.weight != null ? <span>Aim <b className="num">{fmtW(tgt.weight)} {unit}</b> for <b>{item?.repLo}{item && item.repHi !== item.repLo ? `-${item.repHi}` : ""}</b> reps</span> : <span>Aim for <b>{item?.repLo}{item && item.repHi !== item.repLo ? `-${item.repHi}` : ""}</b> reps</span>}
                <span className="faint">{tgt.note}</span>
              </div>
            )}
            <div className="sets">
              <div className="set head"><span /><span>Last</span><span style={{ textAlign: "center" }}>{unit}</span><span style={{ textAlign: "center" }}>Reps</span><span style={{ textAlign: "center" }}>{rpeMode ? "RPE" : "RIR"}</span><span /></div>
              {ex.sets.map((s, j) => {
                const p = prevSets[j] ?? prevSets[prevSets.length - 1];
                const rirClass = s.rir == null ? "" : s.rir <= 0 ? "rir-1" : s.rir === 1 ? "rir-2" : s.rir === 2 ? "rir-3" : "rir-4";
                return (
                  <div key={j} className={`set ${s.done ? "done" : ""}`}>
                    <span className="n num">{j + 1}</span>
                    <span className="prev num">{p && p.reps != null ? `${fmtW(p.weight) || "-"}x${repsText(p)}` : "-"}</span>
                    <input className="cell" inputMode="decimal" aria-label={`Set ${j + 1} weight`} value={s.weight ?? ""} placeholder={fmtW(p?.weight ?? null) || "0"}
                      onChange={(e) => patchSet(i, j, { weight: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
                    <RepsCell s={s} placeholder={s.tr ? `${s.tr}${s.amrap ? "+" : ""}` : item?.repLo ? String(item.repLo) : "0"} onChange={(v) => patchSet(i, j, v)} />
                    <EffCell rir={s.rir} rpe={rpeMode} label={`Set ${j + 1} ${rpeMode ? "RPE" : "reps in reserve"}`} placeholder={ex.rir != null ? String(rpeMode ? 10 - ex.rir : ex.rir) : "-"} onChange={(v) => patchSet(i, j, { rir: v })} />
                    <button className={`disc ${rirClass}`} aria-pressed={!!s.done} aria-label={`Set ${j + 1} done`} onClick={() => toggleSet(id, i, j)}>
                      {s.done ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : null}
                    </button>
                  </div>
                );
              })}
            </div>
            {prs.filter((p) => p.ex === i).map((p) => <div key={p.kind} className="pr"><span className="pill ok">{PR_LABEL[p.kind]}</span><span className="small">Set {p.set + 1}: {p.text}</span></div>)}
            <div className="addset">
              <button className="btn sm ghost" onClick={() => updateEx(id, i, (e) => ({ ...e, sets: [...e.sets, { weight: e.sets[e.sets.length - 1]?.weight ?? null, reps: null, myo: [] }] }))}><Plus size={16} /> Add set</button>
              {ex.sets.length > 1 && <button className="btn sm ghost" onClick={() => updateEx(id, i, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}><Minus size={16} /> Remove set</button>}
              {last && <button className="btn sm ghost" onClick={() => updateEx(id, i, (e) => ({ ...e, sets: e.sets.map((s, k) => ({ ...s, weight: prevSets[k]?.weight ?? prevSets[prevSets.length - 1]?.weight ?? s.weight, reps: prevSets[k]?.reps ?? s.reps, myo: prevSets[k]?.myo ?? s.myo })) }))}>Copy last</button>}
            </div>

            {menu?.i === i && menu.kind === "warm" && (
              <Sheet title={`Warm-up for ${ex.exercise}`} onClose={() => setMenu(null)}>
                {first ? (
                  <div className="stack"><p className="dim small">Ramps to your first working set of {fmtW(first)} {unit}. Rest 45 to 60 seconds between.</p>
                    <table className="t"><thead><tr><th>Set</th><th>Load</th><th>Reps</th></tr></thead><tbody>
                      {warmups(first, inc).map((w, k) => <tr key={k}><td>{k + 1}</td><td className="num"><b>{fmtW(w.weight)} {unit}</b></td><td>{w.reps}</td></tr>)}
                      <tr><td>Work</td><td className="num"><b>{fmtW(first)} {unit}</b></td><td>{item?.repLo}{item && item.repHi !== item.repLo ? `-${item.repHi}` : ""}</td></tr></tbody></table></div>
                ) : <p className="dim">Enter a working weight first and the ramp is built from it.</p>}
              </Sheet>
            )}
            {menu?.i === i && menu.kind === "plates" && (
              <Sheet title="Plate calculator" onClose={() => setMenu(null)}><PlateCalc start={first} unit={unit} /></Sheet>
            )}
            {menu?.i === i && menu.kind === "note" && (
              <Sheet title={`Note: ${ex.exercise}`} onClose={() => setMenu(null)}>
                <textarea className="input" style={{ minHeight: 110, padding: 12 }} defaultValue={ex.note ?? ""} placeholder="Cues, seat setting, pin position, form fault" onBlur={(e) => updateEx(id, i, (x) => ({ ...x, note: e.target.value || null }))} />
                <button className="btn primary" onClick={() => setMenu(null)}>Save note</button>
              </Sheet>
            )}
            {menu?.i === i && menu.kind === "tech" && <TechSheet id={id} i={i} onClose={() => setMenu(null)} />}
            {menu?.i === i && menu.kind === "swap" && (
              <Sheet title={`Swap ${ex.exercise}`} onClose={() => setMenu(null)}>
                <p className="dim small">Same muscle ({muscleOf(ex.exercise)}). Loads reset to the new lift's history.</p>
                <div className="list">{Object.values(library).filter((d) => d.muscle === muscleOf(ex.exercise) && d.name !== ex.exercise).map((d) => {
                  const lg = lastLog(d.name, sessions, sess);
                  return <button key={d.name} className="sess-row" onClick={() => { updateEx(id, i, (x) => ({ ...x, exercise: d.name, unit: d.unit, sets: x.sets.map((s) => ({ ...s, weight: lg ? lg.sets[0]?.weight ?? null : null, reps: null, myo: [], done: false })) })); setMenu(null); }}>
                    <div><div className="ex-name" style={{ fontSize: "1.2rem" }}>{d.name}</div><div className="dim small">{lg ? `Last ${fmtW(lg.sets[0]?.weight)}x${lg.sets[0]?.reps}` : "No history"}</div></div></button>;
                })}</div>
              </Sheet>
            )}
          </article>
        );
      })}

      <div className="row" style={{ margin: "18px 0", justifyContent: "space-between" }}>
        <button className="btn" onClick={() => setAdding(true)}><Plus size={18} /> Add exercise</button>
        {sess.status === "active" && <button className="btn ghost danger" onClick={() => confirm("Discard this session?") && st.deleteSession(id)}><Trash2 size={18} /> Discard</button>}
      </div>

      {adding && (
        <Sheet title="Add exercise" onClose={() => setAdding(false)}>
          <div className="list">{Object.values(library).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
            <button key={d.name} className="sess-row" onClick={() => { st.addExercise(id, d.name); setAdding(false); }}>
              <div><div className="ex-name" style={{ fontSize: "1.2rem" }}>{d.name}</div><div className="dim small">{d.muscle}</div></div></button>
          ))}</div>
        </Sheet>
      )}
      {finishing && <FinishSheet id={id} onClose={() => setFinishing(false)} />}
    </div>
  );
}

function PlateCalc({ start, unit }: { start: number | null; unit: string }) {
  const { settings } = useStore();
  const [target, setTarget] = useState(String(start ?? 60));
  const lb = unit === "lb";
  const plates = lb ? [45, 35, 25, 10, 5, 2.5] : settings.plates;
  const bar = lb ? 45 : settings.bar;
  const t = Number(target.replace(",", ".")) || 0;
  const { out, rest } = plateLoad(t, bar, plates);
  if (unit === "pin") return <p className="dim">Pin-stack loads have no plates. Record the pin position as the weight.</p>;
  return (
    <div className="stack">
      <label className="field"><span>Target load ({unit})</span><input className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      <div className="plates" aria-label={`Per side: ${out.join(", ")}`}>
        <div className="bar-stub" />
        {out.map((p, i) => <div key={i} className="plate" style={{ height: 36 + p * (lb ? 1.1 : 2.2), width: 14 + (p > 10 ? 6 : 0), background: PLATE_COLORS[p] ?? "#999" }}>{p}</div>)}
      </div>
      <p className="dim small">Per side on a {bar} {unit} bar: <b className="num" style={{ color: "var(--text)" }}>{out.length ? out.join(" + ") : "bar only"}</b>{rest > 0 ? `. ${rest} ${unit} per side cannot be loaded with your plates.` : ""}</p>
    </div>
  );
}

function FinishSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { sessions, muscleOf, finishSession } = useStore();
  const sess = sessions.find((s) => s.id === id)!;
  const muscles = [...new Set(sess.exercises.filter((e) => e.sets.some((s) => s.done || (s.reps ?? 0) > 0)).map((e) => muscleOf(e.exercise)))];
  const [fb, setFb] = useState<Record<string, { pump: number; workload: number }>>(Object.fromEntries(muscles.map((m) => [m, { pump: 1, workload: 1 }])));
  const { bodyweight, settings, split } = useStore();
  const prs = sessionPrs(sess, sessions, bodyweight, { mesoStart: settings.mesoStart, split }, false);
  return (
    <Sheet title="Finish session" onClose={onClose}>
      {prs.length > 0 && <div className="stack"><h3>Records this session</h3>{prs.map((p) => <div key={p.exercise + p.kind} className="row between wrap"><span><b>{p.exercise}</b><div className="faint xs">Set {p.set + 1}: {p.text}</div></span><span className="pill ok">{PR_LABEL[p.kind]}</span></div>)}</div>}
      <p className="dim small">Rate each muscle you trained. Soreness is asked next time you train it, then the app suggests set changes.</p>
      {muscles.map((m) => (
        <div className="fb-row" key={m}>
          <b>{m}</b>
          <div className="stack" style={{ gap: 8 }}>
            <div className="field"><span>Pump</span><Seg full value={fb[m].pump} label={`${m} pump`} options={pumpLabels.map((l, v) => ({ v, label: l }))} onChange={(v) => setFb({ ...fb, [m]: { ...fb[m], pump: v } })} /></div>
            <div className="field"><span>Workload</span><Seg full value={fb[m].workload} label={`${m} workload`} options={workloadLabels.map((l, v) => ({ v, label: l }))} onChange={(v) => setFb({ ...fb, [m]: { ...fb[m], workload: v } })} /></div>
          </div>
        </div>
      ))}
      <button className="btn primary" onClick={() => finishSession(id, fb)}>Save session</button>
    </Sheet>
  );
}
void feedbackDelta; void workedSets; void sorenessLabels; void bestE1rm; void sortSessions;
export type { ExLog };
