import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Activity, Brain, Compass, Gauge, Lock, Menu, Moon, Network, PlugZap, ScanSearch, ShieldCheck, ShoppingBag, Sparkles, Sun, Users } from "lucide-react";
import { useLab } from "./lib/store.tsx";
import { hasData } from "./lib/analysis.ts";
import Connect from "./sections/Connect.tsx";

const Overview = lazy(() => import("./sections/Overview.tsx"));
const Universe = lazy(() => import("./sections/Universe.tsx"));
const Footprint = lazy(() => import("./sections/Footprint.tsx"));
const Personality = lazy(() => import("./sections/Personality.tsx"));
const Segments = lazy(() => import("./sections/Segments.tsx"));
const Discovery = lazy(() => import("./sections/Discovery.tsx"));
const Recommendations = lazy(() => import("./sections/Recommendations.tsx"));
const Reality = lazy(() => import("./sections/Reality.tsx"));
const Privacy = lazy(() => import("./sections/Privacy.tsx"));

type Nav = { id: string; label: string; icon: ComponentType<{ size?: number }>; el: ComponentType; needsData: boolean };
const NAV: Nav[] = [
  { id: "overview", label: "Consumer Overview", icon: Gauge, el: Overview, needsData: true },
  { id: "universe", label: "Interest Universe", icon: Network, el: Universe, needsData: true },
  { id: "footprint", label: "Digital Footprint", icon: Activity, el: Footprint, needsData: true },
  { id: "personality", label: "Personality & Style", icon: Brain, el: Personality, needsData: true },
  { id: "segments", label: "Consumer Segments", icon: Users, el: Segments, needsData: true },
  { id: "discovery", label: "Product Discovery", icon: ScanSearch, el: Discovery, needsData: false },
  { id: "recommendations", label: "Recommendations", icon: ShoppingBag, el: Recommendations, needsData: true },
  { id: "reality", label: "AI vs. Reality", icon: Sparkles, el: Reality, needsData: true },
  { id: "privacy", label: "Data & Privacy", icon: ShieldCheck, el: Privacy, needsData: false },
];

const readHash = () => window.location.hash.replace(/^#\/?/, "") || "connect";

export default function App() {
  const { analysis, theme, toggleTheme, ready, sources } = useLab();
  const [route, setRoute] = useState(readHash());
  const [open, setOpen] = useState(false);
  const data = hasData(analysis);

  useEffect(() => { const f = () => { setRoute(readHash()); setOpen(false); window.scrollTo(0, 0); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (id: string) => { window.location.hash = `/${id}`; };

  const nav = NAV.find((n) => n.id === route);
  const blocked = nav?.needsData && !data;
  const Page = !nav || blocked ? Connect : nav.el;

  const item = (id: string, label: string, Icon: ComponentType<{ size?: number }>, locked = false) => (
    <button key={id} className={`nav-item ${(id === "connect" ? Page === Connect : route === id) ? "active" : ""}`} onClick={() => go(id)} title={locked ? "Connect or import your data first" : undefined} aria-current={route === id ? "page" : undefined}>
      <Icon size={16} /><span>{label}</span>{locked && <Lock size={12} className="lock" />}
    </button>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Sections">
        <div className="brand">
          <div className="brand-mark"><Compass size={18} /></div>
          <div><b>Consumer Lab</b><small>Private · runs in your browser</small></div>
        </div>
        {item("connect", data ? "Data Connections" : "Connect your data", PlugZap)}
        <div className="nav-label">Your profile</div>
        {NAV.slice(0, 5).map((n) => item(n.id, n.label, n.icon, n.needsData && !data))}
        <div className="nav-label">Shopping</div>
        {NAV.slice(5, 8).map((n) => item(n.id, n.label, n.icon, n.needsData && !data))}
        <div className="nav-label">Control</div>
        {item(NAV[8].id, NAV[8].label, NAV[8].icon)}
        <div className="side-foot">
          <div className="notice small" style={{ padding: "10px 12px" }}>
            <ShieldCheck size={16} style={{ flex: "none", color: "var(--good)" }} />
            <span>{data ? `${sources.length} source${sources.length === 1 ? "" : "s"} loaded in this tab. Nothing leaves your browser.` : "No personal data loaded. Nothing is uploaded — analysis runs locally."}</span>
          </div>
          <button className="btn ghost sm" onClick={toggleTheme} aria-label="Toggle colour theme">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar">
          <button className="btn sm" onClick={() => setOpen(!open)} aria-label="Open navigation"><Menu size={16} /></button>
          <b className="display">Consumer Lab</b>
        </div>
        <main className="main">
          {!ready ? <p className="muted">Loading data saved on this device…</p> : (
            <Suspense fallback={<p className="muted">Loading…</p>}>
              {blocked && <div className="notice warn" style={{ marginBottom: 16 }}><Lock size={16} /> “{nav!.label}” opens after you connect or import your own data. No insights are shown before real data is provided.</div>}
              <Page />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
