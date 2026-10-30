import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { useLab } from "../lib/store.tsx";
import type { Analysis } from "../lib/analysis.ts";
import { CATEGORY_COLORS } from "../lib/taxonomy.ts";
import { Card, HBar, PageHead, fmtNum } from "../components/ui.tsx";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Shared tooltip for the D3 charts. */
const useTip = () => {
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const el = tip ? <div className="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: tip.y + 14 }} dangerouslySetInnerHTML={{ __html: tip.html }} /> : null;
  return { show: (e: MouseEvent, html: string) => setTip({ x: e.clientX, y: e.clientY, html }), hide: () => setTip(null), el };
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const useWidth = (ref: React.RefObject<HTMLDivElement | null>) => {
  const [w, setW] = useState(800);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width))); ro.observe(ref.current); return () => ro.disconnect(); }, [ref]);
  return w;
};

function Stream({ a, tip }: { a: Analysis; tip: ReturnType<typeof useTip> }) {
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const w = useWidth(wrap);
  const [mode, setMode] = useState<"wiggle" | "expand">("wiggle");
  useEffect(() => {
    const s = d3.select(svg.current); s.selectAll("*").remove();
    const weeks = a.weekly; if (weeks.length < 2) return;
    const top = a.categories.slice(0, 8).map((c) => c.category as string);
    const keys = [...top, "Other categories"];
    const rows = weeks.map((wk) => { const r: Record<string, number> = { start: wk.start }; let other = 0; for (const [k, v] of Object.entries(wk.byCategory)) if (top.includes(k)) r[k] = v; else other += v; r["Other categories"] = other; for (const k of top) r[k] ??= 0; return r; });
    const H = 300, M = { t: 10, r: 18, b: 26, l: 24 };
    const stack = d3.stack<Record<string, number>>().keys(keys).offset(mode === "wiggle" ? d3.stackOffsetWiggle : d3.stackOffsetExpand).order(d3.stackOrderInsideOut);
    const series = stack(rows);
    const x = d3.scaleTime().domain(d3.extent(rows, (r) => r.start) as [number, number]).range([M.l, w - M.r]);
    const y = d3.scaleLinear().domain([d3.min(series, (l) => d3.min(l, (d) => d[0]))!, d3.max(series, (l) => d3.max(l, (d) => d[1]))!]).range([H - M.b, M.t]);
    const area = d3.area<d3.SeriesPoint<Record<string, number>>>().x((d) => x(d.data.start)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveBasis);
    s.attr("viewBox", `0 0 ${w} ${H}`).attr("width", w).attr("height", H);
    s.append("g").selectAll("path").data(series).join("path").attr("d", area).attr("fill", (d) => CATEGORY_COLORS[d.key] ?? "#64748b").attr("opacity", 0.85).attr("stroke", "var(--bg)").attr("stroke-width", 0.5)
      .on("mousemove", (e: MouseEvent, d) => { const t = x.invert(d3.pointer(e)[0]).getTime(); const i = d3.bisector((r: Record<string, number>) => r.start).center(rows, t); tip.show(e, `<b>${esc(d.key)}</b><br/>Week of ${new Date(rows[i].start).toLocaleDateString()}: ${rows[i][d.key]} visits`); })
      .on("mouseleave", tip.hide);
    s.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(Math.min(10, Math.floor(w / 90))).tickSizeOuter(0));
  }, [a, w, mode, tip]);
  return (
    <Card title="Attention over time" sub="Weekly visits by category (streamgraph). Width is the visit count; switch to 100% to compare shares." right={<div className="row" style={{ gap: 6 }}><button className={`chip ${mode === "wiggle" ? "on" : ""}`} onClick={() => setMode("wiggle")}>Volume</button><button className={`chip ${mode === "expand" ? "on" : ""}`} onClick={() => setMode("expand")}>100%</button></div>}>
      <div ref={wrap} className="viz">{a.weekly.length < 2 ? <p className="muted small">Needs at least two weeks of history.</p> : <svg ref={svg} data-testid="streamgraph" />}</div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>{a.categories.slice(0, 8).map((c) => <span key={c.category} className="chip"><span className="legend-dot" style={{ background: CATEGORY_COLORS[c.category] }} />{c.category}</span>)}</div>
    </Card>
  );
}

