/**
 * Onboarding flow test: the dashboard talking to a MOCKED extension (chrome.runtime injected before load),
 * covering not-installed, outdated, first connect (approval → automatic analysis), returning user and disconnect.
 * History returned by the mock is the SYNTHETIC fixture from make-fixtures.mjs.
 * Local: npm run build && node tests/onboarding.e2e.mjs     Live: BASE_URL=<site> node tests/onboarding.e2e.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { writeFixtures } from "./make-fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "screenshots"); mkdirSync(SHOTS, { recursive: true });
const LIVE = process.env.BASE_URL;
const BASE = LIVE ?? "http://localhost:4175/consumer-profile-dashboard/";
let server;
if (!LIVE) {
  server = spawn("npx vite preview --port 4175 --strictPort", { cwd: join(here, ".."), shell: true, stdio: "pipe" });
  for (let i = 0; ; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up */ } if (i > 60) throw new Error("preview did not start"); await new Promise((r) => setTimeout(r, 500)); }
}
const files = writeFixtures();
const items = JSON.parse(readFileSync(files.find((f) => /chrome-history/.test(f)), "utf8")).items;

let passed = 0; const fails = [];
const check = (c, l) => { if (c) { passed++; console.log("  ✓", l); } else { fails.push(l); console.log("  ✗", l); } };

