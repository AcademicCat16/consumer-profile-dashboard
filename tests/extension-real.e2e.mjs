/**
 * Real-extension test: Playwright's Chromium with the actual unpacked extension loaded (branded Chrome no longer
 * allows --load-extension). The dashboard is served from dist/ at its production URL via request interception,
 * so externally_connectable matches exactly as in production.
 *
 * One deliberate difference: the test copy of the manifest makes "history" a REQUIRED permission, because automation
 * cannot click Chrome's native "Read your browsing history" prompt. Everything else — install welcome tab, detection,
 * the consent window, approval, automatic analysis, disconnect, popup state — runs for real.
 * History comes from URLs this test adds to the fresh, temporary browser profile (synthetic, not anyone's data).
 * Run: npm run build && node tests/extension-real.e2e.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const TMP = join(here, ".tmp"); const EXT = join(TMP, "ext-real"); const PROFILE = join(TMP, "profile-real");
const SHOTS = join(here, "screenshots"); mkdirSync(SHOTS, { recursive: true });
const DASH = "https://academiccat16.github.io/consumer-profile-dashboard/";
const DEV_ID = "nofeapdkbkkkmfhjmomblmaihnbgcelm";
rmSync(EXT, { recursive: true, force: true }); rmSync(PROFILE, { recursive: true, force: true });
cpSync(join(root, "extension"), EXT, { recursive: true });
const m = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
m.permissions.push("history"); m.optional_permissions = [];
writeFileSync(join(EXT, "manifest.json"), JSON.stringify(m, null, 2));

let passed = 0; const fails = [];
const check = (c, l) => { if (c) { passed++; console.log("  ✓", l); } else { fails.push(l); console.log("  ✗", l); } };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route("https://academiccat16.github.io/**", (route) => {
  const u = new URL(route.request().url());
  let p = u.pathname.replace(/^\/consumer-profile-dashboard\/?/, "") || "index.html";
  const f = join(root, "dist", p);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
  route.fulfill({ path: f, contentType: TYPES[extname(f)] ?? "application/octet-stream" });
});

try {
  console.log("1. Install");
  let sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = new URL(sw.url()).host;
  check(id === DEV_ID, `extension loaded with the development ID (${id})`);
  // the welcome tab may have opened before routing was ready: find it and reload it through the route
  let dash = ctx.pages().find((p) => p.url().startsWith(DASH));
  for (let i = 0; !dash && i < 20; i++) { await new Promise((r) => setTimeout(r, 250)); dash = ctx.pages().find((p) => p.url().startsWith(DASH)); }
  check(!!dash && /installed=1/.test(dash.url()), "installing opened the dashboard's connect step");
  await dash.reload({ waitUntil: "networkidle" }); await dash.waitForTimeout(800);

  // add synthetic visits to the temporary profile's history
  await sw.evaluate(async () => {
    const urls = ["https://www.amazon.com/dp/B0TEST1", "https://www.rtings.com/headphones/reviews/sony", "https://github.com/test/repo", "https://www.youtube.com/watch?v=test1", "https://www.netflix.com/browse", "https://www.bestbuy.com/site/test", "https://stackoverflow.com/questions/1", "https://www.ikea.com/us/en/p/test"];
    for (let k = 0; k < 3; k++) for (const u of urls) await chrome.history.addUrl({ url: `${u}?n=${k}` });
  });

  console.log("2. Detect → Connect → Approve → Explore");
  check(await dash.getByText("Extension installed. One more step.").isVisible(), "dashboard detects the real extension and shows the one remaining step");
  check((await dash.locator(".stepper li.current .lbl").innerText()) === "Approve permission", "step 2 current");
  // Store screenshot: show the label the store build renders ("Extension 1.1.0"), not the test-build suffix.
  await dash.evaluate(() => document.querySelectorAll(".onboarding .chip").forEach((c) => { c.innerHTML = c.innerHTML.replace(" (test build)", ""); }));
  await dash.screenshot({ path: join(SHOTS, "real-onboarding.png") });
  const consentP = ctx.waitForEvent("page", { timeout: 10000 });
  await dash.click('[data-testid="connect-chrome"]');
  const consent = await consentP; await consent.waitForLoadState(); await consent.waitForTimeout(400);
  check(consent.url().startsWith(`chrome-extension://${DEV_ID}/consent.html?id=`), "the extension's own consent window opened");
  check((await consent.locator("#origin").innerText()) === "academiccat16.github.io" && (await consent.locator("#days").innerText()) === "last 90 days", "consent window shows the requesting site and period");
  await consent.setViewportSize({ width: 460, height: 640 }); await consent.screenshot({ path: join(SHOTS, "real-consent.png") });
  const closed = consent.waitForEvent("close", { timeout: 10000 });
  await consent.click("#allow");
  await closed;
  check(true, "Allow approved and the window closed itself");
  await dash.waitForFunction(() => window.location.hash === "#/overview", null, { timeout: 20000 });
  await dash.getByText("Consumer Overview", { exact: true }).last().waitFor(); await dash.waitForTimeout(500);
  const ov = await dash.locator("main").innerText();
  const n = +(ov.match(/([\d,]+)\s*analysed visits/)?.[1] ?? "0").replace(/,/g, "");
  check(n >= 20, `analysis started automatically from real chrome.history (${n} analysed visits)`);
  check(/amazon\.com|github\.com/.test(ov), "profile shows sites from the history");

  console.log("3. Popup reflects the connection");
  const popup = await ctx.newPage(); await popup.setViewportSize({ width: 360, height: 560 });
  await popup.goto(`chrome-extension://${id}/popup.html`); await popup.waitForTimeout(400);
  check(/Connected/.test(await popup.locator("#conn").innerText()) && /academiccat16\.github\.io/.test(await popup.locator("#connDetail").innerText()), "popup shows Connected with the approved site");
  await popup.screenshot({ path: join(SHOTS, "real-popup.png") });

  console.log("4. Returning visit: no second prompt");
  await dash.goto(DASH + "#/connect"); await dash.reload({ waitUntil: "networkidle" }); await dash.waitForTimeout(1000);
  check(await dash.getByText("Welcome back. Chrome is connected.").isVisible(), "after reload the approval is remembered (data is not)");
  const pagesBefore = ctx.pages().length;
  await dash.click('[data-testid="load-profile"]');
  await dash.waitForFunction(() => window.location.hash === "#/overview", null, { timeout: 20000 });
  check(ctx.pages().length === pagesBefore, "one click loads the profile without another consent window");

  console.log("5. Disconnect from the dashboard");
  await dash.evaluate(() => { window.location.hash = "/privacy"; }); await dash.waitForTimeout(800);
  await dash.click('[data-testid="disconnect"]'); await dash.waitForTimeout(800);
  check(/This dashboard\s*Not connected/.test(await dash.locator('[data-testid="ext-status"]').innerText()), "dashboard shows Not connected after disconnect");
  await popup.reload(); await popup.waitForTimeout(400);
  check(/Not connected/.test(await popup.locator("#conn").innerText()), "popup agrees: not connected");
  const r = await dash.evaluate((extId) => new Promise((res) => chrome.runtime.sendMessage(extId, { type: "getHistory", days: 30 }, res)), DEV_ID);
  check(r && r.ok === false && r.error === "origin_not_authorized", "history requests are refused after disconnect");
} catch (e) { fails.push(String(e)); console.error(e); }
finally { await ctx.close(); rmSync(PROFILE, { recursive: true, force: true }); }
console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => " - " + f).join("\n")); process.exit(1); }
