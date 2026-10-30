/**
 * Independent checks of the analysis engine using tiny hand-built inputs (expected values worked out by hand).
 * These are development fixtures, never shown as anyone's real data. Run: node tests/analysis.test.ts
 */
import assert from "node:assert/strict";
import { parseFile, toMs, searchFromUrl } from "../src/lib/parsers.ts";
import { analyze } from "../src/lib/analysis.ts";
import { computeTraits } from "../src/lib/traits.ts";
import { computeSegments } from "../src/lib/segments.ts";
import { rankProducts } from "../src/lib/recommend.ts";
import { buildGraph } from "../src/lib/graph.ts";
import { emptyDataset } from "../src/lib/types.ts";
import type { Dataset, Product, Visit } from "../src/lib/types.ts";

let passed = 0;
const ok = (c: boolean, label: string) => { assert.ok(c, label); passed++; };
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, `${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); passed++; };

// ---------- time parsing & search extraction ----------
eq(toMs("13300000000000000"), Math.round(13300000000000000 / 1000 - 11644473600000), "WebKit µs since 1601 → Unix ms");
eq(new Date(toMs(1700000000)!).toISOString(), "2023-11-14T22:13:20.000Z", "Unix seconds");
eq(toMs("2026-10-01T12:00:00Z"), Date.parse("2026-10-01T12:00:00Z"), "ISO string");
eq(searchFromUrl("https://www.google.com/search?q=best+wireless+earbuds&oq=x"), { engine: "Google", query: "best wireless earbuds" }, "Google search from URL");
eq(searchFromUrl("https://www.amazon.com/s?k=standing+desk"), { engine: "Amazon", query: "standing desk" }, "Amazon search from URL");
eq(searchFromUrl("https://example.com/?q=x"), null, "non-search site ignored");

// ---------- format detection ----------
eq(parseFile("h.json", JSON.stringify({ format: "consumer-lab-extension/v1", items: [{ url: "https://a.com", title: "A", visitCount: 2, lastVisitTime: 2e12, visits: [{ t: 1.9e12 }, { t: 2e12 }] }] }), "s1").data.visits!.length, 2, "extension export → one visit per visit timestamp");
eq(parseFile("BrowserHistory.json", JSON.stringify({ "Browser History": [{ url: "https://b.com", title: "B", time_usec: 1700000000000000 }] }), "s2").kind, "takeout-history", "Takeout Browser History detected");
const act = parseFile("MyActivity.json", JSON.stringify([{ header: "Search", title: "Searched for running shoes", titleUrl: "https://www.google.com/search?q=running+shoes", time: "2026-09-01T10:00:00Z", products: ["Search"] }]), "s3");
eq([act.kind, act.data.searches!.length, act.data.searches![0].query], ["takeout-activity", 1, "running shoes"], "Takeout My Activity searches");
const gpt = parseFile("conversations.json", JSON.stringify([{ title: "Trip ideas", create_time: 1760000000, mapping: { a: { message: { author: { role: "user" }, content: { parts: ["Plan a trip to Kyoto"] } } }, b: { message: { author: { role: "assistant" }, content: { parts: ["Sure"] } } } } }]), "s4");
eq([gpt.kind, gpt.data.conversations![0].userText, gpt.data.conversations![0].messageCount], ["chatgpt", "Plan a trip to Kyoto", 1], "ChatGPT export keeps only the user's messages");
eq(parseFile("Retail.OrderHistory.1.csv", 'Order Date,Product Name,Unit Price,ASIN\n2026-08-01T00:00:00Z,"Anker USB-C Charger, 65W",29.99,B0X\n', "s5").data.purchases![0].price, 29.99, "Amazon order CSV with quoted comma");
eq(parseFile("catalog.csv", "name,url,price,brand\nSony WH-1000XM5,https://shop.example/x,348,Sony\n", "s6").kind, "products", "Product catalog CSV");
eq(parseFile("hist.csv", "url,title,visit_time\nhttps://c.com,C,2026-09-01T10:00:00Z\n", "s7").data.visits!.length, 1, "Generic history CSV");
assert.throws(() => parseFile("x.json", '{"foo":1}', "s8")); passed++;

// ---------- sessions, exclusions ----------
const T0 = Date.parse("2026-09-01T10:00:00Z"), MIN = 60000;
let n = 0;
const V = (url: string, title: string, t: number): Visit => ({ id: `v${n++}`, sourceId: "t", url, title, time: t });
const small: Dataset = { ...emptyDataset(), visits: [
  V("https://www.amazon.com/dp/1", "Apple AirPods Pro", T0), V("https://www.bestbuy.com/site/2", "Apple AirPods Pro - Best Buy", T0 + 10 * MIN),
  V("https://www.webmd.com/x", "Migraine symptoms", T0 + 20 * MIN), V("chrome://settings", "Settings", T0 + 21 * MIN), V("https://accounts.google.com/signin", "Sign in", T0 + 22 * MIN),
  V("https://www.netflix.com/browse", "Netflix", T0 + 80 * MIN),
] };
let a = analyze(small);
eq([a.counts.analyzedVisits, a.counts.sensitiveExcluded, a.counts.noiseExcluded], [3, 1, 2], "sensitive (WebMD) and noise (chrome://, sign-in) excluded");
eq(a.sessions.length, 2, "30-minute gap splits sessions (10:00–10:10, then 11:20)");
eq(a.sessions[0].retailers.sort(), ["amazon.com", "bestbuy.com"], "two retailers in first session");
ok(a.brands[0].name === "Apple" && a.brands[0].count === 2, "brand detected in both titles");
ok(computeTraits(a).filter((t) => t.id !== "style").every((t) => t.label === "INSUFFICIENT DATA"), "tiny dataset → every trait INSUFFICIENT DATA");

// ---------- price sensitivity: 6 shopping sessions, 3 with price signals → 50% ----------
n = 0;
const shop: Visit[] = [];
for (let s = 0; s < 6; s++) {
  const t = T0 + s * 3 * 3600000;
  shop.push(V("https://www.target.com/p/" + s, "Throw pillow", t));
  if (s === 0) shop.push(V("https://slickdeals.net/f/1", "Pillow deal", t + MIN));
  if (s === 1) shop.push(V("https://www.walmart.com/ip/" + s, "Throw pillow", t + MIN));
  if (s === 2) shop.push(V("https://www.google.com/search?q=cheapest+throw+pillow", "cheapest throw pillow - Google Search", t + MIN));
}
a = analyze({ ...emptyDataset(), visits: shop });
const price = computeTraits(a).find((t) => t.id === "price")!;
eq([a.sessions.filter((s) => s.shopping).length, price.position, price.label], [6, 0.5, "Strong price focus"], "price sensitivity = 3/6 sessions with price signals");

// ---------- brand concentration: Apple ×10, Sony ×2 → HHI 0.722 → brand-loyal ----------
n = 0;
const brandVisits = [...Array(10)].map((_, i) => V("https://www.apple.com/iphone/" + i, "iPhone 17 Pro", T0 + i * 7 * 3600000)).concat([V("https://www.sony.com/a", "Sony headphones", T0 + 1), V("https://www.sony.com/b", "Sony camera", T0 + 2)]);
a = analyze({ ...emptyDataset(), visits: brandVisits });
const brand = computeTraits(a).find((t) => t.id === "brand")!;
ok(Math.abs((1 - brand.position!) - ((10 / 12) ** 2 + (2 / 12) ** 2)) < 1e-9 && brand.label === "Leans brand-loyal", `HHI = 0.722 → brand-loyal (got ${brand.position})`);

// ---------- recommendations: category + brand interest ranks first; nothing invented ----------
const prods: Product[] = [
  { id: "p1", sourceId: "x", name: "Apple AirPods Pro 3 headphones", url: "https://shop.example/1", image: null, price: 249, currency: "USD", availability: "InStock", brand: "Apple", category: null, rating: 4.7, reviewCount: 1000, retailer: "shop.example", capturedAt: null, evidence: "json-ld" },
  { id: "p2", sourceId: "x", name: "Garden hose 50 ft", url: "https://shop.example/2", image: null, price: 30, currency: "USD", availability: null, brand: null, category: null, rating: null, reviewCount: null, retailer: "shop.example", capturedAt: null, evidence: "json-ld" },
];
a = analyze(small);
const ranked = rankProducts(prods, a, computeTraits(a), {});
eq(ranked.map((r) => r.product.id), ["p1", "p2"], "product matching observed category & brand ranks first");
ok(ranked[0].factors.some((f) => f.name === "Brand familiarity" && f.score > 0), "brand factor explains the match");
eq(rankProducts(prods, a, computeTraits(a), { brand: "inaccurate" })[0].factors.find((f) => f.name === "Brand familiarity")!.weight, 0, "rejecting the brand trait removes its weight");

// ---------- graph evidence references real records ----------
n = 0;
const many: Visit[] = [];
const sites = ["https://www.amazon.com/dp/", "https://www.rtings.com/headphones/", "https://www.youtube.com/watch?v=", "https://github.com/x/", "https://www.netflix.com/title/"];
for (let d = 0; d < 30; d++) for (let k = 0; k < 5; k++) many.push(V(sites[(d + k) % 5] + d + k, ["Sony headphones review", "Best headphones 2026", "Kindle Paperwhite", "react repo", "Show"][k], T0 + d * 86400000 + k * 5 * MIN));
a = analyze({ ...emptyDataset(), visits: many });
const g = buildGraph(a, computeSegments(a, computeTraits(a), {}));
const ids = new Set(a.visits.map((v) => v.id));
ok(g.nodes.length > 5 && g.edges.length > 5 && g.communities >= 1, `graph built (${g.nodes.length} nodes, ${g.edges.length} edges, ${g.communities} communities)`);
ok(g.nodes.filter((x) => x.type === "site").every((x) => x.evidence.every((e) => ids.has(e))), "site evidence ids exist in the analysed records");
ok(g.edges.some((e) => e.kind === "same session" && e.weight >= 2), "co-session edges weighted by shared sessions");

console.log(`\n${passed} analysis checks passed`);
