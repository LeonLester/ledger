import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarRange, Dumbbell, LogOut, Menu, Library as LibraryIcon, PanelLeftClose, PanelLeftOpen, Calculator, Ruler, Settings2, Shield, TrendingUp, Users, X } from "lucide-react";
import { useStore } from "../store";
import { Train } from "./Train";
import { Plan } from "./Plan";
import { Volume } from "./Volume";
import { Progress } from "./Progress";
import { More } from "./More";
import { Exercises, Machines } from "./Tools";
import { RepMax } from "./RepMax";
import { Welcome } from "./Programs";
import { canUpdate, checkUpdate, isNative, ringNow, scheduleRest, syncSystemBars } from "../native";
import { Auth } from "./Auth";
import { Landing } from "./Landing";
import { Component, type ReactNode } from "react";
import { Coach } from "./Coach";
import { logout, resume, setAfterPull, useSync, watchGoogleReturn } from "../sync";
import { syncMealcost } from "../mealcost";
import { Admin } from "./Admin";

const TABS = [
  { id: "train", label: "Train", Icon: Dumbbell }, { id: "plan", label: "Plan", Icon: CalendarRange },
  { id: "volume", label: "Volume", Icon: BarChart3 }, { id: "progress", label: "Progress", Icon: TrendingUp }, { id: "coach", label: "Clients", Icon: Users }, { id: "exercises", label: "Exercises", Icon: LibraryIcon, side: true }, { id: "machines", label: "Machines", Icon: Ruler, side: true }, { id: "repmax", label: "Rep max", Icon: Calculator, side: true }, { id: "more", label: "More", Icon: Settings2 },
] as readonly { id: string; label: string; Icon: typeof Dumbbell; side?: boolean }[];
type TabId = "train" | "plan" | "volume" | "progress" | "coach" | "exercises" | "machines" | "repmax" | "more";

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** The sidebar for phones: it slides in over the page from the menu button and holds the same places plus your account. */
function Drawer({ tab, onPick, onClose }: { tab: string; onPick: (t: string) => void; onClose: () => void }) {
  const { user } = useSync();
  const avatar = useStore((s) => s.avatar);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const items = [...TABS.filter((t) => t.id !== "coach" || user?.role === "coach").map(({ id, label, Icon }) => ({ id: id as string, label, Icon })), ...(user?.admin ? [{ id: "admin", label: "Admin", Icon: Shield }] : [])];
  return (
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="row between" style={{ padding: "0 6px 14px 12px" }}><div className="brand-m">Ledger</div><button className="btn ghost icon sm" onClick={onClose} aria-label="Close the menu"><X size={20} /></button></div>
        {items.map(({ id, label, Icon }) => (
          <button key={id} className="drawer-item" aria-current={tab === id ? "page" : undefined} onClick={() => onPick(id)}><Icon size={22} strokeWidth={2.2} /><span>{label}</span></button>
        ))}
        {user && (
          <div className="drawer-account">
            <button className="who" aria-label={`Account: ${user.name}`} onClick={() => onPick("more")}>
              {avatar ? <img className="avatar" src={avatar} alt="" /> : <span className="avatar" aria-hidden="true">{initials(user.name || user.email)}</span>}
              <span className="who-text"><b>{user.name}</b><span>{user.email}</span></span>
            </button>
            <button className="btn ghost icon sm" aria-label="Log out" title="Log out" onClick={() => confirm("Log out of this device?") && void logout()}><LogOut size={18} /></button>
          </div>
        )}
      </aside>
    </div>
  );
}

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
  const [tab, setTab] = useState<TabId | "admin">("train");
  /** signed-out visitors see the landing page first, unless they came from an invite or coach link, a login link, or the Android app */
  const landingOk = useMemo(() => {
    if (isNative) return false;
    try { return !/invite=|coach=|#login|#signup/.test(location.hash) && !sessionStorage.getItem("ledger.invite") && !sessionStorage.getItem("ledger.coach"); } catch { return true; }
  }, []);
  const [entry, setEntry] = useState<"login" | "signup" | null>(() => (landingOk ? null : /#signup|invite=|coach=/.test(location.hash) ? "signup" : "login"));
  useEffect(() => { const h = (e: Event) => setTab((e as CustomEvent<"admin">).detail); window.addEventListener("ledger:tab", h); return () => window.removeEventListener("ledger:tab", h); }, []);
  const { phase, user } = useSync();
  const avatar = useStore((s) => s.avatar);
  const [drawer, setDrawer] = useState(false);
  const [fabHidden, setFabHidden] = useState(false);
  useEffect(() => { let last = window.scrollY; const f = () => { const y = window.scrollY; setFabHidden(y > 90 && y > last); last = y; }; window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("ledger.nav") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("ledger.nav", collapsed ? "1" : "0"); } catch { /* storage blocked */ } }, [collapsed]);
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
  if (phase === "out") return entry ? <Auth initialMode={entry} onBack={landingOk ? () => setEntry(null) : undefined} /> : <Landing go={setEntry} />;
  if (phase === "booting" || !ready) return <div className="main"><h1>Ledger</h1><p className="sub">Loading your log</p></div>;
  const noProgram = !settings.onboarded || mesos.length === 0;
  if (noProgram && user?.role !== "coach") return <Welcome />;
  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <nav className="nav" aria-label="Main">
        <div className="nav-head">
          <div className="brand"><span className="brand-full">Ledger</span>{collapsed && "L"}</div>
          <button className="nav-toggle" aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
        </div>
        {TABS.filter((t) => t.id !== "coach" || user?.role === "coach").map(({ id, label, Icon }) => (
          <button key={id} className={TABS.find((t) => t.id === id)?.side ? "side-only" : undefined} aria-current={tab === id ? "page" : undefined} title={collapsed ? label : undefined} onClick={() => { setTab(id as TabId); if (id !== "train") useStore.getState().closeSession(); }}><Icon size={22} strokeWidth={2.2} /><span className="nav-label">{label}</span></button>
        ))}
        {user && (
          <div className="nav-extra nav-account">
            <button className="who" aria-label={`Account: ${user.name}`} title={collapsed ? `${user.name}, ${user.email}` : undefined} onClick={() => { setTab("more"); useStore.getState().closeSession(); }}>
              {avatar ? <img className="avatar" src={avatar} alt="" /> : <span className="avatar" aria-hidden="true">{initials(user.name || user.email)}</span>}
              <span className="who-text"><b>{user.name}</b><span>{user.email}</span></span>
            </button>
            <button className="nav-out" aria-label="Log out" title="Log out" onClick={() => confirm("Log out of this device?") && void logout()}><LogOut size={18} /></button>
          </div>
        )}
      </nav>
      {!openSession && <button className={`menu-fab ${fabHidden ? "away" : ""}`} aria-label="Open the menu" onClick={() => setDrawer(true)}><Menu size={20} /></button>}
      {drawer && <Drawer tab={tab} onClose={() => setDrawer(false)} onPick={(t) => { setTab(t as typeof tab); useStore.getState().closeSession(); setDrawer(false); }} />}
      <main className="main" id="main" data-open={openSession ? "1" : undefined}>
        <Boundary reset={tab}>{noProgram && ["train", "plan", "volume", "progress"].includes(tab) ? <Welcome /> : <>
          {tab === "train" && <Train />}{tab === "plan" && <Plan />}{tab === "volume" && <Volume />}{tab === "progress" && <Progress />}{tab === "coach" && <Coach />}{tab === "exercises" && <Exercises />}{tab === "machines" && <Machines />}{tab === "repmax" && <RepMax />}{tab === "more" && <More />}{tab === "admin" && user?.admin && <Admin onBack={() => setTab("more")} />}</>}</Boundary>
      </main>
      <RestBar />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
