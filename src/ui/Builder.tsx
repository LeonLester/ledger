import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, Unlink2 } from "lucide-react";
import { linkPrev, muscleColor, prefix, runs } from "../lib/groups";
import { useStore } from "../store";
import { buildSplit, TEMPLATES, WEEKDAYS, type Generated, type SplitRow } from "../data/templates";
import { expand, expandLayouts, relabel } from "../lib/expand";
import type { Meso, PlanItem, PlanSession } from "../types";

const REST = "Rest";
const blank = (): PlanItem => ({ letter: "~", exercise: "", sets: 3, repLo: 8, repHi: 12, rir: 2 });
const num = (v: string, d: number | null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/** Edit a list of sessions: names, exercises, sets, rep range and RIR. Used by the program builder and by the plan editor. */
export function SessionsEditor({ sessions, onChange }: { sessions: PlanSession[]; onChange: (s: PlanSession[]) => void }) {
  const names = useStore((s) => Object.keys(s.library).sort());
  const effort = useStore((s) => s.settings.effort ?? "rir");
  const muscleOf = useStore((s) => s.muscleOf);
  const setSess = (i: number, fn: (s: PlanSession) => PlanSession) => onChange(sessions.map((s, k) => (k === i ? fn(s) : s)));
  const setItem = (i: number, j: number, patch: Partial<PlanItem>) => setSess(i, (s) => ({ ...s, items: s.items.map((it, k) => (k === j ? { ...it, ...patch } : it)) }));
  const move = (i: number, j: number, d: number) => setSess(i, (s) => { const a = [...s.items]; const t = j + d; if (t < 0 || t >= a.length) return s; [a[j], a[t]] = [a[t], a[j]]; return { ...s, items: relabel(a) }; });
  return (
    <div className="stack-lg">
      <datalist id="ex-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      {sessions.map((s, i) => (
        <section key={i} className="panel stack" style={{ padding: 14 }}>
          <div className="row between" style={{ gap: 8 }}>
            <input className="input" aria-label={`Session ${i + 1} name`} value={s.name} onChange={(e) => setSess(i, (x) => ({ ...x, name: e.target.value }))} style={{ fontWeight: 700 }} />
            <button className="btn ghost icon sm" aria-label={`Remove ${s.name}`} onClick={() => onChange(sessions.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {s.items.map((it, j) => {
              const g = runs(s.items)[j];
              const linked = prefix(it.letter) !== "" && g.pos > 0;
              return (
              <div key={j} className="stack" style={{ gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--line)", borderLeft: `4px solid ${muscleColor(muscleOf(it.exercise))}`, paddingLeft: 10, marginLeft: linked ? 14 : 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <span className="letter">{it.letter === "~" ? "A1" : it.letter}</span>
                  {j > 0 && <button className="btn ghost sm" aria-pressed={linked} aria-label={linked ? "Remove from superset" : "Superset with the exercise above"} onClick={() => setSess(i, (x) => ({ ...x, items: linkPrev(x.items, j, !linked) }))}>{linked ? <Unlink2 size={16} color="var(--accent)" /> : <Link2 size={16} />}{linked ? "Unlink" : "Superset"}</button>}
                </div>
                <input className="input" list="ex-names" placeholder="Exercise" aria-label="Exercise" value={it.exercise} onChange={(e) => setItem(i, j, { exercise: e.target.value })} />
                <div className="row" style={{ gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                  <label className="field" style={{ width: 58 }}><span className="xs">Sets</span><input className="input num" inputMode="numeric" value={it.sets} onChange={(e) => setItem(i, j, { sets: Math.max(1, num(e.target.value, 1) ?? 1) })} /></label>
                  <label className="field" style={{ width: 58 }}><span className="xs">Reps</span><input className="input num" inputMode="numeric" aria-label="Reps from" value={it.repLo ?? ""} onChange={(e) => setItem(i, j, { repLo: num(e.target.value, null) })} /></label>
                  <label className="field" style={{ width: 58 }}><span className="xs">To</span><input className="input num" inputMode="numeric" aria-label="Reps to" value={it.repHi ?? ""} onChange={(e) => setItem(i, j, { repHi: num(e.target.value, null) })} /></label>
                  <label className="field" style={{ width: 58 }}><span className="xs">{effort.toUpperCase()}</span><input className="input num" inputMode="numeric" aria-label={effort.toUpperCase()} value={it.rir ?? ""} onChange={(e) => setItem(i, j, { rir: num(e.target.value, null) })} /></label>
                  <div className="row" style={{ gap: 0, flexWrap: "nowrap", marginLeft: "auto" }}>
                    <button className="btn ghost icon sm" aria-label="Move up" disabled={j === 0} onClick={() => move(i, j, -1)}><ArrowUp size={16} /></button>
                    <button className="btn ghost icon sm" aria-label="Move down" disabled={j === s.items.length - 1} onClick={() => move(i, j, 1)}><ArrowDown size={16} /></button>
                    <button className="btn ghost icon sm" aria-label="Remove exercise" onClick={() => setSess(i, (x) => ({ ...x, items: relabel(x.items.filter((_, k) => k !== j)) }))}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setSess(i, (x) => ({ ...x, items: relabel([...x.items, blank()]) }))}><Plus size={16} /> Add exercise</button>
        </section>
      ))}
      {sessions.length < 7 && <button className="btn" style={{ justifySelf: "start" }} onClick={() => onChange([...sessions, { name: `Day ${sessions.length + 1}`, items: [blank()] }])}><Plus size={18} /> Add session</button>}
    </div>
  );
}

/** One day per weekday: pick which session falls on it, or rest. */
export function SplitEditor({ split, sessions, onChange }: { split: SplitRow[]; sessions: string[]; onChange: (s: SplitRow[]) => void }) {
  const rows = WEEKDAYS.map((day) => split.find((r) => r.day === day) ?? { day, session: REST, emphasis: "" });
  const used = rows.filter((r) => r.session !== REST).map((r) => r.session);
  const missing = sessions.filter((s) => !used.includes(s));
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={r.day} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <b style={{ width: 92, flex: "none" }}>{r.day}</b>
          <select className="input" aria-label={`${r.day} session`} value={r.session} onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, session: e.target.value } : x)))}>
            <option>{REST}</option>
            {[...new Set([...sessions, r.session])].filter((n) => n !== REST).map((n) => <option key={n}>{n}</option>)}
          </select>
          <input className="input" placeholder="Focus" aria-label={`${r.day} focus`} value={r.emphasis} onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, emphasis: e.target.value } : x)))} />
        </div>
      ))}
      {missing.length > 0 && <p className="small" style={{ color: "var(--yel)", margin: 0 }}>Not scheduled this week: {missing.join(", ")}.</p>}
    </div>
  );
}

