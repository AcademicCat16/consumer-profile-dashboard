/**
 * Builds the Interest Universe network from the user's analysed records.
 * Every node and edge keeps the ids of the records that justify it, so the UI can show real evidence.
 */
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { Analysis } from "./analysis.ts";
import type { Segment } from "./segments.ts";

export type NodeType = "site" | "category" | "brand" | "product" | "term" | "inferred";
export interface GNode { id: string; label: string; type: NodeType; weight: number; category?: string; community: number; evidence: string[]; detail: string }
export interface GEdge { source: string; target: string; weight: number; kind: string; evidence: string[] }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; communities: number }

export const buildGraph = (a: Analysis, segments: Segment[] = [], limits = { sites: 70, brands: 30, products: 12, terms: 25, coEdges: 300 }): GraphData => {
  const nodes = new Map<string, GNode>();
  const edges = new Map<string, GEdge>();
  const addNode = (n: Omit<GNode, "community">) => { if (!nodes.has(n.id)) nodes.set(n.id, { ...n, community: 0 }); return nodes.get(n.id)!; };
  const addEdge = (s: string, t: string, w: number, kind: string, ev: string[] = []) => {
    if (s === t || !nodes.has(s) || !nodes.has(t)) return;
    const k = s < t ? `${s}|${t}` : `${t}|${s}`;
    const e = edges.get(k) ?? { source: s, target: t, weight: 0, kind, evidence: [] };
    e.weight += w; for (const x of ev) if (e.evidence.length < 12 && !e.evidence.includes(x)) e.evidence.push(x);
    edges.set(k, e);
  };

  const topSites = a.sites.filter((s) => s.visits >= 2).slice(0, limits.sites);
  const siteSet = new Set(topSites.map((s) => s.site));
  const visitIdsBySite = new Map<string, string[]>();
  for (const v of a.visits) if (siteSet.has(v.site)) { const l = visitIdsBySite.get(v.site) ?? []; if (l.length < 30) l.push(v.id); visitIdsBySite.set(v.site, l); }

  for (const c of a.categories.filter((c) => c.visits > 0)) addNode({ id: `cat:${c.category}`, label: c.category, type: "category", weight: c.visits, category: c.category, evidence: [], detail: `${c.visits} visits across ${c.sites} sites (${(c.share * 100).toFixed(1)}% of analysed visits).` });
  for (const s of topSites) {
    addNode({ id: `site:${s.site}`, label: s.site, type: "site", weight: s.visits, category: s.category, evidence: visitIdsBySite.get(s.site) ?? [], detail: `${s.visits} visits on ${s.activeDays} days; first ${new Date(s.first).toLocaleDateString()}, last ${new Date(s.last).toLocaleDateString()}.` });
    addEdge(`site:${s.site}`, `cat:${s.category}`, s.visits, "belongs to", (visitIdsBySite.get(s.site) ?? []).slice(0, 5));
  }

  // co-occurrence within sessions
  const co = new Map<string, { n: number; ev: string[] }>();
  for (const sess of a.sessions) {
    const ss = sess.sites.filter((x) => siteSet.has(x));
    for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) {
      const k = ss[i] < ss[j] ? `${ss[i]}|${ss[j]}` : `${ss[j]}|${ss[i]}`;
      const c = co.get(k) ?? { n: 0, ev: [] }; c.n++;
      if (c.ev.length < 6) { const vi = sess.visits.find((x) => a.visits[x].site === ss[i]); const vj = sess.visits.find((x) => a.visits[x].site === ss[j]); if (vi != null && vj != null) c.ev.push(a.visits[vi].id, a.visits[vj].id); }
      co.set(k, c);
    }
  }
  [...co].filter(([, c]) => c.n >= 2).sort((x, y) => y[1].n - x[1].n).slice(0, limits.coEdges)
    .forEach(([k, c]) => { const [x, y] = k.split("|"); addEdge(`site:${x}`, `site:${y}`, c.n, "same session", c.ev); });

  for (const b of a.brands.filter((b) => b.count >= 2).slice(0, limits.brands)) {
    addNode({ id: `brand:${b.name}`, label: b.name, type: "brand", weight: b.count, evidence: b.evidence, detail: `Mentioned ${b.count} time(s) in your records.` });
    for (const v of a.visits) if (v.brands.includes(b.name) && siteSet.has(v.site)) addEdge(`brand:${b.name}`, `site:${v.site}`, 1, "brand seen on", [v.id]);
  }
  for (const p of a.productInterests.filter((p) => p.count >= 2).slice(0, limits.products)) {
    addNode({ id: `prod:${p.name}`, label: p.name, type: "product", weight: p.count, evidence: p.evidence, detail: `Product-category interest seen ${p.count} time(s).` });
    for (const v of a.visits) if (v.productCategory === p.name && siteSet.has(v.site)) addEdge(`prod:${p.name}`, `site:${v.site}`, 1, "product seen on", [v.id]);
    addEdge(`prod:${p.name}`, "cat:Shopping", p.count, "shopping interest", p.evidence.slice(0, 4));
  }
  for (const t of a.queryTerms.filter((t) => t.count >= 3).slice(0, limits.terms)) {
    addNode({ id: `term:${t.name}`, label: `“${t.name}”`, type: "term", weight: t.count, evidence: t.evidence, detail: `Appears in ${t.count} of your searches.` });
    for (const s of a.searches) if (s.query.toLowerCase().includes(t.name)) {
      if (s.category) addEdge(`term:${t.name}`, `cat:${s.category}`, 1, "searched in", [s.id]);
      if (s.productCategory) addEdge(`term:${t.name}`, `prod:${s.productCategory}`, 1, "searched for", [s.id]);
    }
  }
  for (const seg of segments.filter((s) => s.membership === "Strong" || s.membership === "Moderate")) {
    addNode({ id: `inf:${seg.id}`, label: seg.name, type: "inferred", weight: seg.membership === "Strong" ? 40 : 25, evidence: [], detail: `Inferred segment (${seg.membership}). ${seg.reasons.join(" ")}` });
    for (const sig of seg.signals) addEdge(`inf:${seg.id}`, `cat:${sig}`, 5, "inferred from");
  }
  // drop isolated nodes
  const linked = new Set<string>(); for (const e of edges.values()) { linked.add(e.source); linked.add(e.target); }
  for (const id of [...nodes.keys()]) if (!linked.has(id)) nodes.delete(id);

  // community detection (Louvain, weighted)
  let communities = 0;
  if (nodes.size > 2 && edges.size > 0) {
    const g = new Graph({ type: "undirected" });
    for (const n of nodes.values()) g.addNode(n.id);
    for (const e of edges.values()) g.mergeEdge(e.source, e.target, { weight: e.weight });
    const comm = louvain(g, { getEdgeWeight: "weight", rng: seeded(42) });
    for (const [id, c] of Object.entries(comm)) nodes.get(id)!.community = c as number;
    communities = new Set(Object.values(comm)).size;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], communities };
};

/** Deterministic RNG so the same data always gives the same clusters. */
const seeded = (s: number) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
