/**
 * Local behavioural analysis of the user's own records. Pure functions, no network.
 * Observed facts (counts, frequencies, transitions) are kept separate from inferences (see traits.ts).
 * Sensitive-topic records are removed before any counting.
 */
import type { Conversation, Dataset, Purchase, SearchEvent, Visit } from "./types.ts";
import {
  CATEGORIES, DEAL_SITES, PREMIUM_SITES, PRICE_TERMS, RESEARCH_TERMS, RETAILERS, REVIEW_SITES, STOPWORDS, VALUE_SITES,
  categorize, detectBrands, domainOf, isNoise, isSensitive, productCategoryOf, siteOf, NOVELTY_TERMS, PREMIUM_TERMS, VALUE_TERMS,
} from "./taxonomy.ts";
import type { Category } from "./taxonomy.ts";
import { searchFromUrl } from "./parsers.ts";

export const SESSION_GAP_MS = 30 * 60 * 1000;
const DAY = 86400000;

export interface EVisit extends Visit {
  domain: string; site: string; category: Category; brands: string[]; productCategory: string | null;
  retailer: boolean; deal: boolean; review: boolean; search: { engine: string; query: string } | null;
  priceSignal: boolean; researchSignal: boolean; noveltySignal: boolean; premiumSignal: boolean; valueSignal: boolean; session: number;
}
export interface ESearch extends SearchEvent { category: Category | null; price: boolean; research: boolean; novelty: boolean; productCategory: string | null; brands: string[] }
export interface Session { id: number; start: number; end: number; visits: number[]; sites: string[]; categories: Category[]; shopping: boolean; retailers: string[] }
export interface SiteStat { site: string; category: Category; visits: number; activeDays: number; first: number; last: number; sessions: number; titles: string[] }
export interface Interest { name: string; count: number; evidence: string[] } // evidence = record ids

export interface Analysis {
  counts: { rawVisits: number; analyzedVisits: number; sensitiveExcluded: number; noiseExcluded: number; searches: number; conversations: number; conversationsExcluded: number; purchases: number; products: number; activeDays: number; first: number | null; last: number | null };
  visits: EVisit[];
  searches: ESearch[];
  sessions: Session[];
  sites: SiteStat[];
  categories: { category: Category; visits: number; share: number; sites: number }[];
  brands: Interest[];
  productInterests: Interest[];
  queryTerms: Interest[];
  conversationTopics: { category: Category; conversations: number; titles: string[] }[];
  purchases: (Purchase & { productCategory: string | null; brands: string[] })[];
  hourly: number[][]; // [weekday 0=Sun][hour]
  daily: Map<string, number>; // YYYY-MM-DD → visits
  weekly: { week: string; start: number; byCategory: Record<string, number>; total: number }[];
  transitions: { from: Category; to: Category; count: number }[];
  shopping: { visits: number; sessions: number; retailerVisits: number; dealVisits: number; reviewVisits: number; retailers: { site: string; visits: number }[] };
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const weekStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime(); };

const CONVO_RULES: { cat: Category; re: RegExp }[] = [
  { cat: "Technology", re: /\b(laptop|phone|computer|gpu|cpu|monitor|camera|headphones|gadget|iphone|android|windows|mac)\b/i },
  { cat: "AI & Developer Tools", re: /\b(python|javascript|typescript|react|code|coding|api|sql|github|bug|function|prompt|llm|machine learning)\b/i },
  { cat: "Travel", re: /\b(trip|travel|flight|hotel|itinerary|vacation|visa|airport)\b/i },
  { cat: "Food & Dining", re: /\b(recipe|cook|cooking|restaurant|meal|bake|dinner)\b/i },
  { cat: "Shopping", re: /\b(buy|purchase|price|deal|which .* should i (buy|get)|recommend .* (product|brand))\b/i },
  { cat: "Fashion & Beauty", re: /\b(outfit|clothes|fashion|skincare|makeup|shoes|style)\b/i },
  { cat: "Home & Living", re: /\b(apartment|furniture|decor|cleaning|garden|home)\b/i },
  { cat: "Education & Learning", re: /\b(essay|homework|study|exam|course|learn|explain|lecture|research paper)\b/i },
  { cat: "Productivity & Work", re: /\b(email|resume|cover letter|meeting|presentation|spreadsheet|excel|project plan)\b/i },
  { cat: "Entertainment & Video", re: /\b(movie|film|show|series|anime|youtube|netflix)\b/i },
  { cat: "Gaming", re: /\b(game|gaming|steam|playstation|xbox|nintendo)\b/i },
  { cat: "Sports & Fitness", re: /\b(workout|gym|running|fitness|soccer|basketball|football)\b/i },
  { cat: "Personal Finance", re: /\b(budget|saving|invest|stock|credit card|loan)\b/i },
];

