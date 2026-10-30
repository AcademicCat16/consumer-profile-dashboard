/**
 * Parsers for the user's own exports. Formats are detected from content; nothing is fetched.
 * Supported: Consumer Lab extension (live or file), Google Takeout Chrome "Browser History",
 * Google Takeout "My Activity" (JSON), generic history CSV, ChatGPT conversations.json,
 * Amazon order history CSV / generic purchases CSV, captured products JSON, product catalog CSV/JSON.
 */
import type { Conversation, Dataset, Product, Purchase, SearchEvent, SourceKind, Visit } from "./types.ts";
import { domainOf, SEARCH_PARAMS } from "./taxonomy.ts";

export interface ParseResult { kind: SourceKind; data: Partial<Dataset>; notes: string[] }

// ---------- helpers ----------
export const parseCSV = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
};

/** Accepts ISO strings, Unix seconds/ms, or Chrome/WebKit microseconds since 1601. */
export const toMs = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    if (n > 1e16) return Math.round(n / 1000 - 11644473600000); // WebKit µs since 1601
    if (n > 1e14) return Math.round(n / 1000); // Unix µs
    if (n > 1e11) return Math.round(n); // Unix ms
    if (n > 1e8) return Math.round(n * 1000); // Unix s
    return null;
  }
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};

const pick = (row: Record<string, string>, names: RegExp) => {
  const k = Object.keys(row).find((x) => names.test(x));
  return k ? row[k] : "";
};
const money = (v: string) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };

/** A search embedded in a visited URL (Google, YouTube, Amazon, …). */
export const searchFromUrl = (url: string) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    for (const s of SEARCH_PARAMS) {
      if (!s.host.test(host)) continue;
      const q = u.searchParams.get(s.param);
      if (q && q.trim()) return { engine: s.engine, query: q.trim().slice(0, 200) };
    }
  } catch { /* not a URL */ }
  return null;
};

// ---------- format detection ----------
export const parseFile = (name: string, text: string, sourceId: string): ParseResult => {
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    let json: unknown;
    try { json = JSON.parse(trimmed); } catch { throw new Error(`${name} is not valid JSON.`); }
    const o = json as Record<string, unknown>;
    if (o && (o as { format?: string }).format === "consumer-lab-extension/v1") return { kind: "chrome-export", data: { visits: fromExtension(o.items as ExtItem[], sourceId) }, notes: [] };
    if (o && (o as { format?: string }).format === "consumer-lab-products/v1") return { kind: "products", data: { products: fromCaptured(o.products as CapturedRaw[], sourceId) }, notes: [] };
    if (o && Array.isArray(o["Browser History"])) return { kind: "takeout-history", data: { visits: fromTakeoutHistory(o["Browser History"] as TakeoutItem[], sourceId) }, notes: [] };
    if (Array.isArray(json) && json.length && (json[0] as { mapping?: unknown }).mapping) return { kind: "chatgpt", data: { conversations: fromChatGPT(json as ChatGPTConv[], sourceId) }, notes: [] };
    if (Array.isArray(json) && json.length && ("header" in (json[0] as object) || "titleUrl" in (json[0] as object))) {
      const r = fromMyActivity(json as ActivityItem[], sourceId);
      return { kind: "takeout-activity", data: r, notes: [] };
    }
    if (Array.isArray(json) && json.length && (json[0] as { name?: string }).name && ((json[0] as { url?: string }).url || (json[0] as { price?: unknown }).price !== undefined))
      return { kind: "products", data: { products: fromCatalogRows(json as Record<string, string>[], sourceId) }, notes: [] };
    throw new Error(`${name}: JSON format not recognised. Supported: Consumer Lab extension export, Google Takeout Browser History or My Activity, ChatGPT conversations.json, product catalog.`);
  }
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(`${name} is empty or not a CSV file.`);
  const keys = Object.keys(rows[0]).join("|").toLowerCase();
  if (/order date|product name|asin|order id/.test(keys) || (/(product|item)/.test(keys) && /(price|amount|total)/.test(keys) && /date/.test(keys) && !/url/.test(keys)))
    return { kind: "purchases", data: { purchases: fromPurchaseRows(rows, sourceId) }, notes: [] };
  if (/url/.test(keys) && /(name|product)/.test(keys) && /price/.test(keys)) return { kind: "products", data: { products: fromCatalogRows(rows, sourceId) }, notes: [] };
  if (/url/.test(keys)) {
    const visits = fromHistoryRows(rows, sourceId);
    return { kind: "csv-history", data: { visits }, notes: visits.length < rows.length ? [`${rows.length - visits.length} rows skipped (missing URL or time).`] : [] };
  }
  throw new Error(`${name}: CSV columns not recognised (${Object.keys(rows[0]).slice(0, 6).join(", ")}).`);
};

// ---------- individual formats ----------
interface ExtItem { url: string; title: string; visitCount: number; lastVisitTime: number; visits: { t: number; tr?: string }[] }
export const fromExtension = (items: ExtItem[], sourceId: string): Visit[] => {
  const out: Visit[] = [];
  let n = 0;
  for (const it of items ?? []) {
    if (!it?.url) continue;
    const times = it.visits?.length ? it.visits : it.lastVisitTime ? [{ t: it.lastVisitTime, tr: undefined }] : [];
    for (const v of times) out.push({ id: `${sourceId}:${n++}`, sourceId, url: it.url, title: it.title ?? "", time: v.t, transition: v.tr });
  }
  return out;
};

