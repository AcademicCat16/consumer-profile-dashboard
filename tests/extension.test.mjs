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

// ---------- 1. background consent gating ----------
const DASH = "https://academiccat16.github.io";
const local = { authorizedOrigins: {}, captured: [{ name: "X", url: "https://shop.example.test/x" }] }, session = {};
const calls = { windows: [], tabs: [], historySearch: 0, removed: 0 };
let granted = false, listener, onRemoved;
const getter = (store) => async (q) => typeof q === "string" ? { [q]: store[q] } : q && typeof q === "object" ? Object.fromEntries(Object.entries(q).map(([k, d]) => [k, store[k] ?? d])) : { ...store };
const chrome = {
  storage: {
    local: { get: getter(local), set: async (o) => Object.assign(local, o) },
    session: { get: getter(session), set: async (o) => Object.assign(session, o), remove: async (k) => { delete session[k]; } },
  },
  permissions: { contains: async () => granted, remove: async () => { granted = false; calls.removed++; onRemoved({ permissions: ["history"] }); return true; }, onRemoved: { addListener: (f) => (onRemoved = f) } },
  runtime: { getManifest: () => ({ version: "1.1.0" }), getURL: (p) => `chrome-extension://test/${p}`, onMessageExternal: { addListener: (f) => (listener = f) }, onInstalled: { addListener: (f) => f({ reason: "install" }) } },
  windows: { create: async (o) => { calls.windows.push(o); return { id: 9 }; } },
  tabs: { create: async (o) => { calls.tabs.push(o); } },
  history: {
    search: async () => { calls.historySearch++; return [{ url: "https://example.test/a", title: "A", visitCount: 2, typedCount: 0, lastVisitTime: Date.now() }]; },
    getVisits: async () => [{ visitTime: Date.now() - 1000, transition: "link" }, { visitTime: Date.now() - 400 * 86400000, transition: "link" }],
  },
};
vm.runInNewContext(readFileSync(join(ext, "background.js"), "utf8"), { chrome, console, Date, Math, Number, String, crypto: globalThis.crypto });
const ask = (msg, origin = DASH) => new Promise((res) => listener(msg, { origin, tab: { id: 5, windowId: 2 } }, res));
await new Promise((r) => setTimeout(r, 10));

const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
ok(manifest.manifest_version === 3 && manifest.optional_permissions.includes("history") && !manifest.permissions.includes("history"), "history is an optional permission requested at runtime");
ok(!JSON.stringify(manifest).match(/cookies|webRequest|<all_urls>|identity|host_permissions|"tabs"/), "no cookie, network, all-sites, identity, host or tabs permissions");
ok(manifest.externally_connectable.matches.every((m) => /academiccat16\.github\.io|localhost|127\.0\.0\.1/.test(m)), "only the dashboard origins may message the extension");
ok(Object.values(manifest.icons).length === 4 && manifest.description.length <= 132, "store-ready icons and description length");
ok(calls.tabs.length === 1 && calls.tabs[0].url.startsWith("https://academiccat16.github.io/consumer-profile-dashboard/#/connect"), "fresh install opens the dashboard's connect step");

let r = await ask({ type: "ping" });
ok(r.ok && r.historyGranted === false && r.authorized === false, "ping reports state without data");
r = await ask({ type: "getHistory", days: 30 });
ok(!r.ok && calls.historySearch === 0, "no history before approval");
r = await ask({ type: "connect", days: 90 });
const reqKey = Object.keys(session)[0];
ok(r.status === "consent_opened" && calls.windows.length === 1 && calls.windows[0].url.includes("consent.html?id=") && session[reqKey].origin === DASH && session[reqKey].days === 90 && session[reqKey].tabId === 5, "connect opens the extension's consent window and records the request in session storage");
granted = true; // Chrome permission granted, but nobody clicked Allow for this origin
r = await ask({ type: "getHistory", days: 30 });
ok(!r.ok && r.error === "origin_not_authorized" && calls.historySearch === 0, "Chrome permission alone is not enough: the dashboard origin must be approved");
local.authorizedOrigins = { [DASH]: { grantedAt: new Date().toISOString(), days: 90 } }; // what consent.js writes on Allow
r = await ask({ type: "ping" });
ok(r.authorized && r.authorizedDays === 90, "ping reports the approval and its period");
r = await ask({ type: "getHistory", days: 365 });
ok(r.ok && r.days === 90 && r.items.length === 1 && r.items[0].visits.length === 1, "history returned after approval, capped at the approved period");
r = await ask({ type: "getHistory", days: 30 }, "https://evil.example");
ok(!r.ok && r.error === "origin_not_authorized", "another origin is not authorized (and externally_connectable blocks it anyway)");
r = await ask({ type: "connect", days: 60 });
ok(r.status === "already_authorized" && calls.windows.length === 1, "no repeated consent prompt within the approved period");
r = await ask({ type: "connect", days: 365 });
ok(r.status === "consent_opened" && calls.windows.length === 2, "asking for a longer period requires a new approval");
r = await ask({ type: "getCapturedProducts" });
ok(r.ok && r.products.length === 1, "captured products shared with the approved dashboard");
r = await ask({ type: "disconnect" });
ok(r.ok && calls.removed === 1 && granted === false && Object.keys(local.authorizedOrigins).length === 0, "disconnect removes the permission and every approval");
local.authorizedOrigins = { [DASH]: { grantedAt: "x", days: 90 } }; granted = true;
onRemoved({ permissions: ["history"] }); await new Promise((r2) => setTimeout(r2, 10));
ok(Object.keys(local.authorizedOrigins).length === 0, "removing the permission in Chrome settings also clears approvals");
r = await ask({ type: "unknown" });
ok(!r.ok, "unknown requests rejected");