export const analyze = (d: Dataset): Analysis => {
  let sensitiveExcluded = 0, noiseExcluded = 0;
  const visits: EVisit[] = [];
  for (const v of [...d.visits].sort((a, b) => a.time - b.time)) {
    const domain = domainOf(v.url);
    if (isNoise(v.url, domain)) { noiseExcluded++; continue; }
    const search = searchFromUrl(v.url);
    const text = `${v.title} ${search?.query ?? ""}`;
    if (isSensitive(domain, `${text} ${v.url}`)) { sensitiveExcluded++; continue; }
    const site = siteOf(domain);
    visits.push({
      ...v, domain, site, category: categorize(domain, v.title), brands: detectBrands(text), productCategory: productCategoryOf(text),
      retailer: RETAILERS.has(site), deal: DEAL_SITES.has(site) || /tbm=shop|\/shopping\b/.test(v.url), review: REVIEW_SITES.has(site) || /wirecutter/.test(v.url) || (/\breview/i.test(v.title) && /youtube|reddit/.test(site)),
      search, priceSignal: PRICE_TERMS.test(text) || /sort=price|s=price|price-asc|price_low/i.test(v.url), researchSignal: RESEARCH_TERMS.test(text), noveltySignal: NOVELTY_TERMS.test(text),
      premiumSignal: PREMIUM_SITES.has(site) || PREMIUM_TERMS.test(text), valueSignal: VALUE_SITES.has(site) || VALUE_TERMS.test(text), session: -1,
    });
  }

  // sessions
  const sessions: Session[] = [];
  for (let i = 0; i < visits.length; i++) {
    const v = visits[i];
    const cur = sessions[sessions.length - 1];
    if (!cur || v.time - cur.end > SESSION_GAP_MS) sessions.push({ id: sessions.length, start: v.time, end: v.time, visits: [i], sites: [v.site], categories: [v.category], shopping: false, retailers: [] });
    else { cur.end = v.time; cur.visits.push(i); if (!cur.sites.includes(v.site)) cur.sites.push(v.site); if (!cur.categories.includes(v.category)) cur.categories.push(v.category); }
    v.session = sessions.length - 1;
  }
  for (const s of sessions) {
    s.retailers = [...new Set(s.visits.map((i) => visits[i]).filter((v) => v.retailer).map((v) => v.site))];
    s.shopping = s.visits.some((i) => visits[i].retailer || visits[i].deal || visits[i].category === "Shopping");
  }

  // searches: embedded in visits + imported search activity
  const searches: ESearch[] = [];
  const enrichSearch = (s: SearchEvent): ESearch => {
    const cat = categorize("", s.query);
    return { ...s, category: cat === "Other" ? null : cat, price: PRICE_TERMS.test(s.query), research: RESEARCH_TERMS.test(s.query), novelty: NOVELTY_TERMS.test(s.query), productCategory: productCategoryOf(s.query), brands: detectBrands(s.query) };
  };
  for (const v of visits) if (v.search) searches.push(enrichSearch({ id: `${v.id}:q`, sourceId: v.sourceId, engine: v.search.engine, query: v.search.query, time: v.time, url: v.url }));
  for (const s of d.searches) { if (isSensitive("", s.query)) { sensitiveExcluded++; continue; } searches.push(enrichSearch(s)); }

  // sites
  const siteMap = new Map<string, SiteStat & { days: Set<string>; sess: Set<number> }>();
  for (const v of visits) {
    const s = siteMap.get(v.site) ?? { site: v.site, category: v.category, visits: 0, activeDays: 0, first: v.time, last: v.time, sessions: 0, titles: [], days: new Set(), sess: new Set() };
    s.visits++; s.last = v.time; s.days.add(dayKey(v.time)); s.sess.add(v.session);
    if (s.titles.length < 6 && v.title && !s.titles.includes(v.title)) s.titles.push(v.title);
    if (s.category === "Other" && v.category !== "Other") s.category = v.category;
    siteMap.set(v.site, s);
  }
  const sites = [...siteMap.values()].map(({ days, sess, ...s }) => ({ ...s, activeDays: days.size, sessions: sess.size })).sort((a, b) => b.visits - a.visits);

  const catCount = new Map<Category, { visits: number; sites: Set<string> }>();
  for (const v of visits) { const c = catCount.get(v.category) ?? { visits: 0, sites: new Set() }; c.visits++; c.sites.add(v.site); catCount.set(v.category, c); }
  const categories = [...catCount].map(([category, c]) => ({ category, visits: c.visits, share: visits.length ? c.visits / visits.length : 0, sites: c.sites.size })).sort((a, b) => b.visits - a.visits);

  // interests
  const tally = (m: Map<string, Interest>, key: string | null, id: string) => { if (!key) return; const x = m.get(key) ?? { name: key, count: 0, evidence: [] }; x.count++; if (x.evidence.length < 40) x.evidence.push(id); m.set(key, x); };
  const brandMap = new Map<string, Interest>(), prodMap = new Map<string, Interest>(), termMap = new Map<string, Interest>();
  for (const v of visits) { v.brands.forEach((b) => tally(brandMap, b, v.id)); if (v.retailer || v.category === "Shopping" || v.search) tally(prodMap, v.productCategory, v.id); }
  for (const s of searches) {
    if (s.id.endsWith(":q")) { /* already counted via its visit */ } else { s.brands.forEach((b) => tally(brandMap, b, s.id)); tally(prodMap, s.productCategory, s.id); }
    for (const w of s.query.toLowerCase().split(/[^a-z0-9+#]+/)) if (w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) tally(termMap, w, s.id);
  }
  const purchases = d.purchases.filter((p) => !isSensitive(p.store, p.product)).map((p) => ({ ...p, productCategory: p.category || productCategoryOf(p.product), brands: detectBrands(p.product) }));
  for (const p of purchases) { p.brands.forEach((b) => tally(brandMap, b, p.id)); tally(prodMap, p.productCategory, p.id); }

  // conversations (user's own messages only; sensitive conversations excluded)
  let conversationsExcluded = 0;
  const convTopics = new Map<Category, { conversations: number; titles: string[] }>();
  const safeConvs: Conversation[] = [];
  for (const c of d.conversations) {
    if (isSensitive("", `${c.title} ${c.userText}`)) { conversationsExcluded++; continue; }
    safeConvs.push(c);
    const text = `${c.title}\n${c.userText}`;
    for (const r of CONVO_RULES) if (r.re.test(text)) { const t = convTopics.get(r.cat) ?? { conversations: 0, titles: [] }; t.conversations++; if (t.titles.length < 8) t.titles.push(c.title); convTopics.set(r.cat, t); }
    detectBrands(text).forEach((b) => tally(brandMap, b, c.id));
  }

  // time patterns
  const hourly = Array.from({ length: 7 }, () => Array(24).fill(0));
  const daily = new Map<string, number>();
  const weeks = new Map<number, Record<string, number>>();
  for (const v of visits) {
    const dt = new Date(v.time);
    hourly[dt.getDay()][dt.getHours()]++;
    daily.set(dayKey(v.time), (daily.get(dayKey(v.time)) ?? 0) + 1);
    const w = weekStart(v.time); const rec = weeks.get(w) ?? {}; rec[v.category] = (rec[v.category] ?? 0) + 1; weeks.set(w, rec);
  }
  const weekly = [...weeks].sort((a, b) => a[0] - b[0]).map(([start, byCategory]) => ({ week: dayKey(start), start, byCategory, total: Object.values(byCategory).reduce((s, n) => s + n, 0) }));

  // category transitions within sessions (consecutive different categories)
  const tr = new Map<string, number>();
  for (const s of sessions) for (let k = 1; k < s.visits.length; k++) {
    const a = visits[s.visits[k - 1]].category, b = visits[s.visits[k]].category;
    if (a !== b) tr.set(`${a}→${b}`, (tr.get(`${a}→${b}`) ?? 0) + 1);
  }
  const transitions = [...tr].map(([k, count]) => { const [from, to] = k.split("→") as [Category, Category]; return { from, to, count }; }).sort((a, b) => b.count - a.count);

  const retailerCounts = new Map<string, number>();
  visits.filter((v) => v.retailer).forEach((v) => retailerCounts.set(v.site, (retailerCounts.get(v.site) ?? 0) + 1));
  const times = visits.map((v) => v.time);
  return {
    counts: {
      rawVisits: d.visits.length, analyzedVisits: visits.length, sensitiveExcluded, noiseExcluded, searches: searches.length, conversations: safeConvs.length, conversationsExcluded,
      purchases: purchases.length, products: d.products.length, activeDays: daily.size, first: times.length ? times[0] : null, last: times.length ? times[times.length - 1] : null,
    },
    visits, searches, sessions, sites, categories,
    brands: [...brandMap.values()].sort((a, b) => b.count - a.count),
    productInterests: [...prodMap.values()].sort((a, b) => b.count - a.count),
    queryTerms: [...termMap.values()].filter((t) => t.count >= 2).sort((a, b) => b.count - a.count).slice(0, 60),
    conversationTopics: [...convTopics].map(([category, t]) => ({ category, ...t })).sort((a, b) => b.conversations - a.conversations),
    purchases, hourly, daily, weekly, transitions,
    shopping: {
      visits: visits.filter((v) => v.retailer || v.deal || v.category === "Shopping").length, sessions: sessions.filter((s) => s.shopping).length,
      retailerVisits: visits.filter((v) => v.retailer).length, dealVisits: visits.filter((v) => v.deal).length, reviewVisits: visits.filter((v) => v.review).length,
      retailers: [...retailerCounts].map(([site, n]) => ({ site, visits: n })).sort((a, b) => b.visits - a.visits),
    },
  };
};

export const hasData = (a: Analysis) => a.counts.analyzedVisits + a.counts.searches + a.counts.conversations + a.counts.purchases > 0;
export const ALL_CATEGORIES = CATEGORIES;
export { DAY };
