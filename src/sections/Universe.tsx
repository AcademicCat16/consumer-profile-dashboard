import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { RotateCcw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import type { GNode, NodeType } from "../lib/graph.ts";
import { CATEGORY_COLORS } from "../lib/taxonomy.ts";
import { Card, Empty, Evidence, PageHead, fmtNum } from "../components/ui.tsx";

const PALETTE = ["#7c8cff", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#60a5fa", "#4ade80", "#f87171", "#2dd4bf", "#e879f9"];
const TYPE_COLORS: Record<NodeType, string> = { category: "#e8ecf8", site: "#7c8cff", brand: "#fbbf24", product: "#f472b6", term: "#22d3ee", inferred: "#34d399" };
const TYPE_LABEL: Record<NodeType, string> = { category: "Categories", site: "Sites", brand: "Brands", product: "Product interests", term: "Search terms", inferred: "Inferred segments" };
const ALL_TYPES = Object.keys(TYPE_LABEL) as NodeType[];

export default function Universe() {
  const { graph: data, theme } = useLab();
  const box = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const gRef = useRef<Graph | null>(null);
  const [types, setTypes] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [community, setCommunity] = useState<number | "all">("all");
  const [minWeight, setMinWeight] = useState(1);
  const [query, setQuery] = useState("");
  const [colorBy, setColorBy] = useState<"community" | "type">("community");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const state = useRef({ types, community, minWeight, query, selected, hovered, colorBy });
  state.current = { types, community, minWeight, query, selected, hovered, colorBy };

  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const maxW = useMemo(() => Math.max(1, ...data.nodes.map((n) => n.weight)), [data]);
  const comms = useMemo(() => {
    const m = new Map<number, GNode[]>();
    for (const n of data.nodes) m.set(n.community, [...(m.get(n.community) ?? []), n]);
    return [...m].map(([id, ns]) => ({ id, size: ns.length, top: ns.filter((n) => n.type !== "inferred").sort((a, b) => b.weight - a.weight).slice(0, 3).map((n) => n.label) })).sort((a, b) => b.size - a.size);
  }, [data]);

  // build graph + renderer
  useEffect(() => {
    if (!box.current || !data.nodes.length) return;
    const g = new Graph({ type: "undirected" });
    const nComm = Math.max(1, data.communities);
    data.nodes.forEach((n, i) => {
      const ang = (2 * Math.PI * n.community) / nComm + (i % 7) * 0.05;
      const r = 10 + (i % 13);
      g.addNode(n.id, { label: n.label, x: Math.cos(ang) * r + (i % 5), y: Math.sin(ang) * r + (i % 3), size: 3 + 14 * Math.sqrt(n.weight / maxW), ntype: n.type, community: n.community, weight: n.weight });
    });
    for (const e of data.edges) if (!g.hasEdge(e.source, e.target)) g.addEdge(e.source, e.target, { weight: e.weight, size: Math.min(4, 0.4 + Math.log2(1 + e.weight) * 0.45), kind: e.kind });
    forceAtlas2.assign(g, { iterations: 250, settings: { ...forceAtlas2.inferSettings(g), gravity: 1.2, scalingRatio: 6, barnesHutOptimize: g.order > 300 } });
    gRef.current = g;

    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--text").trim() || "#e8ecf8";
    const edgeColor = theme === "dark" ? "rgba(148,163,214,0.16)" : "rgba(30,41,80,0.13)";
    const renderer = new Sigma(g, box.current, {
      labelColor: { color: text }, labelFont: "Inter, system-ui, sans-serif", labelSize: 12, labelWeight: "500", labelDensity: 0.6, labelRenderedSizeThreshold: 7,
      defaultEdgeColor: edgeColor, zIndex: true, allowInvalidContainer: true,
      defaultDrawNodeHover: (ctx, d, settings) => {
        // compact hover label that respects the theme
        const label = d.label; if (!label) return;
        ctx.font = `600 12px ${settings.labelFont}`;
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = theme === "dark" ? "#111729" : "#ffffff"; ctx.strokeStyle = "rgba(124,140,255,0.6)";
        ctx.beginPath(); ctx.roundRect(d.x + d.size + 4, d.y - 11, w, 22, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.fillText(label, d.x + d.size + 10, d.y + 4);
      },
      nodeReducer: (node, attr) => {
        const s = state.current;
        const color = s.colorBy === "type" ? TYPE_COLORS[attr.ntype as NodeType] : attr.ntype === "category" ? CATEGORY_COLORS[attr.label as string] ?? PALETTE[attr.community % PALETTE.length] : PALETTE[(attr.community as number) % PALETTE.length];
        const res: Record<string, unknown> = { ...attr, color };
        const visible = s.types.has(attr.ntype as NodeType) && (s.community === "all" || attr.community === s.community) && (attr.weight as number) >= s.minWeight;
        if (!visible) { res.hidden = true; return res; }
        const focus = s.hovered ?? s.selected;
        if (focus && focus !== node && !g.areNeighbors(focus, node)) { res.color = theme === "dark" ? "#2a3150" : "#d5d9e8"; res.label = ""; res.zIndex = 0; }
        else if (focus) { res.zIndex = 1; res.forceLabel = true; }
        if (s.query && String(attr.label).toLowerCase().includes(s.query.toLowerCase())) { res.highlighted = true; res.forceLabel = true; }
        if (node === s.selected) res.highlighted = true;
        return res;
      },
      edgeReducer: (edge, attr) => {
        const s = state.current;
        const [a, b] = g.extremities(edge);
        const res: Record<string, unknown> = { ...attr };
        const focus = s.hovered ?? s.selected;
        if (focus && a !== focus && b !== focus) res.hidden = true;
        else if (focus) { res.color = theme === "dark" ? "rgba(124,140,255,0.6)" : "rgba(79,94,240,0.5)"; }
        return res;
      },
    });
    sigmaRef.current = renderer;

    // interactions: hover, click, drag
    let dragged: string | null = null, moved = false;
    renderer.on("enterNode", ({ node }) => setHovered(node));
    renderer.on("leaveNode", () => setHovered(null));
    renderer.on("clickNode", ({ node }) => { if (!moved) setSelected(node); });
    renderer.on("clickStage", () => setSelected(null));
    renderer.on("downNode", (e) => { dragged = e.node; moved = false; if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox()); });
    renderer.on("moveBody", ({ event }) => {
      if (!dragged) return;
      moved = true;
      const p = renderer.viewportToGraph(event);
      g.setNodeAttribute(dragged, "x", p.x); g.setNodeAttribute(dragged, "y", p.y);
      event.preventSigmaDefault(); event.original.preventDefault(); event.original.stopPropagation();
    });
    const up = () => { dragged = null; setTimeout(() => (moved = false), 0); };
    renderer.on("upNode", up); renderer.on("upStage", up);
    return () => { renderer.kill(); sigmaRef.current = null; gRef.current = null; };
  }, [data, theme, maxW]);

  useEffect(() => { sigmaRef.current?.refresh({ skipIndexation: true }); }, [types, community, minWeight, query, selected, hovered, colorBy]);

  const relayout = () => { const g = gRef.current; if (!g) return; forceAtlas2.assign(g, { iterations: 150, settings: { ...forceAtlas2.inferSettings(g), gravity: 1.2, scalingRatio: 6 } }); sigmaRef.current?.getCamera().animatedReset(); };
  const zoom = (f: number) => { const c = sigmaRef.current?.getCamera(); if (c) (f > 1 ? c.animatedZoom({ duration: 200 }) : c.animatedUnzoom({ duration: 200 })); };
  const findFirst = () => {
    const n = data.nodes.find((x) => x.label.toLowerCase().includes(query.toLowerCase()));
    const r = sigmaRef.current; if (!n || !r) return;
    setSelected(n.id);
    const d = r.getNodeDisplayData(n.id); if (d) r.getCamera().animate({ x: d.x, y: d.y, ratio: 0.4 }, { duration: 400 });
  };

  if (!data.nodes.length) return (<><PageHead title="Interest Universe" /><Empty title="Not enough connected records yet">The network needs sites visited at least twice. Import more history to see it.</Empty></>);

  const sel = selected ? byId.get(selected) : undefined;
  const neighbours = sel ? data.edges.filter((e) => e.source === sel.id || e.target === sel.id).map((e) => ({ e, other: byId.get(e.source === sel.id ? e.target : e.source)! })).filter((x) => x.other).sort((a, b) => b.e.weight - a.e.weight) : [];
  const toggle = (t: NodeType) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  return (
    <>
      <PageHead title="Interest Universe" intro={<>A network of your sites, categories, brands, product interests and search terms. {fmtNum(data.nodes.length)} nodes, {fmtNum(data.edges.length)} links and {data.communities} communities, found with Louvain clustering. Links mean “visited in the same session at least twice”, “brand seen on”, “searched for” and similar. Click any node to see the records behind it.</>} />
      <div className="side-layout">
        <div style={{ minWidth: 0 }}>
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div className="row" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6, flex: "1 1 260px", flexWrap: "nowrap" }}>
                <Search size={15} className="faint" />
                <input className="input" style={{ flex: 1 }} placeholder="Search nodes…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findFirst()} aria-label="Search nodes" />
              </div>
              <select className="input" value={community} onChange={(e) => setCommunity(e.target.value === "all" ? "all" : +e.target.value)} aria-label="Community filter">
                <option value="all">All communities</option>
                {comms.map((c) => <option key={c.id} value={c.id}>Community {c.id + 1}: {c.top.join(", ")}</option>)}
              </select>
              <select className="input" value={colorBy} onChange={(e) => setColorBy(e.target.value as "community" | "type")} aria-label="Colour by">
                <option value="community">Colour by community</option><option value="type">Colour by node type</option>
              </select>
              <label className="row small muted" style={{ gap: 6 }}>Min weight <input type="range" min={1} max={Math.max(2, Math.min(50, Math.round(maxW / 4)))} value={minWeight} onChange={(e) => setMinWeight(+e.target.value)} /> <span className="mono">{minWeight}</span></label>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              {ALL_TYPES.map((t) => <button key={t} className={`chip ${types.has(t) ? "on" : ""}`} onClick={() => toggle(t)} aria-pressed={types.has(t)}><span className="legend-dot" style={{ background: TYPE_COLORS[t] }} />{TYPE_LABEL[t]} ({data.nodes.filter((n) => n.type === t).length})</button>)}
            </div>
          </div>
          <div className="graph-wrap">
            <div ref={box} className="sigma-container" data-testid="universe-canvas" />
            <div style={{ position: "absolute", right: 10, top: 10, display: "flex", flexDirection: "column", gap: 6, zIndex: 2 }}>
              <button className="btn sm" onClick={() => zoom(1.5)} aria-label="Zoom in"><ZoomIn size={14} /></button>
              <button className="btn sm" onClick={() => zoom(0.67)} aria-label="Zoom out"><ZoomOut size={14} /></button>
              <button className="btn sm" onClick={relayout} aria-label="Re-run layout"><RotateCcw size={14} /></button>
            </div>
            <div className="small faint" style={{ position: "absolute", left: 12, bottom: 10, zIndex: 2 }}>Drag nodes · scroll to zoom · click for evidence</div>
          </div>
        </div>
        <Card title={sel ? sel.label : "Node evidence"} sub={sel ? `${TYPE_LABEL[sel.type].replace(/s$/, "")} · community ${sel.community + 1}` : "Select a node in the network."}>
          {sel ? (
            <>
              <p className="small" style={{ marginTop: 0 }}>{sel.detail}</p>
              {sel.type === "inferred" && <p className="small notice warn">This node is an inference, not a record. It links to the categories its rule uses.</p>}
              <Evidence ids={sel.evidence} label="Records behind this node" />
              <div className="hr" />
              <div className="small faint" style={{ marginBottom: 6 }}>Strongest links</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                {neighbours.slice(0, 15).map(({ e, other }) => (
                  <div key={other.id} className="small">
                    <button className="chip" onClick={() => setSelected(other.id)}>{other.label}</button> <span className="faint">{e.kind} · weight {e.weight}</span>
                    {e.evidence.length > 0 && <Evidence ids={e.evidence} limit={4} label="Why linked" />}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comms.slice(0, 8).map((c) => (
                <button key={c.id} className="nav-item" style={{ padding: 8, alignItems: "flex-start" }} onClick={() => setCommunity(community === c.id ? "all" : c.id)}>
                  <span className="legend-dot" style={{ background: PALETTE[c.id % PALETTE.length], marginTop: 5 }} />
                  <span><b style={{ color: "var(--text)" }}>Community {c.id + 1}</b> <span className="faint">· {c.size} nodes</span><br /><span className="small">{c.top.join(" · ")}</span></span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
