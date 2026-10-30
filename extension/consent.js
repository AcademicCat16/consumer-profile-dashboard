/*
 * Consent window opened by the background worker when the dashboard asks to connect.
 * The request details come from chrome.storage.session (written by the worker), never from the page that asked.
 * Clicking "Allow" is the user's explicit authorization; Chrome's own permission prompt follows the first time.
 */
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
const key = `req:${id}`;
let req = null;

const status = (t, bad = false) => { $("status").textContent = t; $("status").className = `status${bad ? " bad" : ""}`; };
const backToDashboard = async () => {
  if (req?.tabId != null) { try { await chrome.tabs.update(req.tabId, { active: true }); } catch { /* tab closed */ } }
  if (req?.windowId != null) { try { await chrome.windows.update(req.windowId, { focused: true }); } catch { /* window closed */ } }
  window.close();
};

(async () => {
  req = (await chrome.storage.session.get(key))[key] ?? null;
  if (!req || Date.now() - req.at > 10 * 60 * 1000) {
    status("This request has expired. Go back to the dashboard and click Connect Chrome again.", true);
    $("allow").disabled = true;
    return;
  }
  $("origin").textContent = new URL(req.origin).host;
  $("days").textContent = `last ${req.days} days`;
  if (await chrome.permissions.contains({ permissions: ["history"] })) $("firstTime").hidden = true;
})();

$("allow").addEventListener("click", async () => {
  if (!req) return;
  $("allow").disabled = true;
  // Must run directly from this click (user gesture) for Chrome to show its prompt.
  const granted = await chrome.permissions.request({ permissions: ["history"] });
  if (!granted) {
    status("Chrome's permission was not granted, so nothing was shared. You can try again from the dashboard.", true);
    $("allow").disabled = false;
    return;
  }
  const { authorizedOrigins = {} } = await chrome.storage.local.get({ authorizedOrigins: {} });
  authorizedOrigins[req.origin] = { grantedAt: new Date().toISOString(), days: req.days };
  await chrome.storage.local.set({ authorizedOrigins });
  await chrome.storage.session.remove(key);
  status("Connected. Returning to your dashboard…");
  setTimeout(backToDashboard, 500);
});

$("deny").addEventListener("click", async () => {
  if (req) await chrome.storage.session.remove(key);
  backToDashboard();
});
