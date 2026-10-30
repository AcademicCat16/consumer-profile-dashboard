/*
 * Consumer Lab Connector — background service worker.
 * Answers requests from the dashboard page only (externally_connectable restricts which sites can ask).
 * History is returned ONLY if (1) you granted Chrome's optional "history" permission and
 * (2) you switched on "Allow dashboard connection" in the popup. Nothing is sent anywhere else.
 * Cookies, passwords and session data are never requested or read.
 */
const MAX_ITEMS_CAP = 20000;
const MAX_VISIT_LOOKUPS = 6000;

async function settings() {
  const s = await chrome.storage.local.get({ allowDashboard: false, days: 90 });
  return s;
}
async function hasHistory() {
  return chrome.permissions.contains({ permissions: ["history"] });
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    const s = await settings();
    const granted = await hasHistory();
    if (!msg || typeof msg.type !== "string") return sendResponse({ ok: false, error: "bad_request" });

    if (msg.type === "ping") {
      return sendResponse({ ok: true, version: chrome.runtime.getManifest().version, historyGranted: granted, dashboardAllowed: s.allowDashboard, days: s.days, origin: sender.origin });
    }
    if (msg.type === "getHistory") {
      if (!granted) return sendResponse({ ok: false, error: "history_permission_not_granted" });
      if (!s.allowDashboard) return sendResponse({ ok: false, error: "dashboard_connection_not_allowed" });
      const days = Math.min(Math.max(Number(msg.days) || s.days, 1), 365);
      const maxItems = Math.min(Math.max(Number(msg.maxItems) || 10000, 1), MAX_ITEMS_CAP);
      const startTime = Date.now() - days * 86400000;
      const items = await chrome.history.search({ text: "", startTime, maxResults: maxItems });
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let visits = [];
        if (i < MAX_VISIT_LOOKUPS) {
          const v = await chrome.history.getVisits({ url: it.url });
          visits = v.filter((x) => x.visitTime >= startTime).map((x) => ({ t: Math.round(x.visitTime), tr: x.transition }));
        }
        out.push({ url: it.url, title: it.title || "", visitCount: it.visitCount || 0, typedCount: it.typedCount || 0, lastVisitTime: Math.round(it.lastVisitTime || 0), visits });
      }
      return sendResponse({ ok: true, format: "consumer-lab-extension/v1", exportedAt: new Date().toISOString(), days, items: out });
    }
    if (msg.type === "getCapturedProducts") {
      if (!s.allowDashboard) return sendResponse({ ok: false, error: "dashboard_connection_not_allowed" });
      const { captured = [] } = await chrome.storage.local.get({ captured: [] });
      return sendResponse({ ok: true, products: captured });
    }
    return sendResponse({ ok: false, error: "unknown_request" });
  })().catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // async response
});
