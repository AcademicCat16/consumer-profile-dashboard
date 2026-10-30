/**
 * End-to-end test with the system Chrome (playwright-core). Uses SYNTHETIC fixtures from make-fixtures.mjs only.
 * Local:  npm run build && node tests/e2e.mjs        Live:  BASE_URL=https://academiccat16.github.io/consumer-profile-dashboard/ node tests/e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { writeFixtures } from "./make-fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const LIVE = process.env.BASE_URL;
const BASE = LIVE ?? "http://localhost:4175/consumer-profile-dashboard/";
const ALLOWED_HOSTS = new Set([new URL(BASE).host, "fonts.googleapis.com", "fonts.gstatic.com"]);

let server;
if (!LIVE) {
  server = spawn("npx vite preview --port 4175 --strictPort", { cwd: join(here, ".."), shell: true, stdio: "pipe" });
  for (let i = 0; ; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } if (i > 60) throw new Error("preview did not start"); await new Promise((r) => setTimeout(r, 500)); }
}

let passed = 0;
const fails = [];
const check = (cond, label) => { if (cond) { passed++; console.log("  ✓", label); } else { fails.push(label); console.log("  ✗", label); } };

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [], foreign = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("request", (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !ALLOWED_HOSTS.has(u.host)) foreign.push(r.url()); });
const shot = (name, full = true) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full });
const go = async (id) => { await page.evaluate((h) => { window.location.hash = h; }, `/${id}`); await page.waitForTimeout(700); };

try {
  console.log("1. Opens on the private-data connection screen with no insights");
  await page.goto(BASE, { waitUntil: "networkidle" });
  check(await page.getByText("A consumer profile built only from").isVisible(), "connection hero visible");
  check(await page.getByText("Extension not detected").isVisible(), "extension status shown honestly (not installed in test browser)");
  const body0 = await page.locator("main").innerText();
  check(!/Strong price focus|Leans brand-loyal|analysed visits \(of/.test(body0), "no profile insights before data");
  await shot("01-connect");
  await go("overview");
  check(await page.getByText("opens after you connect or import").isVisible(), "locked section explains data is required");

  console.log("2. Import synthetic fixtures");
  const files = writeFixtures();
  await go("connect");
  await page.setInputFiles('[data-testid="file-input"]', files.filter((f) => !/catalog/.test(f)));
  await page.waitForTimeout(1500);
  const log = await page.locator(".ev").first().innerText();
  check((log.match(/Imported/g) ?? []).length === 4, "4 files imported with detected formats");
  check(await page.getByText("Open your overview").isVisible(), "data summary appears after import");

  console.log("3. Overview");
  await go("overview");
  const ov = await page.locator("main").innerText();
  const m = ov.match(/Excluded before analysis: (\d+) sensitive-topic records/);
  check(m && +m[1] > 0, `sensitive records excluded (${m?.[1]})`);
  check(/analysed visits/.test(ov) && /github\.com|amazon\.com/.test(ov), "counts and top sites rendered");
  check(!/webmd/i.test(ov), "excluded sensitive site never displayed");
  await shot("02-overview");

  console.log("4. Interest Universe");
  await go("universe"); await page.waitForTimeout(1500);
  const canvases = await page.locator('[data-testid="universe-canvas"] canvas').count();
  check(canvases >= 2, `sigma rendered (${canvases} canvas layers)`);
  await shot("03a-universe-default", false);
  const intro = await page.locator(".page-head p").innerText();
  const nn = intro.match(/(\d[\d,]*) nodes, (\d[\d,]*) links and (\d+) communities/);
  check(nn && +nn[1].replace(/,/g, "") > 10 && +nn[3] >= 2, `network stats ${nn?.[0]}`);
  await page.fill('input[aria-label="Search nodes"]', "github"); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  check(await page.getByText("Records behind this node").isVisible(), "search selects node and shows evidence panel");
  await page.getByText("Records behind this node").click(); await page.waitForTimeout(200);
  check((await page.locator(".ev-item").count()) > 0, "node evidence lists real (fixture) records");
  await shot("03-universe", false);

  console.log("5. Digital Footprint");
  await go("footprint"); await page.waitForTimeout(1200);
  check((await page.locator('[data-testid="streamgraph"] path').count()) > 3, "streamgraph drawn");
  check((await page.locator('[data-testid="radial-clock"] path').count()) === 168, "radial clock has 7×24 cells");
  check((await page.locator('[data-testid="calendar"] rect').count()) >= 365, "calendar heatmap drawn");
  check((await page.locator('[data-testid="sankey"] rect').count()) > 2, "category flow sankey drawn");
  await shot("04-footprint");

  console.log("6. Personality");
  await go("personality");
  const traitsText = await page.locator("main").innerText();
  check(/ratio \d\.\d\d/.test(traitsText), "traits show transparent ratios");
  check(!/probabilit(y|ies) of|\d+% (likely|chance)/i.test(traitsText.replace(/no probabilities are invented/i, "")), "no invented probabilities");
  check(/Based on \d+ shopping sessions \(minimum 6\)/.test(traitsText), "sample size and minimum shown");
  await shot("05-personality");

  console.log("7. Segments");
  await go("segments");
  check(await page.locator('[data-testid="overlap"]').isVisible(), "overlap map rendered");
  await shot("06-segments");

  console.log("8. Recommendations before products");
  await go("recommendations");
  check(await page.getByText("No products to recommend yet").isVisible(), "no recommendations without real products");

  console.log("9. Product Discovery: catalog import");
  await go("discovery");
  await page.setInputFiles('[data-testid="catalog-input"]', files.filter((f) => /catalog/.test(f)));
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid="product-table"] tbody tr').count()) === 4, "4 catalog products listed");
  const tableText = await page.locator('[data-testid="product-table"]').innerText();
  check(/329\.99 USD/.test(tableText) && /OutOfStock/.test(tableText), "prices and availability exactly as imported");
  await shot("07-discovery");

  console.log("10. Recommendations");
  await go("recommendations");
  const cards = page.locator(".rec");
  check((await cards.count()) === 4, "4 ranked real products");
  const first = await cards.first().innerText();
  check(/Sony|Bose|Apple/.test(first.split("\n")[0]) && !/garden hose/i.test(first.split("\n")[0]), "headphone/brand-matched product ranks above the garden hose");
  check(/Why it ranks here/.test(first) && /Category interest/.test(first), "factor explanation shown");
  const hoseIdx = (await cards.allInnerTexts()).findIndex((t) => /garden hose/i.test(t));
  check(hoseIdx === 3, `unrelated product ranks last (position ${hoseIdx + 1})`);
  await shot("08-recommendations");

  console.log("11. AI vs. Reality feedback updates the profile");
  await go("segments");
  const before = await page.locator("main").innerText();
  await go("reality");
  const priceRow = page.locator('[data-testid="fb-row-price"]');
  const hasPrice = await priceRow.count();
  if (hasPrice) {
    await priceRow.getByRole("button", { name: "Inaccurate" }).first().click();
    await page.waitForTimeout(300);
    check(await page.getByText("How your corrections changed the profile").isVisible(), "correction summary appears");
    await go("segments");
    const after = await page.locator("main").innerText();
    check(/You marked the “Price sensitivity” prediction as inaccurate/.test(after), "Deal Seeker segment suppressed by feedback");
    check(before !== after, "segments view changed");
  } else check(false, "price trait available to test feedback");
  await go("reality");
  const brandRow = page.locator('[data-testid="fb-row-brand:Sony"]');
  await brandRow.getByRole("button", { name: "Inaccurate" }).first().click(); await page.waitForTimeout(300);
  check(await page.getByText(/Removed Sony \(brand\)/).isVisible(), "rejected brand removed from profile (restorable)");
  await shot("09-reality");

  console.log("12. Privacy: delete records and sources");
  await go("privacy");
  const visitsChip = await page.locator("button.chip", { hasText: /^Visits \(/ }).innerText();
  const nBefore = +visitsChip.match(/\(([\d,]+)\)/)[1].replace(/,/g, "");
  await page.locator('[data-testid="records-table"] button[aria-label="Delete record"]').first().click(); await page.waitForTimeout(300);
  const nAfter = +(await page.locator("button.chip", { hasText: /^Visits \(/ }).innerText()).match(/\(([\d,]+)\)/)[1].replace(/,/g, "");
  check(nAfter === nBefore - 1, `deleting one visit (${nBefore} → ${nAfter})`);
  const srcRows = await page.locator('[data-testid="sources-table"] tbody tr').count();
  await page.locator('[data-testid="sources-table"] button', { hasText: "Delete" }).last().click(); await page.waitForTimeout(300);
  check((await page.locator('[data-testid="sources-table"] tbody tr').count()) === srcRows - 1, "deleting a source");
  check(!(await page.evaluate(() => localStorage.getItem("cl-persist"))), "persistence off by default");
  const idb = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  check(!idb.includes("consumer-lab"), "no IndexedDB copy of records by default");
  await shot("10-privacy");

  console.log("13. Theme + mobile");
  await page.getByRole("button", { name: "Toggle colour theme" }).click(); await page.waitForTimeout(300);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "light", "light mode");
  await go("overview"); await shot("11-overview-light");
  await go("footprint"); await page.waitForTimeout(800); await shot("12-footprint-light");
  await page.setViewportSize({ width: 390, height: 844 }); await go("overview"); await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal page scroll on phone (overflow ${overflow}px)`);
  await shot("13-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("14. Delete everything returns to the empty connection screen");
  await go("privacy");
  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.getByRole("button", { name: "Yes, delete everything" }).click(); await page.waitForTimeout(500);
  check(await page.getByText("A consumer profile built only from").isVisible() && !(await page.getByText("Open your overview").count()), "all data removed");

  console.log("15. Reload keeps nothing (memory only)");
  await page.reload({ waitUntil: "networkidle" }); await go("overview");
  check(await page.getByText("opens after you connect or import").isVisible(), "reload shows no data");

  check(foreign.length === 0, `no requests to third-party hosts${foreign.length ? ": " + foreign.slice(0, 3).join(", ") : ""}`);
  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  fails.push(String(e)); console.error(e);
} finally {
  await browser.close();
  server?.kill();
}
console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => " - " + f).join("\n")); process.exit(1); }
