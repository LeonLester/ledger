import { useMemo, useState, type CSSProperties } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { muscleColor } from "../lib/groups";
import { defaultIncrement } from "../lib/math";
import type { ExerciseDef, Unit } from "../types";

/** The exercise library as one scrolling table, grouped by the muscle each exercise trains. Every field is editable. */
export function Library() {
  const { library, setExercise, removeExercise, renameExercise, say } = useStore();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; muscle: string; unit: Unit }>({ name: "", muscle: "", unit: "kg" });
  const muscles = useMemo(() => [...new Set(Object.values(library).map((d) => d.muscle))].sort(), [library]);
  const groups = useMemo(() => {
    const out = new Map<string, ExerciseDef[]>();
    for (const d of Object.values(library).sort((a, b) => a.name.localeCompare(b.name))) {
      if (muscle !== "all" && d.muscle !== muscle) continue;
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) continue;
      out.set(d.muscle, [...(out.get(d.muscle) ?? []), d]);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [library, q, muscle]);
  const count = groups.reduce((a, [, l]) => a + l.length, 0);
  const add = () => {
    const name = draft.name.trim();
    if (!name) return;
    if (library[name]) { say("That exercise exists already"); return; }
    setExercise(name, { muscle: draft.muscle.trim() || "Unknown", unit: draft.unit, increment: defaultIncrement(draft.unit) });
    setDraft({ name: "", muscle: draft.muscle, unit: draft.unit }); setAdding(false);
  };
  return (
    <section className="panel stack" style={{ padding: 16 }}>
      <div className="row between"><h3>Exercise library</h3><button className="btn sm" onClick={() => setAdding(!adding)}><Plus size={16} /> Add</button></div>
      <datalist id="lib-muscles">{muscles.map((m) => <option key={m} value={m} />)}</datalist>
      {adding && (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input" placeholder="Exercise name" aria-label="New exercise name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" list="lib-muscles" placeholder="Muscle group" aria-label="New exercise muscle" value={draft.muscle} onChange={(e) => setDraft({ ...draft, muscle: e.target.value })} />
            <select className="input" style={{ width: 84, flex: "none" }} aria-label="New exercise unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}><option>kg</option><option>lb</option><option>pin</option></select>
          </div>
          <button className="btn primary" onClick={add}>Add to library</button>
        </div>
      )}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" placeholder="Find an exercise" aria-label="Find an exercise" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 150, flex: "none" }} aria-label="Muscle group filter" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="all">All muscles</option>{muscles.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="lib-scroll" tabIndex={0} aria-label="Exercise library table">
        <table className="lib">
          <thead><tr><th className="lib-n">Exercise</th><th>Muscle</th><th>Unit</th><th>Step</th><th /></tr></thead>
          <tbody>
            {groups.map(([m, list]) => [
              <tr key={`h-${m}`} className="lib-h" style={{ "--mc": muscleColor(m) } as CSSProperties}><td colSpan={5}><b>{m}</b> <span className="faint xs">{list.length}</span></td></tr>,
              ...list.map((d) => (
                <tr key={d.name} style={{ "--mc": muscleColor(d.muscle) } as CSSProperties}>
                  <td className="lib-n"><input className="lib-in lib-name" aria-label={`Rename ${d.name}`} defaultValue={d.name} key={d.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (!v || v === d.name) { e.target.value = d.name; return; } if (library[v] && !confirm(`${v} already exists. Merge ${d.name} into it? Plans and logs are moved over.`)) { e.target.value = d.name; return; } if (renameExercise(d.name, v)) say(`Renamed to ${v}`); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />{d.guessed && <span className="pill warn" style={{ marginLeft: 2 }}>?</span>}</td>
                  <td><input className="lib-in" list="lib-muscles" aria-label={`${d.name} muscle`} defaultValue={d.muscle} onBlur={(e) => e.target.value.trim() && e.target.value !== d.muscle && setExercise(d.name, { muscle: e.target.value.trim() })} /></td>
                  <td><select className="lib-in" aria-label={`${d.name} unit`} value={d.unit} onChange={(e) => setExercise(d.name, { unit: e.target.value as Unit })}><option>kg</option><option>lb</option><option>pin</option></select></td>
                  <td><input className="lib-in num" style={{ width: 56 }} inputMode="decimal" aria-label={`${d.name} load step`} defaultValue={d.increment} onBlur={(e) => setExercise(d.name, { increment: Number(e.target.value.replace(",", ".")) || d.increment })} /></td>
                  <td><button className="btn ghost icon sm" aria-label={`Remove ${d.name}`} onClick={() => confirm(`Remove ${d.name} from the library? Logged history is kept.`) && removeExercise(d.name)}><Trash2 size={15} /></button></td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
        {count === 0 && <p className="dim small" style={{ padding: 14 }}>No exercises match.</p>}
      </div>
      <p className="faint xs">{count} exercises. Tap a name to rename it everywhere, including past logs. Edit a muscle to move an exercise to another group; type a new name to start a group. Step is how much the app adds once you hit the top of the rep range. Rows marked ? still have a guessed muscle.</p>
    </section>
  );
}