export const evenSplit = (names: string[]): SplitRow[] => {
  const slots: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  const pos = slots[Math.max(1, Math.min(7, names.length))];
  return WEEKDAYS.map((day, d) => { const k = pos.indexOf(d); return { day, session: k >= 0 ? names[k] : REST, emphasis: "" }; });
};

const Stepper = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) => (
  <div className="field"><span>{label}</span>
    <div className="row"><button className="btn icon" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>-</button>
      <b className="num" style={{ minWidth: 28, textAlign: "center", fontSize: "1.3rem" }}>{value}</b>
      <button className="btn icon" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></div></div>
);

/** Fully custom program: any sessions, any exercises, any block length. Returns the generated block through onSave. */
export function ProgramBuilder({ onSave, saveLabel = "Save program", onCancel, initial }: { onSave: (g: (id: string) => Generated) => void | Promise<void>; saveLabel?: string; onCancel?: () => void; initial?: { name: string; sessions: PlanSession[] } }) {
  const [name, setName] = useState(initial?.name ?? "My program");
  const [weeks, setWeeks] = useState(5);
  const [rirStart, setRirStart] = useState(3);
  const [rirEnd, setRirEnd] = useState(1);
  const [deload, setDeload] = useState(true);
  const [sessions, setSessions] = useState<PlanSession[]>(initial?.sessions ?? [{ name: "Day 1", items: [blank()] }]);
  const [split, setSplit] = useState<SplitRow[] | null>(null);
  const [splitB, setSplitB] = useState<SplitRow[] | null>(null);
  const [rotate, setRotate] = useState(false);
  const days = useMemo(() => split ?? evenSplit(sessions.map((s) => s.name)), [split, sessions]);
  const valid = name.trim() && sessions.length > 0 && sessions.every((s) => s.name.trim() && s.items.some((i) => i.exercise.trim())) && new Set(sessions.map((s) => s.name.trim())).size === sessions.length;
  const fromTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const g = buildSplit(t, { freq: 3, upper: 3, lower: 2 }, "tmp");
    setSessions(g.meso.weeks[0].sessions.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, rir: 2 })) })));
    setSplit(g.split); setName(t.name);
  };
  const submit = () => {
    const clean = sessions.map((s) => ({ ...s, name: s.name.trim() }));
    const fix = (rows: SplitRow[]) => rows.map((r) => ({ ...r, session: clean.some((s) => s.name === r.session.trim()) ? r.session.trim() : REST }));
    const second = rotate ? fix(splitB ?? days) : null;
    const g = expandLayouts(clean, weeks, rirStart, rirEnd, deload, fix(days), second);
    return onSave((id): Generated => ({ meso: { id, name: name.trim(), weeks: g.weeks }, split: g.split, mode: "feedback", effort: "rir" }));
  };
  return (
    <div className="stack-lg">
      <label className="field"><span>Program name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Start from a template (optional, replaces the sessions below)</span>
        <select className="input" value="" onChange={(e) => e.target.value && fromTemplate(e.target.value)}><option value="">Blank</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <h3>Sessions</h3>
      <SessionsEditor sessions={sessions} onChange={setSessions} />
      <h3>Weekly layout</h3>
      <p className="dim small">Put the same session on more than one day to repeat it, for example Upper A, Lower A, Upper B, Lower B, Upper A, Lower A.</p>
      <SplitEditor split={days} sessions={sessions.map((s) => s.name.trim())} onChange={setSplit} />
      <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={rotate} onChange={(e) => { setRotate(e.target.checked); if (e.target.checked && !splitB) setSplitB(days); }} /><span className="small">Use a different layout on even weeks (a two week rotation)</span></label>
      {rotate && <><h3>Even weeks</h3><SplitEditor split={splitB ?? days} sessions={sessions.map((s) => s.name.trim())} onChange={setSplitB} /></>}
      <h3>Block</h3>
      <div className="row wrap" style={{ gap: 28 }}>
        <Stepper label="Weeks" value={weeks} min={1} max={16} onChange={setWeeks} />
        <Stepper label="First week RIR" value={rirStart} min={0} max={5} onChange={setRirStart} />
        <Stepper label="Last week RIR" value={rirEnd} min={0} max={5} onChange={setRirEnd} />
      </div>
      <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={deload} onChange={(e) => setDeload(e.target.checked)} /><span>Final week is a deload (half the sets, more reps in reserve)</span></label>
      <div className="row">
        <button className="btn primary" disabled={!valid} onClick={() => void submit()}>{saveLabel}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
      {!valid && <p className="faint xs">Give every session a unique name and at least one exercise.</p>}
    </div>
  );
}

