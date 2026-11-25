import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";
import { relabel } from "../lib/groups";
import { mesoLabel } from "../lib/selectors";
import type { Meso, PlanItem, PlanSession, PlanWeek } from "../types";
import type { ClientView } from "../lib/view";
import { IntBox, Seg } from "./common";

type Scope = "this" | "onward" | "all";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Applies what changed in one week's session to the other weeks in scope, matching exercises by their name before the edit. */
function applyEdit(weeks: PlanWeek[], week: number, scope: Scope, name: string, before: PlanItem[], after: (PlanItem & { was?: string })[]): PlanWeek[] {
  const inScope = (w: number) => (scope === "all" ? true : scope === "this" ? w === week : w >= week);
  return weeks.map((pw) => {
    if (!inScope(pw.week)) return pw;
    return { ...pw, sessions: pw.sessions.map((s): PlanSession => {
      if (s.name !== name) return s;
      const keptNames = new Set(after.filter((a) => a.was).map((a) => a.was));
      let items = s.items.filter((it) => !before.some((b) => b.exercise === it.exercise) || keptNames.has(it.exercise));
      items = items.map((it) => {
        const a = after.find((x) => x.was === it.exercise);
        if (!a) return it;
        const b = before.find((x) => x.exercise === a.was)!;
        const changed = <K extends keyof PlanItem>(k: K) => a[k] !== b[k];
        const next: PlanItem = { ...it, exercise: a.exercise };
        if (changed("sets")) { next.sets = a.sets; delete next.setsEnd; }
        if (changed("repLo")) next.repLo = a.repLo;
        if (changed("repHi")) next.repHi = a.repHi;
        if (changed("rir")) next.rir = a.rir;
        return next;
      });
      for (const a of after.filter((x) => !x.was)) items.push({ letter: "", exercise: a.exercise, sets: a.sets, repLo: a.repLo, repHi: a.repHi, rir: a.rir });
      return { ...s, items: relabel(items) };
    }) };
  });
}

/** Edit the plan of a client's block. Changes land in the client's app at once and a note is left in their messages. */
export function ClientProgram({ client, reload }: { client: ClientView; reload: () => Promise<void> }) {
  const say = useStore((s) => s.say);
  const mesos = ((client.data.mesos ?? []) as (Meso & { __id: string })[]);
  const active = (client.data.settings?.[0] as { activeMeso?: string } | undefined)?.activeMeso;
  const [mesoId, setMesoId] = useState(active && mesos.some((m) => m.id === active) ? active : mesos[0]?.id ?? "");
  const meso = mesos.find((m) => m.id === mesoId);
  const [week, setWeek] = useState(1);
  const [sess, setSess] = useState("");
  const [scope, setScope] = useState<Scope>("onward");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, (PlanItem & { was?: string })[]>>({});
  const library = useMemo(() => Object.keys(((client.data.kv ?? []).find((r) => r.__id === "library")?.value ?? {}) as object).sort(), [client]);
  if (!meso) return <p className="dim">This client has no program yet. Assign one first.</p>;
  const w = meso.weeks.find((x) => x.week === week) ?? meso.weeks[0];
  const cur = w.sessions.find((s) => s.name === sess) ?? w.sessions[0];
  if (!cur) return <p className="dim">This week has no sessions.</p>;
  const key = `${mesoId}|${w.week}|${cur.name}`;
  const rows = draft[key] ?? cur.items.map((i) => ({ ...i, was: i.exercise }));
  const dirty = Object.keys(draft).length > 0;
  const put = (next: typeof rows) => setDraft({ ...draft, [key]: next });
  const upd = (i: number, p: Partial<PlanItem>) => put(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const save = async () => {
    setBusy(true);
    try {
      let weeks = clone(meso.weeks);
      for (const [k, after] of Object.entries(draft)) {
        const [, wk, name] = k.split("|");
        const src = meso.weeks.find((x) => x.week === Number(wk))!.sessions.find((s) => s.name === name)!;
        weeks = applyEdit(weeks, Number(wk), scope, name, src.items, after.filter((r) => r.exercise.trim()).map((r) => ({ ...r, exercise: r.exercise.trim() })));
      }
      await api(`/api/coach/clients/${client.id}/program`, { mesoId, weeks, note });
      setDraft({}); setNote(""); say(`Program updated for ${client.name}`); await reload();
    } catch (e) { say((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="stack-lg">
      <section className="panel stack" style={{ padding: 16 }}>
        <div><h3>Edit {client.name}'s program</h3><p className="dim small">Change exercises, sets, reps and effort. Their app updates as soon as you save, and they get a note in their messages. Their logged sessions are not touched.</p></div>
        {mesos.length > 1 && <Seg value={mesoId} onChange={(v) => { setMesoId(v); setWeek(1); setSess(""); setDraft({}); }} options={mesos.map((m) => ({ v: m.id, label: mesoLabel(m.name) }))} label="Block" />}
        <div className="row wrap">
          <Seg value={w.week} onChange={(v) => { setWeek(v); setSess(""); }} options={meso.weeks.map((x) => ({ v: x.week, label: `W${x.week}` }))} label="Week" />
          <Seg value={cur.name} onChange={setSess} options={w.sessions.map((s) => ({ v: s.name, label: s.name }))} label="Session" />
        </div>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <div className="row between"><h3>{cur.name}, week {w.week}</h3><span className="pill">{rows.reduce((a, r) => a + r.sets, 0)} sets</span></div>
        <datalist id="client-ex">{library.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="stack" style={{ gap: 10 }}>
          <div className="pe-row pe-head xs faint"><span>Exercise</span><span>Sets</span><span>Reps</span><span>RIR</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className="pe-row">
              <input className="input" list="client-ex" aria-label={`Exercise ${i + 1}`} value={r.exercise} onChange={(e) => upd(i, { exercise: e.target.value })} />
              <IntBox label={`Sets of ${r.exercise}`} min={0} max={30} value={r.sets} onCommit={(n) => n != null && upd(i, { sets: n })} />
              <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <IntBox label={`Lowest reps of ${r.exercise}`} min={1} max={100} empty value={r.repLo} onCommit={(n) => upd(i, { repLo: n })} />
                <IntBox label={`Highest reps of ${r.exercise}`} min={1} max={100} empty value={r.repHi} onCommit={(n) => upd(i, { repHi: n })} />
              </div>
              <IntBox label={`RIR of ${r.exercise}`} min={0} max={20} empty value={r.rir} onCommit={(n) => upd(i, { rir: n })} />
              <button className="btn ghost icon sm" aria-label={`Remove ${r.exercise}`} onClick={() => put(rows.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => put([...rows, { letter: "", exercise: "", sets: 3, repLo: 8, repHi: 12, rir: 2 }])}><Plus size={16} /> Add exercise</button>
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <div className="field"><span>Apply the changes to</span>
          <Seg full value={scope} onChange={setScope} label="Apply to" options={[{ v: "this", label: `Week ${w.week} only` }, { v: "onward", label: `Week ${w.week} onward` }, { v: "all", label: "All weeks" }]} /></div>
        <label className="field"><span>Note for the client (optional)</span><input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: hack squat instead of leg press while your knee settles" /></label>
        <div className="row wrap"><button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>Save and send to {client.name}</button>
          {dirty && <button className="btn ghost" onClick={() => setDraft({})}>Discard changes</button>}</div>
        {dirty && <p className="faint xs">Edits to {Object.keys(draft).length} session{Object.keys(draft).length > 1 ? "s" : ""} are waiting. You can switch session or week and keep editing before saving.</p>}
      </section>
    </div>
  );
}
