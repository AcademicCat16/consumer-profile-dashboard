const $ = (id) => document.getElementById(id);
const msg = (t) => { $("msg").textContent = t; };
const DASHBOARD_URL = "https://academiccat16.github.io/consumer-profile-dashboard/";

async function refresh() {
  const granted = await chrome.permissions.contains({ permissions: ["history"] });
  const { authorizedOrigins = {}, captured = [] } = await chrome.storage.local.get({ authorizedOrigins: {}, captured: [] });
  const origins = Object.keys(authorizedOrigins);
  const connected = granted && origins.length > 0;
  $("conn").textContent = connected ? "● Connected" : "○ Not connected";
  $("conn").className = `pill ${connected ? "on" : "off"}`;
  $("connDetail").textContent = connected
    ? `${origins.map((o) => new URL(o).host).join(", ")} can read your history (approved ${new Date(authorizedOrigins[origins[0]].grantedAt).toLocaleDateString()}).`
    : "No dashboard can read your history.";
  $("disconnect").hidden = !granted && !origins.length;
  $("capCount").textContent = String(captured.length);
}

$("open").addEventListener("click", () => chrome.tabs.create({ url: `${DASHBOARD_URL}#/connect` }));
$("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.set({ authorizedOrigins: {} });
  await chrome.permissions.remove({ permissions: ["history"] });
  msg("Disconnected. The history permission was removed.");
  refresh();
});

function download(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$("export").addEventListener("click", async () => {
  // Asking from this click shows Chrome's prompt if the permission is not granted yet.
  if (!(await chrome.permissions.request({ permissions: ["history"] }))) return msg("History permission was not granted.");
  const days = Number($("days").value) || 90;
  msg("Collecting history…");
  const startTime = Date.now() - days * 86400000;
  const items = await chrome.history.search({ text: "", startTime, maxResults: 20000 });
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const visits = i < 6000 ? (await chrome.history.getVisits({ url: it.url })).filter((v) => v.visitTime >= startTime).map((v) => ({ t: Math.round(v.visitTime), tr: v.transition })) : [];
    out.push({ url: it.url, title: it.title || "", visitCount: it.visitCount || 0, typedCount: it.typedCount || 0, lastVisitTime: Math.round(it.lastVisitTime || 0), visits });
  }
  download({ format: "consumer-lab-extension/v1", exportedAt: new Date().toISOString(), days, items: out }, `chrome-history-${days}d.json`);
  msg(`Exported ${out.length} history entries. Keep this file private.`);
  refresh();
});

/* Runs inside the page the user opened. Reads only structured product data the page publishes. */
function extractProducts() {
  const out = [];
  // Parse a published price without guessing: "1,299.00" → 1299, "1.299,00" → 1299, "19,99" → 19.99; anything unparseable → null.
  const num = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    let t = String(v ?? "").replace(/[^0-9.,]/g, "");
    if (!t) return null;
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else t = t.replace(/,/g, "");
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = [].concat(node["@type"] || []).map(String);
    if (type.includes("Product")) {
      const offers = [].concat(node.offers || []);
      const offer = offers.find((o) => o && (o.price || o.lowPrice)) || offers[0] || {};
      const img = [].concat(node.image || [])[0];
      out.push({
        name: String(node.name || "").trim(), url: node.url ? new URL(node.url, location.href).href : location.href,
        image: typeof img === "string" ? img : img && img.url, brand: typeof node.brand === "string" ? node.brand : node.brand && node.brand.name,
        price: num(offer.price ?? offer.lowPrice), currency: offer.priceCurrency || null,
        availability: offer.availability ? String(offer.availability).split("/").pop() : null,
        category: node.category || null, rating: node.aggregateRating ? num(node.aggregateRating.ratingValue) : null,
        reviewCount: node.aggregateRating ? num(node.aggregateRating.reviewCount || node.aggregateRating.ratingCount) : null,
        evidence: "json-ld",
      });
    }
    Object.values(node).forEach((v) => typeof v === "object" && visit(v));
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { visit(JSON.parse(s.textContent)); } catch (e) { /* ignore malformed blocks */ } });
  if (!out.length) {
    const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content;
    if ((meta("og:type") || "").includes("product") || meta("product:price:amount")) {
      out.push({ name: meta("og:title") || document.title, url: meta("og:url") || location.href, image: meta("og:image") || null, brand: meta("product:brand") || null,
        price: num(meta("product:price:amount") || meta("og:price:amount")), currency: meta("product:price:currency") || meta("og:price:currency") || null,
        availability: meta("product:availability") || null, category: null, rating: null, reviewCount: null, evidence: "opengraph" });
    }
  }
  return { products: out.filter((p) => p.name), page: location.href, retailer: location.hostname.replace(/^www\./, "") };
}

$("capture").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) return msg("Open a retailer page in this tab first.");
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProducts });
    if (!result.products.length) return msg("No published product data found on this page. Try a product detail page, or use the dashboard's catalog import.");
    const capturedAt = new Date().toISOString();
    const { captured = [] } = await chrome.storage.local.get({ captured: [] });
    const fresh = result.products.map((p) => ({ ...p, retailer: result.retailer, page: result.page, capturedAt }));
    const merged = [...captured.filter((c) => !fresh.some((f) => f.url === c.url)), ...fresh].slice(-500);
    await chrome.storage.local.set({ captured: merged });
    msg(`Captured ${fresh.length} product(s) from ${result.retailer}.`);
    refresh();
  } catch (e) { msg("This page cannot be read (browser-protected page or site restriction)."); }
});
$("exportProducts").addEventListener("click", async () => {
  const { captured = [] } = await chrome.storage.local.get({ captured: [] });
  download({ format: "consumer-lab-products/v1", exportedAt: new Date().toISOString(), products: captured }, "captured-products.json");
});
$("clearProducts").addEventListener("click", async () => { await chrome.storage.local.set({ captured: [] }); msg("Captured products cleared."); refresh(); });

refresh();
