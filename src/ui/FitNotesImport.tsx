import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useStore } from "../store";
import { buildFitNotes, parseFitNotes, type FnSummary } from "../lib/fitnotes";
import { Sheet } from "./common";

/** Import a FitNotes CSV export: pick the file, check the summary, then add it as finished sessions. */
export function FitNotesImport() {
  const st = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [sum, setSum] = useState<FnSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setText(null); setSum(null); };
  const pick = async (f: File) => {
    try {
      const t = await f.text();
      setSum(buildFitNotes(parseFitNotes(t), st.library, { athleteId: "me", mesoId: "x" }).summary);
      setText(t);
    } catch (e) { st.say((e as Error).message); }
  };
  const go = async () => {
    if (!text) return;
    setBusy(true);
    try { const s = await st.importFitNotes(text); st.say(`Imported ${s.sessions} sessions`); close(); } catch (e) { st.say((e as Error).message); } finally { setBusy(false); }
  };
  const sk = sum ? sum.skipped.cardio + sum.skipped.empty + sum.skipped.bad : 0;
  return (
    <>
      <button className="btn" onClick={() => input.current?.click()}><Upload size={18} /> Import FitNotes</button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
      {sum && (
        <Sheet title="Import from FitNotes" onClose={close}>
          <div className="list">
            <div className="sess-row"><span>Sessions</span><b className="num">{sum.sessions}</b></div>
            <div className="sess-row"><span>Sets</span><b className="num">{sum.sets}</b></div>
            <div className="sess-row"><span>Exercises</span><b className="num">{sum.exercises}</b></div>
            <div className="sess-row"><span>New to your library</span><b className="num">{sum.added}</b></div>
            <div className="sess-row"><span>Range</span><b className="num">{sum.from} to {sum.to}</b></div>
          </div>
          <p className="dim small">Sessions are added to a mesocycle named FitNotes import, dated as in the file. Your program and other logs stay as they are. Importing again replaces this one.{sk > 0 ? ` ${sk} rows without reps or with only time or distance are skipped.` : ""}</p>
          <button className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? "Importing" : `Import ${sum.sessions} sessions`}</button>
        </Sheet>
      )}
    </>
  );
}
