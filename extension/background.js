/*
 * Consumer Lab Connector — background service worker.
 *
 * Consent model (one authorization, revocable):
 *  - Only the dashboard origins listed in manifest "externally_connectable" can talk to this extension.
 *  - When the dashboard asks to connect, this worker opens the extension's own consent window (consent.html).
 *    Only a click inside that window, followed by Chrome's native "Read your browsing history" prompt the first time,
 *    authorizes that dashboard origin. A web page cannot click it or grant itself access.
 *  - History is returned only while BOTH the Chrome permission is granted AND the asking origin is authorized.
 *  - Disconnecting (dashboard or popup) or removing the permission in Chrome clears every authorization.
 * Cookies, passwords, form data and sign-in data are never requested or read. Nothing is sent anywhere except to
 * the authorized dashboard tab that asked for it, where it is analysed locally.
 */
const DASHBOARD_URL = "https://academiccat16.github.io/consumer-profile-dashboard/";
const MAX_ITEMS_CAP = 20000;
const MAX_VISIT_LOOKUPS = 6000;

const hasHistory = () => chrome.permissions.contains({ permissions: ["history"] });
const getAuth = async () => (await chrome.storage.local.get({ authorizedOrigins: {} })).authorizedOrigins;
const clearAuth = () => chrome.storage.local.set({ authorizedOrigins: {} });

// Welcome tab after a fresh install, so students land straight on the connect step.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: `${DASHBOARD_URL}#/connect?installed=1` });
});
// If the permission is removed anywhere (popup, chrome://extensions, site settings), forget all authorizations.
chrome.permissions.onRemoved.addListener((p) => { if (p.permissions?.includes("history")) clearAuth(); });

async function readHistory(days, maxItems) {
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
  return out;
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== "string") return sendResponse({ ok: false, error: "bad_request" });
    const origin = sender.origin;
    const granted = await hasHistory();
    const auth = await getAuth();
    const authorized = granted && !!auth[origin];

    if (msg.type === "ping") {
      return sendResponse({ ok: true, version: chrome.runtime.getManifest().version, historyGranted: granted, authorized, authorizedAt: authorized ? auth[origin].grantedAt : null, authorizedDays: authorized ? auth[origin].days ?? null : null, origin });
    }
    if (msg.type === "connect") {
      const days = Math.min(Math.max(Number(msg.days) || 90, 1), 365);
      // Already approved for at least this period: nothing to ask. A longer period needs a new approval.
      if (authorized && (auth[origin].days ?? 0) >= days) return sendResponse({ ok: true, status: "already_authorized" });
      const id = crypto.randomUUID();
      await chrome.storage.session.set({ [`req:${id}`]: { origin, days, tabId: sender.tab?.id ?? null, windowId: sender.tab?.windowId ?? null, at: Date.now() } });
      await chrome.windows.create({ url: chrome.runtime.getURL(`consent.html?id=${id}`), type: "popup", width: 460, height: 640, focused: true });
      return sendResponse({ ok: true, status: "consent_opened" });
    }
    if (msg.type === "getHistory") {
      if (!granted) return sendResponse({ ok: false, error: "history_permission_not_granted" });
      if (!auth[origin]) return sendResponse({ ok: false, error: "origin_not_authorized" });
      // Never read further back than the period the user approved.
      const days = Math.min(Math.max(Number(msg.days) || 90, 1), auth[origin].days ?? 90, 365);
      const maxItems = Math.min(Math.max(Number(msg.maxItems) || 10000, 1), MAX_ITEMS_CAP);
      const items = await readHistory(days, maxItems);
      return sendResponse({ ok: true, format: "consumer-lab-extension/v1", exportedAt: new Date().toISOString(), days, items });
    }
    if (msg.type === "getCapturedProducts") {
      // Products are pages the user explicitly captured; still only shared with an authorized dashboard.
      if (!auth[origin]) return sendResponse({ ok: false, error: "origin_not_authorized" });
      const { captured = [] } = await chrome.storage.local.get({ captured: [] });
      return sendResponse({ ok: true, products: captured });
    }
    if (msg.type === "disconnect") {
      await clearAuth();
      // Authorization is already gone; also drop the optional permission (fails harmlessly if Chrome treats it as required).
      if (granted) { try { await chrome.permissions.remove({ permissions: ["history"] }); } catch { /* ignore */ } }
      return sendResponse({ ok: true });
    }
    return sendResponse({ ok: false, error: "unknown_request" });
  })().catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // async response
});