/** Edits sessions of an existing block. The scope decides how many weeks the change reaches. */
export function MesoEditor({ meso, week, onClose }: { meso: Meso; week: number; onClose: () => void }) {
  const { saveMeso, addLibrary, split, saveSplit } = useStore();
  const original = meso.weeks.find((w) => w.week === week)?.sessions.map((s) => s.name) ?? [];
  const [sessions, setSessions] = useState<PlanSession[]>(() => JSON.parse(JSON.stringify(meso.weeks.find((w) => w.week === week)?.sessions ?? [])));
  const [scope, setScope] = useState<"week" | "from" | "all">("from");
  const apply = () => {
    const clean = sessions.map((s) => ({ ...s, name: s.name.trim() || "Session", items: relabel(s.items.filter((i) => i.exercise.trim())) }));
    const weeks = meso.weeks.map((w) => {
      const hit = scope === "all" || (scope === "week" ? w.week === week : w.week >= week);
      if (!hit) return w;
      // keep each week's own RIR and set count when the exercise already existed there
      return { ...w, sessions: clean.map((s) => ({ ...s, items: s.items.map((it) => { const old = w.sessions.flatMap((x) => x.items).find((o) => o.exercise === it.exercise); return w.week === week || !old ? it : { ...it, rir: old.rir, sets: scope === "all" ? old.sets : it.sets }; }) })) };
    });
    addLibrary(clean.flatMap((s) => s.items.map((i) => i.exercise)));
    saveMeso({ ...meso, weeks });
    const ren = new Map(original.map((o, i) => [o, clean[i]?.name]).filter(([o, n]) => n && o !== n) as [string, string][]);
    if (ren.size && meso.id === useStore.getState().settings.activeMeso) saveSplit(split.map((r) => (ren.has(r.session) ? { ...r, session: ren.get(r.session)! } : r)));
    onClose();
  };
  return (
    <div className="stack-lg">
      <p className="dim small">Editing the sessions of week {week}. Adjustments from feedback stay layered on top.</p>
      <div className="field"><span>Apply changes to</span>
        <div className="seg full" role="group" aria-label="Scope">
          {([["week", `Week ${week} only`], ["from", `Week ${week} onward`], ["all", "All weeks"]] as const).map(([v, l]) => <button key={v} aria-pressed={scope === v} onClick={() => setScope(v)}>{l}</button>)}
        </div></div>
      <SessionsEditor sessions={sessions} onChange={setSessions} />
      <div className="row"><button className="btn primary" onClick={apply}>Save changes</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </div>
  );
}
