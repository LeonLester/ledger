import { useMemo, type CSSProperties } from "react";
import { useData } from "../lib/view";
import { useStore } from "../store";
import { parseSets, setsText } from "../lib/sheet";
import { muscleColor } from "../lib/groups";

/** The training log as a grid: one table per session, exercises down, weeks across. Type "100x8 100x8 95x9" in a cell. */
export function LogSheet({ mesoId }: { mesoId: string }) {
  const { mesos, sessions, readOnly } = useData();
  const { sheetSets, say, addLibrary, muscleOf } = useStore();
  const meso = mesos.find((m) => m.id === mesoId);
  const tables = useMemo(() => {
    if (!meso) return [];
    const names: string[] = [];
    for (const w of meso.weeks) for (const s of w.sessions) if (!names.includes(s.name)) names.push(s.name);
    return names.map((name) => {
      const ex: string[] = [];
      for (const w of meso.weeks) for (const it of w.sessions.find((s) => s.name === name)?.items ?? []) if (!ex.includes(it.exercise)) ex.push(it.exercise);
      for (const s of sessions) if (s.meso === mesoId && s.name === name) for (const e of s.exercises) if (!ex.includes(e.exercise)) ex.push(e.exercise);
      return { name, ex };
    });
  }, [meso, sessions, mesoId]);
  if (!meso) return null;
  const weeks = meso.weeks.map((w) => w.week);
  const find = (week: number, name: string, ex: string) => sessions.find((s) => s.id === `${mesoId}w${week}-${name}`)?.exercises.find((e) => e.exercise === ex);
  const letterOf = (name: string, ex: string) => { for (const w of meso.weeks) { const it = w.sessions.find((s) => s.name === name)?.items.find((i) => i.exercise === ex); if (it) return it.letter; } return ""; };
  const plan = (week: number, name: string, ex: string) => meso.weeks.find((w) => w.week === week)?.sessions.find((s) => s.name === name)?.items.find((i) => i.exercise === ex);
  return (
    <div className="stack-lg">
      <p className="dim small">{readOnly ? "Read only." : "Click a cell and type sets as weight x reps, for example 100x8 100x8 95x9. Myo-reps work too: 60x12+4+3."}</p>
      {tables.map(({ name, ex }) => (
        <section key={name} className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <h3 style={{ padding: "12px 14px" }}>{name}</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="t sheet-grid">
              <thead><tr><th className="sheet-ex">Exercise</th>{weeks.map((w) => <th key={w}>W{w}</th>)}</tr></thead>
              <tbody>
                {ex.map((n) => (
                  <tr key={n}>
                    <td className="sheet-ex" title={n} style={{ "--mc": muscleColor(muscleOf(n)) } as CSSProperties}><b>{letterOf(name, n)}</b> {n}</td>
                    {weeks.map((w) => {
                      const e = find(w, name, n), p = plan(w, name, n);
                      const cur = setsText(e);
                      const ph = p ? `${p.sets}x${p.repLo ?? ""}${p.repHi && p.repHi !== p.repLo ? `-${p.repHi}` : ""}` : "";
                      return (
                        <td key={w} style={{ padding: 0 }}>
                          <input className="cell-in num" aria-label={`${n}, week ${w}`} placeholder={ph} readOnly={readOnly} defaultValue={cur} key={`${cur}|${w}`}
                            onBlur={(ev) => {
                              const v = ev.target.value.trim();
                              if (v === cur || readOnly) return;
                              const sets = v ? parseSets(v, e?.rir ?? p?.rir ?? null) : [];
                              if (!sets) { say("Use weight x reps, for example 100x8 100x8"); ev.target.value = cur; return; }
                              addLibrary([n]);
                              sheetSets(mesoId, w, name, n, sets);
                            }}
                            onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
