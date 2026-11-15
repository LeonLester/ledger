import { useEffect, useState } from "react";
import { BarChart3, CalendarRange, Dumbbell, Settings2, TrendingUp, Users } from "lucide-react";
import { useStore } from "../store";
import { Train } from "./Train";
import { Plan } from "./Plan";
import { Volume } from "./Volume";
import { Progress } from "./Progress";
import { More } from "./More";
import { Welcome } from "./Programs";
import { canUpdate, checkUpdate, ringNow, scheduleRest, syncSystemBars } from "../native";
import { Auth } from "./Auth";
import { Component, type ReactNode } from "react";
import { Coach } from "./Coach";
import { resume, setAfterPull, useSync, watchGoogleReturn } from "../sync";
import { syncMealcost } from "../mealcost";
import { Admin } from "./Admin";

const TABS = [
  { id: "train", label: "Train", Icon: Dumbbell }, { id: "plan", label: "Plan", Icon: CalendarRange },
  { id: "volume", label: "Volume", Icon: BarChart3 }, { id: "progress", label: "Progress", Icon: TrendingUp }, { id: "coach", label: "Clients", Icon: Users }, { id: "more", label: "More", Icon: Settings2 },
] as const;

function RestBar() {
  const { rest, stopRest, startRest } = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!rest) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  useEffect(() => {
    if (rest && left === 0) {
      ringNow();
      const t = setTimeout(stopRest, 6000); return () => clearTimeout(t);
    }
  }, [left, rest, stopRest]);
  if (!rest) return null;
  const adj = (d: number) => { const until = rest.until + d * 1000; useStore.setState({ rest: { ...rest, until, total: rest.total + d } }); void scheduleRest(until); };
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

/** Shows what went wrong instead of a blank screen. */
class Boundary extends Component<{ children: ReactNode; reset: unknown }, { err: Error | null; at: unknown }> {
  state = { err: null as Error | null, at: this.props.reset };
  static getDerivedStateFromError(err: Error) { return { err }; }
  static getDerivedStateFromProps(p: { reset: unknown }, s: { at: unknown }) { return p.reset !== s.at ? { err: null, at: p.reset } : null; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="stack"><h2>Something went wrong on this screen</h2><p className="dim small">{this.state.err.message}</p>
      <div className="row"><button className="btn" onClick={() => this.setState({ err: null })}>Try again</button><button className="btn" onClick={() => location.reload()}>Reload the app</button></div></div>;
  }
}

export function App() {
  const { ready, settings, toast, openSession, mesos } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"] | "admin">("train");
  useEffect(() => { const h = (e: Event) => setTab((e as CustomEvent<"admin">).detail); window.addEventListener("ledger:tab", h); return () => window.removeEventListener("ledger:tab", h); }, []);
  const { phase, user } = useSync();
  useEffect(() => { if (user?.role === "coach" && !settings.onboarded) setTab("coach"); }, [user?.role, settings.onboarded]);
  useEffect(() => {
    setAfterPull(async () => { if (useSync.getState().user) await useStore.getState().init(); else useStore.getState().clear(); });
    if (!watchGoogleReturn((m) => useStore.getState().say(m))) void resume();
  }, []);
  useEffect(() => { if (ready) void syncMealcost(); }, [ready]);
  useEffect(() => { if (canUpdate) checkUpdate().then((u) => u && useStore.setState({ update: u })).catch(() => {}); }, []);
  useEffect(() => {
    const r = document.documentElement;
    if (settings.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", settings.theme);
    syncSystemBars(settings.theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); const on = () => syncSystemBars(settings.theme); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [settings.theme]);
  if (phase === "out") return <Auth />;
  if (phase === "booting" || !ready) return <div className="main"><h1>Ledger</h1><p className="sub">Loading your log</p></div>;
  const noProgram = !settings.onboarded || mesos.length === 0;
  if (noProgram && user?.role !== "coach") return <Welcome />;
  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand">Ledger</div>
        {TABS.filter((t) => t.id !== "coach" || user?.role === "coach").map(({ id, label, Icon }) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); if (id !== "train") useStore.getState().closeSession(); }}><Icon size={22} strokeWidth={2.2} />{label}</button>
        ))}
      </nav>
      <main className="main" id="main" data-open={openSession ? "1" : undefined}>
        <Boundary reset={tab}>{noProgram && ["train", "plan", "volume", "progress"].includes(tab) ? <Welcome /> : <>
          {tab === "train" && <Train />}{tab === "plan" && <Plan />}{tab === "volume" && <Volume />}{tab === "progress" && <Progress />}{tab === "coach" && <Coach />}{tab === "more" && <More />}{tab === "admin" && user?.admin && <Admin onBack={() => setTab("more")} />}</>}</Boundary>
      </main>
      <RestBar />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