/** Injects a fake externally_connectable runtime that answers only for the development extension ID. */
const mockScript = ({ items, initial }) => {
  const DEV = "nofeapdkbkkkmfhjmomblmaihnbgcelm";
  const s = { ...initial, log: [] };
  window.__ext = s;
  const rt = {
    lastError: undefined,
    sendMessage(id, msg, cb) {
      s.log.push(msg.type);
      setTimeout(() => {
        if (id !== DEV || !s.installed) { rt.lastError = { message: "Could not establish connection. Receiving end does not exist." }; cb(undefined); rt.lastError = undefined; return; }
        const authorized = s.granted && !!s.auth;
        if (msg.type === "ping") return cb({ ok: true, version: s.version, historyGranted: s.granted, authorized, authorizedAt: authorized ? s.auth.at : null, authorizedDays: authorized ? s.auth.days : null });
        if (msg.type === "connect") {
          if (authorized && s.auth.days >= msg.days) return cb({ ok: true, status: "already_authorized" });
          s.consentOpened = (s.consentOpened ?? 0) + 1;
          // the user clicks Allow in the extension window ~1.2 s later
          setTimeout(() => { if (s.approve) { s.granted = true; s.auth = { at: new Date().toISOString(), days: msg.days }; } }, 1200);
          return cb({ ok: true, status: "consent_opened" });
        }
        if (msg.type === "getHistory") return authorized ? cb({ ok: true, format: "consumer-lab-extension/v1", days: Math.min(msg.days, s.auth.days), items }) : cb({ ok: false, error: "origin_not_authorized" });
        if (msg.type === "disconnect") { s.granted = false; s.auth = null; return cb({ ok: true }); }
        cb({ ok: false, error: "unknown_request" });
      }, 20);
    },
  };
  window.chrome = { ...(window.chrome || {}), runtime: rt };
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const open = async (initial) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  if (initial) await page.addInitScript(mockScript, { items, initial });
  await page.goto(BASE + "#/connect", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return { ctx, page };
};

try {
  console.log("A. Chrome without the extension");
  let { ctx, page } = await open(null);
  check(await page.getByText("Set up in three steps").isVisible(), "three-step onboarding shown first");
  check(await page.locator('[data-testid="store-pending"]').isVisible(), "says the Chrome Web Store listing is not published yet");
  check(!(await page.locator('[data-testid="store-link"]').count()) && !/chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(await page.content()), "no Chrome Web Store URL is shown or invented");
  check(await page.getByText("Temporary test installation (testing only").isVisible(), "temporary install path clearly labelled for testing");
  check((await page.locator(".stepper li.current .lbl").innerText()) === "Connect Chrome", "step 1 is current");
  await page.screenshot({ path: join(SHOTS, "onb-1-install.png") });
  await ctx.close();

  console.log("B. Outdated extension");
  ({ ctx, page } = await open({ installed: true, version: "1.0.0", granted: false, auth: null, approve: true }));
  check(await page.getByText("Update the Consumer Lab extension").isVisible(), "outdated version asks for an update");
  await ctx.close();

  console.log("C. First connect: Connect Chrome → Approve → Explore");
  ({ ctx, page } = await open({ installed: true, version: "1.1.0", granted: false, auth: null, approve: true }));
  check((await page.locator(".stepper li.current .lbl").innerText()) === "Approve permission" && (await page.locator(".stepper li.done").count()) === 1, "extension detected; step 2 current");
  check(!(await page.locator('input[type="checkbox"]').count()), "no redundant consent checkbox or toggle on the dashboard");
  await page.screenshot({ path: join(SHOTS, "onb-2-connect.png") });
  const before = await page.evaluate(() => window.__ext.log.filter((t) => t === "getHistory").length);
  check(before === 0, "no history requested before approval");
  await page.click('[data-testid="connect-chrome"]');
  await page.waitForTimeout(300);
  check(await page.locator('[data-testid="waiting"]').isVisible(), "waits for approval in the Chrome window");
  await page.screenshot({ path: join(SHOTS, "onb-3-waiting.png") });
  await page.waitForFunction(() => window.location.hash === "#/overview", null, { timeout: 15000 });
  check(true, "after approval the analysis starts automatically and opens the overview");
  await page.getByText("Consumer Overview", { exact: true }).last().waitFor();
  await page.waitForTimeout(400);
  const ov = await page.locator("main").innerText();
  check(/analysed visits/.test(ov) && /Chrome history|1 source/.test(ov), "profile built from the history the extension returned");
  check((await page.evaluate(() => window.__ext.consentOpened)) === 1, "exactly one consent window was requested");
  await page.screenshot({ path: join(SHOTS, "onb-4-overview.png") });

  console.log("D. Disconnect from Data & Privacy");
  await page.evaluate(() => { window.location.hash = "/privacy"; }); await page.waitForTimeout(800);
  check(/Connected · 90 days/.test(await page.locator('[data-testid="ext-status"]').innerText()), "privacy page shows the connection and approved period");
  await page.click('[data-testid="disconnect"]'); await page.waitForTimeout(500);
  check(/Not connected/.test(await page.locator('[data-testid="ext-status"]').innerText()) && (await page.evaluate(() => window.__ext.granted)) === false, "disconnect revokes the permission and approval");
  await ctx.close();

  console.log("E. Returning user (already approved): one click");
  ({ ctx, page } = await open({ installed: true, version: "1.1.0", granted: true, auth: { at: "2026-10-01T10:00:00Z", days: 90 }, approve: true }));
  check(await page.getByText("Welcome back. Chrome is connected.").isVisible(), "returning user recognised");
  check((await page.evaluate(() => window.__ext.log.filter((t) => t === "getHistory").length)) === 0, "history is not read silently on page load");
  await page.click('[data-testid="load-profile"]');
  await page.waitForFunction(() => window.location.hash === "#/overview", null, { timeout: 15000 });
  check((await page.evaluate(() => window.__ext.consentOpened ?? 0)) === 0, "no repeated consent prompt");
  await ctx.close();

  console.log("F. Approval declined");
  ({ ctx, page } = await open({ installed: true, version: "1.1.0", granted: false, auth: null, approve: false }));
  await page.click('[data-testid="connect-chrome"]'); await page.waitForTimeout(3000);
  check(await page.locator('[data-testid="waiting"]').isVisible() && !(await page.evaluate(() => window.__ext.log.includes("getHistory"))), "without approval nothing is read (keeps waiting, can cancel)");
  await page.getByRole("button", { name: "Cancel" }).click();
  check(await page.locator('[data-testid="connect-chrome"]').isVisible(), "cancel returns to Connect");
  await ctx.close();

  console.log("G. Phone layout");
  ({ ctx, page } = await open({ installed: true, version: "1.1.0", granted: false, auth: null, approve: true }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal scroll on phone");
  await page.screenshot({ path: join(SHOTS, "onb-5-mobile.png"), fullPage: true });
  await ctx.close();

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""}`);
} catch (e) { fails.push(String(e)); console.error(e); }
finally { await browser.close(); server?.kill(); }
console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => " - " + f).join("\n")); process.exit(1); }