function Clock({ a, tip }: { a: Analysis; tip: ReturnType<typeof useTip> }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const s = d3.select(svg.current); s.selectAll("*").remove();
    const S = 380, R = S / 2, inner = 48, ring = (R - inner - 26) / 7;
    const max = d3.max(a.hourly.flat()) || 1;
    const color = d3.scaleSequential(d3.interpolatePlasma).domain([0, max]);
    s.attr("viewBox", `0 0 ${S} ${S}`);
    const g = s.append("g").attr("transform", `translate(${R},${R})`);
    const arc = d3.arc<{ d: number; h: number }>().innerRadius((c) => inner + c.d * ring).outerRadius((c) => inner + (c.d + 1) * ring - 1).startAngle((c) => (c.h / 24) * 2 * Math.PI + 0.004).endAngle((c) => ((c.h + 1) / 24) * 2 * Math.PI - 0.004);
    const cells = a.hourly.flatMap((row, d) => row.map((n, h) => ({ d, h, n })));
    g.selectAll("path").data(cells).join("path").attr("d", arc).attr("fill", (c) => (c.n ? color(c.n) : "var(--panel-2)"))
      .on("mousemove", (e: MouseEvent, c) => tip.show(e, `<b>${DAYS[c.d]} ${String(c.h).padStart(2, "0")}:00–${String(c.h + 1).padStart(2, "0")}:00</b><br/>${c.n} visits`)).on("mouseleave", tip.hide);
    for (const h of [0, 6, 12, 18]) { const ang = (h / 24) * 2 * Math.PI - Math.PI / 2; g.append("text").attr("x", Math.cos(ang) * (R - 12)).attr("y", Math.sin(ang) * (R - 12) + 4).attr("text-anchor", "middle").text(`${String(h).padStart(2, "0")}h`); }
    const total = d3.sum(cells, (c) => c.n);
    const peak = cells.reduce((m, c) => (c.n > m.n ? c : m), cells[0]);
    g.append("text").attr("text-anchor", "middle").attr("y", -4).style("font-size", "11px").text("peak");
    g.append("text").attr("text-anchor", "middle").attr("y", 12).style("font-size", "13px").style("fill", "var(--text)").style("font-weight", "600").text(total ? `${DAYS[peak.d]} ${peak.h}h` : "—");
  }, [a, tip]);
  return (
    <Card title="Weekly rhythm" sub="Radial clock: 24 hours around, Sunday (inner ring) to Saturday (outer ring), coloured by visit count in your local time.">
      <div className="viz" style={{ maxWidth: 400, margin: "0 auto" }}><svg ref={svg} data-testid="radial-clock" /></div>
    </Card>
  );
}

function Calendar({ a, tip }: { a: Analysis; tip: ReturnType<typeof useTip> }) {
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const w = useWidth(wrap);
  useEffect(() => {
    const s = d3.select(svg.current); s.selectAll("*").remove();
    if (!a.counts.last) return;
    const end = d3.timeDay.floor(new Date(a.counts.last));
    const start = d3.timeDay.offset(end, -364);
    const days = d3.timeDays(d3.timeWeek.floor(start), d3.timeDay.offset(end, 1));
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const max = d3.max(days, (d) => a.daily.get(key(d)) ?? 0) || 1;
    const weeks = d3.timeWeek.count(days[0], end) + 1;
    const cell = Math.max(6, Math.min(16, Math.floor((w - 30) / weeks)));
    const H = cell * 7 + 24;
    const color = d3.scaleSequential(d3.interpolateViridis).domain([0, Math.sqrt(max)]);
    s.attr("viewBox", `0 0 ${30 + weeks * cell} ${H}`).attr("width", 30 + weeks * cell).attr("height", H);
    const g = s.append("g").attr("transform", "translate(28,18)");
    g.selectAll("rect").data(days).join("rect").attr("x", (d) => d3.timeWeek.count(days[0], d) * cell).attr("y", (d) => d.getDay() * cell).attr("width", cell - 2).attr("height", cell - 2).attr("rx", 2)
      .attr("fill", (d) => { const n = a.daily.get(key(d)) ?? 0; return d < start ? "transparent" : n ? color(Math.sqrt(n)) : "var(--panel-2)"; })
      .on("mousemove", (e: MouseEvent, d) => tip.show(e, `<b>${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</b><br/>${a.daily.get(key(d)) ?? 0} visits`)).on("mouseleave", tip.hide);
    [1, 3, 5].forEach((d) => g.append("text").attr("x", -6).attr("y", d * cell + cell / 2 + 3).attr("text-anchor", "end").style("font-size", "9px").text(DAYS[d]));
    d3.timeMonths(start, end).forEach((m) => g.append("text").attr("x", d3.timeWeek.count(days[0], m) * cell).attr("y", -6).style("font-size", "10px").text(d3.timeFormat("%b")(m)));
  }, [a, w, tip]);
  return (
    <Card title="Activity calendar" sub={`Daily visits over the 365 days ending ${a.counts.last ? new Date(a.counts.last).toLocaleDateString() : "—"} (${fmtNum(a.counts.activeDays)} active days).`}>
      <div ref={wrap} className="viz scroll-x"><svg ref={svg} data-testid="calendar" /></div>
    </Card>
  );
}