interface TakeoutItem { url: string; title?: string; time_usec: number; page_transition?: string }
const fromTakeoutHistory = (items: TakeoutItem[], sourceId: string): Visit[] =>
  items.filter((x) => x?.url && x.time_usec).map((x, i) => ({ id: `${sourceId}:${i}`, sourceId, url: x.url, title: x.title ?? "", time: Math.round(x.time_usec / 1000), transition: x.page_transition?.toLowerCase() }));

interface ActivityItem { header?: string; title?: string; titleUrl?: string; time?: string; products?: string[] }
const fromMyActivity = (items: ActivityItem[], sourceId: string): Partial<Dataset> => {
  const visits: Visit[] = [], searches: SearchEvent[] = [];
  items.forEach((x, i) => {
    const t = toMs(x.time);
    if (!t || !x.title) return;
    const searched = x.title.match(/^Searched for (.+)$/);
    if (searched) { searches.push({ id: `${sourceId}:s${i}`, sourceId, engine: (x.header || "Google").replace(/ Search$/, ""), query: searched[1].slice(0, 200), time: t, url: x.titleUrl }); return; }
    const visited = x.title.match(/^Visited (.+)$/);
    if (visited && x.titleUrl) {
      let url = x.titleUrl;
      try { const u = new URL(x.titleUrl); url = u.searchParams.get("q") && /google\.[a-z.]+\/url$/.test(u.hostname + u.pathname) ? u.searchParams.get("q")! : x.titleUrl; } catch { /* keep */ }
      visits.push({ id: `${sourceId}:v${i}`, sourceId, url, title: visited[1], time: t });
    }
    if (/^Watched (.+)$/.test(x.title) && x.titleUrl) visits.push({ id: `${sourceId}:w${i}`, sourceId, url: x.titleUrl, title: x.title.replace(/^Watched /, ""), time: t });
  });
  return { visits, searches };
};

const fromHistoryRows = (rows: Record<string, string>[], sourceId: string): Visit[] =>
  rows.flatMap((r, i) => {
    const url = pick(r, /^url$|^address$|^link$/i) || pick(r, /url/i);
    const t = toMs(pick(r, /visit.?time|last.?visit|timestamp|date|time/i));
    if (!url || !t) return [];
    return [{ id: `${sourceId}:${i}`, sourceId, url, title: pick(r, /title|name/i), time: t }];
  });

interface ChatGPTConv { id?: string; title?: string; create_time?: number; mapping: Record<string, { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number } }> }
const fromChatGPT = (convs: ChatGPTConv[], sourceId: string): Conversation[] =>
  convs.map((c, i) => {
    const userMsgs = Object.values(c.mapping ?? {}).map((n) => n.message).filter((m) => m?.author?.role === "user");
    const text = userMsgs.flatMap((m) => (m?.content?.parts ?? []).filter((p) => typeof p === "string") as string[]).join("\n").slice(0, 20000);
    return { id: `${sourceId}:${i}`, sourceId, title: c.title ?? "Untitled", time: toMs(c.create_time) ?? 0, userText: text, messageCount: userMsgs.length };
  }).filter((c) => c.time > 0 && c.messageCount > 0);

const fromPurchaseRows = (rows: Record<string, string>[], sourceId: string): Purchase[] =>
  rows.flatMap((r, i) => {
    const t = toMs(pick(r, /order date|purchase date|^date$|date/i));
    const product = pick(r, /product name|^product$|item|title|^name$/i);
    if (!t || !product) return [];
    const store = pick(r, /store|retailer|merchant|website|seller/i) || (/asin|order id/i.test(Object.keys(r).join("|")) ? "amazon.com" : "unknown");
    return [{ id: `${sourceId}:${i}`, sourceId, time: t, product: product.slice(0, 200), price: money(pick(r, /unit price|total owed|price|amount|total/i)), currency: pick(r, /currency/i) || null, store, category: pick(r, /category/i) || null }];
  });

interface CapturedRaw { name: string; url: string; image?: string; brand?: string; price?: number | null; currency?: string | null; availability?: string | null; category?: string | null; rating?: number | null; reviewCount?: number | null; retailer?: string; capturedAt?: string; evidence?: "json-ld" | "opengraph" }
export const fromCaptured = (items: CapturedRaw[], sourceId: string): Product[] =>
  (items ?? []).filter((p) => p?.name && p?.url).map((p, i) => ({
    id: `${sourceId}:${i}`, sourceId, name: p.name, url: p.url, image: p.image ?? null, price: typeof p.price === "number" ? p.price : null, currency: p.currency ?? null,
    availability: p.availability ?? null, brand: p.brand ?? null, category: p.category ?? null, rating: p.rating ?? null, reviewCount: p.reviewCount ?? null,
    retailer: p.retailer ?? domainOf(p.url), capturedAt: p.capturedAt ?? null, evidence: p.evidence ?? "json-ld",
  }));

const fromCatalogRows = (rows: Record<string, string>[], sourceId: string): Product[] =>
  rows.flatMap((r, i) => {
    const name = pick(r, /^name$|product|title/i), url = pick(r, /url|link/i);
    if (!name || !/^https?:\/\//.test(url)) return [];
    return [{ id: `${sourceId}:${i}`, sourceId, name, url, image: pick(r, /image/i) || null, price: money(pick(r, /price/i)), currency: pick(r, /currency/i) || null,
      availability: pick(r, /availab/i) || null, brand: pick(r, /brand/i) || null, category: pick(r, /category/i) || null, rating: money(pick(r, /rating/i)), reviewCount: money(pick(r, /review/i)),
      retailer: pick(r, /retailer|store/i) || domainOf(url), capturedAt: null, evidence: "catalog-import" as const }];
  });
