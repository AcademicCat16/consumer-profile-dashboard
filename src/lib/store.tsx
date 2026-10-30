/**
 * Application state. Records live in memory only, unless you switch on "Keep data on this device"
 * (IndexedDB in this browser; never uploaded). Nothing here talks to a server.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Dataset, Feedback, Source, SourceKind } from "./types.ts";
import { emptyDataset } from "./types.ts";
import { analyze, hasData } from "./analysis.ts";
import type { Analysis } from "./analysis.ts";
import { computeTraits } from "./traits.ts";
import type { Trait } from "./traits.ts";
import { computeSegments } from "./segments.ts";
import type { Segment } from "./segments.ts";
import { rankProducts } from "./recommend.ts";
import type { Ranked } from "./recommend.ts";
import { buildGraph } from "./graph.ts";
import type { GraphData } from "./graph.ts";

export interface RecordRef { id: string; kind: "visit" | "search" | "conversation" | "purchase" | "product"; title: string; url?: string; time: number | null; detail?: string }
type Stored = { sources: Source[]; data: Record<string, Dataset>; deleted: string[]; feedback: Record<string, Feedback> };

interface Ctx {
  sources: Source[];
  dataset: Dataset;
  analysis: Analysis;
  traits: Trait[];
  segments: Segment[];
  ranked: Ranked[];
  graph: GraphData;
  ready: boolean;
  feedback: Record<string, Feedback>;
  setFeedback: (key: string, f: Feedback | null) => void;
  addSource: (kind: SourceKind, label: string, data: Partial<Dataset>) => Source;
  removeSource: (id: string) => void;
  deleteRecord: (id: string) => void;
  deleteAll: () => Promise<void>;
  record: (id: string) => RecordRef | undefined;
  persist: boolean;
  setPersist: (on: boolean) => Promise<void>;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const C = createContext<Ctx | null>(null);
export const useLab = () => { const c = useContext(C); if (!c) throw new Error("useLab outside provider"); return c; };

const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } } };

// ---- minimal IndexedDB helpers (opt-in persistence only) ----
const DB = "consumer-lab", STORE = "state", KEY = "v1";
const openDb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbPut = async (v: Stored) => { const db = await openDb(); await new Promise<void>((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); db.close(); };
const idbGet = async (): Promise<Stored | undefined> => { const db = await openDb(); const v = await new Promise<Stored | undefined>((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res(r.result as Stored | undefined); r.onerror = () => rej(r.error); }); db.close(); return v; };
const idbDrop = () => new Promise<void>((res) => { try { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });

let seq = 0;
const newId = () => `src${Date.now().toString(36)}${(seq++).toString(36)}`;

export const LabProvider = ({ children }: { children: ReactNode }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [data, setData] = useState<Record<string, Dataset>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [feedback, setFb] = useState<Record<string, Feedback>>({});
  const [persist, setPersistState] = useState(ls.get("cl-persist") === "1");
  const [ready, setReady] = useState(!persist);
  const [theme, setTheme] = useState<"dark" | "light">(ls.get("cl-theme") === "light" ? "light" : "dark");

  useEffect(() => { document.documentElement.dataset.theme = theme; ls.set("cl-theme", theme); }, [theme]);

  // restore only when the user previously opted in
  useEffect(() => {
    if (!persist) return;
    idbGet().then((s) => { if (s) { setSources(s.sources); setData(s.data); setDeleted(new Set(s.deleted)); setFb(s.feedback); } }).catch(() => undefined).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (persist && ready) idbPut({ sources, data, deleted: [...deleted], feedback }).catch(() => undefined); }, [persist, ready, sources, data, deleted, feedback]);

  const dataset = useMemo<Dataset>(() => {
    const out = emptyDataset();
    for (const s of sources) {
      const d = data[s.id]; if (!d) continue;
      out.visits.push(...d.visits.filter((x) => !deleted.has(x.id)));
      out.searches.push(...d.searches.filter((x) => !deleted.has(x.id)));
      out.conversations.push(...d.conversations.filter((x) => !deleted.has(x.id)));
      out.purchases.push(...d.purchases.filter((x) => !deleted.has(x.id)));
      out.products.push(...d.products.filter((x) => !deleted.has(x.id)));
    }
    return out;
  }, [sources, data, deleted]);

  // Raw analysis, then remove interests the user rejected so every downstream view reflects the correction.
  const analysis = useMemo(() => {
    const a = analyze(dataset);
    a.searches = a.searches.filter((s) => !deleted.has(s.id));
    a.brands = a.brands.filter((b) => feedback[`brand:${b.name}`] !== "inaccurate");
    a.productInterests = a.productInterests.filter((p) => feedback[`prod:${p.name}`] !== "inaccurate");
    return a;
  }, [dataset, deleted, feedback]);
  const traits = useMemo(() => computeTraits(analysis), [analysis]);
  const segments = useMemo(() => computeSegments(analysis, traits, feedback).map((s) => feedback[`seg:${s.id}`] === "inaccurate" && s.membership !== "Suppressed by your feedback" ? { ...s, membership: "Suppressed by your feedback" as const, reasons: ["You marked this segment as inaccurate.", ...s.reasons] } : s), [analysis, traits, feedback]);
  const ranked = useMemo(() => rankProducts(dataset.products, analysis, traits, feedback), [dataset.products, analysis, traits, feedback]);
  const graph = useMemo(() => (hasData(analysis) ? buildGraph(analysis, segments) : { nodes: [], edges: [], communities: 0 }), [analysis, segments]);

  const index = useMemo(() => {
    const m = new Map<string, RecordRef>();
    for (const v of dataset.visits) m.set(v.id, { id: v.id, kind: "visit", title: v.title || v.url, url: v.url, time: v.time });
    for (const s of analysis.searches) m.set(s.id, { id: s.id, kind: "search", title: s.query, url: s.url, time: s.time, detail: s.engine });
    for (const c of dataset.conversations) m.set(c.id, { id: c.id, kind: "conversation", title: c.title, time: c.time, detail: `${c.messageCount} of your messages` });
    for (const p of dataset.purchases) m.set(p.id, { id: p.id, kind: "purchase", title: p.product, time: p.time, detail: [p.store, p.price != null ? `${p.price}${p.currency ? " " + p.currency : ""}` : ""].filter(Boolean).join(" · ") });
    for (const p of dataset.products) m.set(p.id, { id: p.id, kind: "product", title: p.name, url: p.url, time: p.capturedAt ? Date.parse(p.capturedAt) : null, detail: p.retailer });
    return m;
  }, [dataset, analysis.searches]);
  const record = useCallback((id: string) => index.get(id), [index]);

  const addSource = useCallback((kind: SourceKind, label: string, d: Partial<Dataset>) => {
    const full: Dataset = { ...emptyDataset(), ...d };
    const counts: Record<string, number> = {};
    for (const k of ["visits", "searches", "conversations", "purchases", "products"] as const) if (full[k].length) counts[k] = full[k].length;
    const id = newId();
    // re-key records so ids are unique across sources
    const rekey = <T extends { id: string; sourceId: string }>(xs: T[]) => xs.map((x, i) => ({ ...x, id: `${id}:${x.id.split(":").slice(1).join(":") || i}`, sourceId: id }));
    const src: Source = { id, kind, label, importedAt: Date.now(), counts };
    setData((m) => ({ ...m, [id]: { visits: rekey(full.visits), searches: rekey(full.searches), conversations: rekey(full.conversations), purchases: rekey(full.purchases), products: rekey(full.products) } }));
    setSources((s) => [...s, src]);
    return src;
  }, []);
  const removeSource = useCallback((id: string) => { setSources((s) => s.filter((x) => x.id !== id)); setData((m) => { const n = { ...m }; delete n[id]; return n; }); }, []);
  const deleteRecord = useCallback((id: string) => {
    setDeleted((d) => new Set(d).add(id));
    // a search derived from a visit URL disappears with its visit; deleting the search alone hides only the search
  }, []);
  const deleteAll = useCallback(async () => { setSources([]); setData({}); setDeleted(new Set()); setFb({}); await idbDrop(); }, []);
  const setFeedback = useCallback((key: string, f: Feedback | null) => setFb((m) => { const n = { ...m }; if (f) n[key] = f; else delete n[key]; return n; }), []);
  const setPersist = useCallback(async (on: boolean) => {
    setPersistState(on); ls.set("cl-persist", on ? "1" : null);
    if (!on) await idbDrop();
  }, []);

  const value: Ctx = { sources, dataset, analysis, traits, segments, ranked, graph, ready, feedback, setFeedback, addSource, removeSource, deleteRecord, deleteAll, record, persist, setPersist, theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
  return <C.Provider value={value}>{children}</C.Provider>;
};
