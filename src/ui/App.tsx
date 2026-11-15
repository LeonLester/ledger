import { useEffect, useState } from "react";
import { BarChart3, CalendarRange, Dumbbell, Settings2, TrendingUp } from "lucide-react";
import { useStore } from "../store";
import { Train } from "./Train";
import { Plan } from "./Plan";
import { Volume } from "./Volume";
import { Progress } from "./Progress";
import { More } from "./More";
import { canUpdate, checkUpdate } from "../native";

const TABS = [
  { id: "train", label: "Train", Icon: Dumbbell }, { id: "plan", label: "Plan", Icon: CalendarRange },
  { id: "volume", label: "Volume", Icon: BarChart3 }, { id: "progress", label: "Progress", Icon: TrendingUp }, { id: "more", label: "More", Icon: Settings2 },
] as const;

function RestBar() {
  const { rest, stopRest, startRest } = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!rest) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  useEffect(() => {
    if (rest && left === 0) {
      try { navigator.vibrate?.([200, 100, 200]); const a = new AudioContext(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 220); } catch { /* audio blocked */ }
      const t = setTimeout(stopRest, 4000); return () => clearTimeout(t);
    }
  }, [left, rest, stopRest]);
  if (!rest) return null;
  const adj = (d: number) => useStore.setState({ rest: { ...rest, until: rest.until + d * 1000, total: rest.total + d } });
  return (
    <div className="restbar" role="timer" aria-label="Rest timer">
      <div><div className="xs" style={{ opacity: .7 }}>{left === 0 ? "Rest over" : "Rest"}</div><div className="t">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div></div>
      <button className="btn sm" onClick={() => adj(-15)} aria-label="Subtract 15 seconds">-15</button>
      <button className="btn sm" onClick={() => adj(15)} aria-label="Add 15 seconds">+15</button>
      <button className="btn sm" onClick={stopRest}>Skip</button>
      <div className="bar" style={{ width: `${Math.min(100, (left / rest.total) * 100)}%` }} />
    </div>
  );
  void startRest;
}

export function App() {
  const { ready, init, settings, toast, openSession } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("train");
  useEffect(() => { void init(); }, [init]);
  useEffect(() => { if (canUpdate) checkUpdate().then((u) => u && useStore.setState({ update: u })).catch(() => {}); }, []);
  useEffect(() => {
    const r = document.documentElement;
    if (settings.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);
  if (!ready) return <div className="main"><h1>Ledger</h1></div>;
  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand">Ledger</div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); if (id !== "train") useStore.getState().closeSession(); }}><Icon size={22} strokeWidth={2.2} />{label}</button>
        ))}
      </nav>
      <main className="main" id="main" data-open={openSession ? "1" : undefined}>
        {tab === "train" && <Train />}{tab === "plan" && <Plan />}{tab === "volume" && <Volume />}{tab === "progress" && <Progress />}{tab === "more" && <More />}
      </main>
      <RestBar />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