function Flows({ a, tip }: { a: Analysis; tip: ReturnType<typeof useTip> }) {
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const w = useWidth(wrap);
  const links = useMemo(() => a.transitions.slice(0, 30), [a]);
  useEffect(() => {
    const s = d3.select(svg.current); s.selectAll("*").remove();
    if (!links.length) return;
    const H = 420;
    const names = [...new Set(links.flatMap((l) => [`${l.from} ▸`, `▸ ${l.to}`]))];
    const graph = sankey<{ name: string }, { source: number; target: number; value: number }>().nodeWidth(12).nodePadding(10).extent([[150, 10], [w - 150, H - 10]])({
      nodes: names.map((name) => ({ name })),
      links: links.map((l) => ({ source: names.indexOf(`${l.from} ▸`), target: names.indexOf(`▸ ${l.to}`), value: l.count })),
    });
    s.attr("viewBox", `0 0 ${w} ${H}`).attr("width", w).attr("height", H);
    const cat = (n: string) => n.replace(/^▸ | ▸$/g, "");
    s.append("g").attr("fill", "none").selectAll("path").data(graph.links).join("path").attr("d", sankeyLinkHorizontal()).attr("stroke", (l) => CATEGORY_COLORS[cat((l.source as { name: string }).name)] ?? "#64748b").attr("stroke-opacity", 0.35).attr("stroke-width", (l) => Math.max(1, l.width ?? 1))
      .on("mousemove", (e: MouseEvent, l) => tip.show(e, `${esc(cat((l.source as { name: string }).name))} → ${esc(cat((l.target as { name: string }).name))}<br/><b>${l.value}</b> consecutive moves within a session`)).on("mouseleave", tip.hide);
    const node = s.append("g").selectAll("g").data(graph.nodes).join("g");
    node.append("rect").attr("x", (d) => d.x0!).attr("y", (d) => d.y0!).attr("width", (d) => d.x1! - d.x0!).attr("height", (d) => Math.max(1, d.y1! - d.y0!)).attr("rx", 2).attr("fill", (d) => CATEGORY_COLORS[cat(d.name)] ?? "#64748b");
    node.append("text").attr("x", (d) => (d.x0! < w / 2 ? d.x0! - 6 : d.x1! + 6)).attr("y", (d) => (d.y0! + d.y1!) / 2 + 4).attr("text-anchor", (d) => (d.x0! < w / 2 ? "end" : "start")).text((d) => cat(d.name));
  }, [links, w, tip]);
  return (
    <Card title="Category flows" sub="Where you go next: consecutive moves between categories within a browsing session (top 30 flows). Left = from, right = to.">
      <div ref={wrap} className="viz">{links.length ? <svg ref={svg} data-testid="sankey" /> : <p className="muted small">No category changes within sessions yet.</p>}</div>
    </Card>
  );
}

function Rhythm({ a }: { a: Analysis }) {
  const byDay = a.hourly.map((row) => row.reduce((s, n) => s + n, 0));
  const buckets = [["1 visit", 1, 1], ["2–5 visits", 2, 5], ["6–10 visits", 6, 10], ["11–20 visits", 11, 20], ["21+ visits", 21, Infinity]] as const;
  const lens = buckets.map(([label, lo, hi]) => ({ label, value: a.sessions.filter((s) => s.visits.length >= lo && s.visits.length <= hi).length }));
  return (
    <Card title="Days and sessions" sub="Visits by weekday, and how many pages a session usually spans.">
      <HBar items={DAYS.map((d, i) => ({ label: d, value: byDay[i] }))} color="var(--accent-2)" />
      <div className="hr" />
      <HBar items={lens} />
    </Card>
  );
}

export default function Footprint() {
  const { analysis: a } = useLab();
  const tip = useTip();
  const tipStable = useMemo(() => ({ show: tip.show, hide: tip.hide, el: null }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const sessions = a.sessions;
  const avgLen = sessions.length ? d3.mean(sessions, (s) => s.visits.length)! : 0;
  const medMin = sessions.length ? d3.median(sessions, (s) => (s.end - s.start) / 60000)! : 0;
  return (
    <>
      <PageHead title="Digital Footprint" intro={<>Observed patterns only: when you browse, how your attention moves between categories, and how it changes over time. {fmtNum(sessions.length)} sessions (a new session starts after 30 idle minutes), averaging {avgLen.toFixed(1)} visits, with a median length of {medMin.toFixed(0)} minutes.</>} />
      <div className="grid" style={{ gap: 16 }}>
        <Stream a={a} tip={tipStable} />
        <Calendar a={a} tip={tipStable} />
        <div className="grid g2"><Clock a={a} tip={tipStable} /><Rhythm a={a} /></div>
        <Flows a={a} tip={tipStable} />
      </div>
      {tip.el}
    </>
  );
}