// ---------- 1b. consent window (consent.html + consent.js) with a mocked chrome API ----------
{
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.route("https://ext.test/**", (route) => route.fulfill({ path: join(ext, new URL(route.request().url()).pathname.slice(1)) }));
  const run = async (opts) => {
    const p2 = await browser.newPage();
    await p2.route("https://ext.test/**", (route) => route.fulfill({ path: join(ext, new URL(route.request().url()).pathname.slice(1)) }));
    await p2.addInitScript(({ permissionResult, alreadyGranted, expired }) => {
      const st = { local: { authorizedOrigins: {} }, session: { "req:abc": { origin: "https://academiccat16.github.io", days: 180, tabId: 5, windowId: 2, at: expired ? 0 : Date.now() } } };
      window.__log = { requested: 0, tabs: [], wins: [], closed: false };
      window.close = () => { window.__log.closed = true; };
      const g = (s) => async (q) => (typeof q === "string" ? { [q]: s[q] } : Object.fromEntries(Object.entries(q).map(([k, d]) => [k, s[k] ?? d])));
      window.chrome = {
        storage: { local: { get: g(st.local), set: async (o) => Object.assign(st.local, o) }, session: { get: g(st.session), remove: async (k) => { delete st.session[k]; } } },
        permissions: { contains: async () => alreadyGranted, request: async () => { window.__log.requested++; return permissionResult; } },
        tabs: { update: async (id) => window.__log.tabs.push(id) }, windows: { update: async (id) => window.__log.wins.push(id) },
      };
      window.__st = st;
    }, { expired: false, ...opts });
    await p2.goto("https://ext.test/consent.html?id=abc");
    await p2.waitForTimeout(200);
    return p2;
  };
  const state = (p) => p.evaluate(() => ({ auth: window.__st.local.authorizedOrigins, session: window.__st.session, log: window.__log }));
  let p = await run({ permissionResult: true, alreadyGranted: false });
  ok((await p.locator("#origin").innerText()) === "academiccat16.github.io" && (await p.locator("#days").innerText()) === "last 180 days" && (await p.locator("#firstTime").isVisible()), "consent window names the requesting site, the period, and that Chrome will ask once");
  await p.click("#allow"); await p.waitForTimeout(800);
  let st = await state(p);
  ok(st.log.requested === 1 && st.auth["https://academiccat16.github.io"]?.days === 180 && !st.session["req:abc"], "Allow requests Chrome's permission, then records the approval for that origin and period");
  ok(st.log.tabs[0] === 5 && st.log.wins[0] === 2 && st.log.closed, "after approval it returns focus to the dashboard tab and closes");
  p = await run({ permissionResult: false, alreadyGranted: false });
  await p.click("#allow"); await p.waitForTimeout(300);
  st = await state(p);
  ok(Object.keys(st.auth).length === 0 && !st.log.closed && /not granted/.test(await p.locator("#status").innerText()), "declining Chrome's prompt approves nothing");
  p = await run({ permissionResult: true, alreadyGranted: true });
  ok(!(await p.locator("#firstTime").isVisible()), "no 'Chrome will ask' note when the permission already exists");
  p = await run({ permissionResult: true, alreadyGranted: false });
  await p.click("#deny"); await p.waitForTimeout(200);
  st = await state(p);
  ok(Object.keys(st.auth).length === 0 && st.log.requested === 0 && st.log.closed, "Not now approves nothing and closes");
  p = await run({ permissionResult: true, alreadyGranted: false, expired: true });
  ok(await p.locator("#allow").isDisabled(), "expired requests cannot be approved");
  await browser.close();
}

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
