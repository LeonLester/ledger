import { useState } from "react";
import { useStore } from "../store";
import { SAMPLE_TEMPLATES } from "../data/sampleYear";
import { Sheet } from "./common";

/** Pick a sample to explore the app with: the real 2026 log, or a generated year of training for any split. */
export function SamplePicker({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const has = st.sessions.length > 0 || st.mesos.length > 0;
  const go = async (id: string, run: () => Promise<void>) => {
    if (has && !confirm("Loading a sample replaces your current program and logs on this account. Back up first if you want to keep them. Continue?")) return;
    setBusy(id);
    try { await run(); onClose(); } catch (e) { st.say((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Sheet title="Load sample data" onClose={onClose}>
      <p className="dim small">Each sample fills the app with logged sessions, PR history and weigh-ins so you can look around. It replaces what is on this account, and you can erase it later in More.</p>
      <div className="list">
        <button className="sess-row" disabled={!!busy} onClick={() => void go("real", () => st.loadSample())}>
          <div><div className="ex-name" style={{ fontSize: "1.2rem" }}>Leonidas, 2026 log</div><div className="dim small">Three real mesocycles, 68 sessions.</div></div>{busy === "real" && <span className="dim small">Loading</span>}
        </button>
        {SAMPLE_TEMPLATES.map((t) => (
          <button key={t.id} className="sess-row" disabled={!!busy} onClick={() => void go(t.id, () => st.loadSampleYear(t.id))}>
            <div><div className="ex-name" style={{ fontSize: "1.2rem" }}>{t.name}</div><div className="dim small">A year of training, 11 five-week blocks.</div></div>{busy === t.id && <span className="dim small">Loading</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
