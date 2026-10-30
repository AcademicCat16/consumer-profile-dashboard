/**
 * Checks the extension without installing it:
 *  1. background.js consent gating, run in a sandbox with a mocked chrome API (synthetic history items only).
 *  2. popup.js extractProducts(), run in system Chrome against a synthetic product page served by request interception.
 * Run: node tests/extension.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright-core";

const ext = join(dirname(fileURLToPath(import.meta.url)), "..", "extension");
let passed = 0;
const ok = (c, l) => { assert.ok(c, l); passed++; console.log("  ✓", l); };

// ---------- 1. background gating ----------
const state = { granted: false, store: { allowDashboard: false, days: 90, captured: [{ name: "X", url: "https://shop.example.test/x" }] }, historyCalls: 0 };
let listener;
const chrome = {
  storage: { local: { get: async (defaults) => ({ ...defaults, ...state.store }) } },
  permissions: { contains: async () => state.granted },
  runtime: { getManifest: () => ({ version: "1.0.0" }), onMessageExternal: { addListener: (f) => (listener = f) } },
  history: {
    search: async () => { state.historyCalls++; return [{ url: "https://example.test/a", title: "A", visitCount: 2, typedCount: 0, lastVisitTime: Date.now() }]; },
    getVisits: async () => [{ visitTime: Date.now() - 1000, transition: "link" }, { visitTime: Date.now() - 400 * 86400000, transition: "link" }],
  },
};
vm.runInNewContext(readFileSync(join(ext, "background.js"), "utf8"), { chrome, console, Date, Math, Number, String });
const ask = (msg) => new Promise((res) => listener(msg, { origin: "https://academiccat16.github.io" }, res));

const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
ok(manifest.manifest_version === 3 && manifest.optional_permissions.includes("history") && !manifest.permissions.includes("history"), "history is an optional permission the user must grant");
ok(!JSON.stringify(manifest).match(/cookies|webRequest|<all_urls>|identity/), "no cookie, network-interception, all-sites or identity permissions");
ok(manifest.externally_connectable.matches.every((m) => /academiccat16\.github\.io|localhost|127\.0\.0\.1/.test(m)), "only the dashboard origins may message the extension");

let r = await ask({ type: "ping" });
ok(r.ok && r.historyGranted === false && r.dashboardAllowed === false, "ping reports state without data");
r = await ask({ type: "getHistory", days: 30 });
ok(!r.ok && r.error === "history_permission_not_granted" && state.historyCalls === 0, "no history without Chrome permission");
state.granted = true;
r = await ask({ type: "getHistory", days: 30 });
ok(!r.ok && r.error === "dashboard_connection_not_allowed" && state.historyCalls === 0, "no history until the user allows the dashboard connection");
r = await ask({ type: "getCapturedProducts" });
ok(!r.ok, "no captured products until the user allows the dashboard connection");
state.store.allowDashboard = true;
r = await ask({ type: "getHistory", days: 30 });
ok(r.ok && r.format === "consumer-lab-extension/v1" && r.items.length === 1 && r.items[0].visits.length === 1, "history returned after double consent, visits limited to the requested period");
r = await ask({ type: "getHistory", days: 9999 });
ok(r.days === 365, "period capped at 365 days");
r = await ask({ type: "unknown" });
ok(!r.ok, "unknown requests rejected");

// ---------- 2. product capture ----------
const src = readFileSync(join(ext, "popup.js"), "utf8");
const fn = src.slice(src.indexOf("function extractProducts()"), src.indexOf('\n$("capture")'));
const PAGES = {
  "/jsonld": `<html><head><title>T</title><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Product", name: "Test Headphones", brand: { "@type": "Brand", name: "Acme" }, image: ["https://shop.example.test/i.jpg"], offers: { "@type": "Offer", price: "1,299.00", priceCurrency: "USD", availability: "https://schema.org/InStock" }, aggregateRating: { ratingValue: "4.4", reviewCount: "120" } }] })}</script></head><body></body></html>`,
  "/eu": `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Lampe", offers: { price: "19,99", priceCurrency: "EUR" } })}</script></head></html>`,
  "/og": `<html><head><meta property="og:type" content="product"><meta property="og:title" content="OG Mug"><meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="USD"></head></html>`,
  "/none": `<html><head><title>Blog post</title></head><body>No product here, price $99</body></html>`,
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.route("https://shop.example.test/**", (route) => route.fulfill({ contentType: "text/html", body: PAGES[new URL(route.request().url()).pathname] ?? "" }));
const capture = async (path) => { await page.goto(`https://shop.example.test${path}`); return page.evaluate(`(${fn})()`); };
try {
  let c = await capture("/jsonld");
  const p = c.products[0];
  ok(c.products.length === 1 && p.name === "Test Headphones" && p.brand === "Acme" && p.price === 1299 && p.currency === "USD" && p.availability === "InStock" && p.rating === 4.4 && p.reviewCount === 120 && p.evidence === "json-ld", "JSON-LD product captured exactly as published");
  c = await capture("/eu");
  ok(c.products[0].price === 19.99 && c.products[0].currency === "EUR", "decimal-comma price parsed correctly");
  c = await capture("/og");
  ok(c.products[0].name === "OG Mug" && c.products[0].price === 12.5 && c.products[0].evidence === "opengraph", "OpenGraph fallback");
  c = await capture("/none");
  ok(c.products.length === 0, "page without product data yields nothing (no guessing from page text)");
} finally { await browser.close(); }

console.log(`\n${passed} extension checks passed`);
