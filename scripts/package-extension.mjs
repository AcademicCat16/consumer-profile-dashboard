/**
 * Builds the Chrome Web Store upload package: extension-dist/consumer-lab-connector-<version>.zip
 *  - removes the development "key" (the Web Store assigns the listed extension its own ID and rejects a key field)
 *  - limits externally_connectable to the public dashboard (drops localhost / 127.0.0.1 used for development)
 *  - checks that every file the manifest and pages reference exists
 * Run: node scripts/package-extension.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const SRC = "extension", OUT = "extension-dist";
const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
delete manifest.key;
manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter((m) => m.startsWith("https://"));

const files = readdirSync(SRC, { recursive: true }).map(String).map((f) => f.replace(/\\/g, "/")).filter((f) => /\.(js|html|css|png)$/.test(f)).sort();
const referenced = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const f of files.filter((x) => x.endsWith(".html"))) for (const m of readFileSync(join(SRC, f), "utf8").matchAll(/(?:src|href)="([^":]+)"/g)) referenced.push(m[1]);
const missing = referenced.filter((f) => !existsSync(join(SRC, f)));
if (missing.length) { console.error("Missing files:", missing); process.exit(1); }

// ---- minimal ZIP writer (deflate) ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const entries = [["manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")], ...files.map((f) => [f, readFileSync(join(SRC, f))])];
const locals = [], centrals = [];
let offset = 0;
for (const [name, data] of entries) {
  const nameBuf = Buffer.from(name), comp = deflateRawSync(data), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
  locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync(OUT, { recursive: true });
const zipPath = join(OUT, `consumer-lab-connector-${manifest.version}.zip`);
writeFileSync(zipPath, Buffer.concat([...locals, cd, end]));
console.log(`Wrote ${zipPath} (${entries.length} files): ${entries.map((e) => e[0]).join(", ")}`);
