/**
 * Privacy guard. Fails if anything that looks like personal data would be committed or published.
 *  1. Tracked/untracked-but-not-ignored files: only allow-listed JSON/CSV files may exist in the repo.
 *  2. The built site (dist/) and tracked files must not contain the marker every development fixture carries.
 *  3. Known personal-export signatures (Google Takeout, ChatGPT export, Amazon orders) must not appear in data files.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "FIXTURE-DO-NOT-PUBLISH";
const ALLOWED_DATA = new Set(["package.json", "package-lock.json", "tsconfig.json", "extension/manifest.json"]);
const SIGNATURES = [/"Browser History"\s*:\s*\[\s*\{/, /"time_usec"\s*:\s*\d/, /"mapping"\s*:\s*\{\s*"[0-9a-f-]{8,}/, /Order Date.*ASIN/, /"titleUrl"\s*:\s*"https:\/\/www\.google\.com\/search/];
const problems = [];

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean);
for (const f of files) {
  if (/\.(json|csv|tsv|sqlite|db|html?)$/i.test(f) && !ALLOWED_DATA.has(f) && !/^(index\.html|extension\/popup\.html)$/.test(f)) problems.push(`data file would be committed: ${f}`);
  if (!existsSync(f) || statSync(f).size > 5_000_000) continue;
  const text = readFileSync(f, "utf8");
  if (text.includes(MARKER) && !/scripts\/check-no-private-data\.mjs|tests\//.test(f)) problems.push(`fixture marker found in ${f}`);
  if (/\.(json|csv)$/i.test(f) && SIGNATURES.some((r) => r.test(text))) problems.push(`personal-export signature in ${f}`);
}

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
if (existsSync("dist")) {
  for (const f of walk("dist")) {
    if (/\.(json|csv)$/i.test(f)) problems.push(`data file in build output: ${f}`);
    if (/\.(js|html|css)$/.test(f) && readFileSync(f, "utf8").includes(MARKER)) problems.push(`fixture marker in build output: ${f}`);
  }
}

if (problems.length) { console.error("PRIVACY CHECK FAILED:\n - " + problems.join("\n - ")); process.exit(1); }
console.log(`Privacy check passed (${files.length} files scanned${existsSync("dist") ? " + dist/" : ""}).`);
