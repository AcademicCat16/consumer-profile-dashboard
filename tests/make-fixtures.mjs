/**
 * Writes SYNTHETIC development fixtures to tests/.tmp/ (gitignored) for automated UI testing only.
 * They are not anyone's real data, are never bundled into the site, and every file carries the
 * FIXTURE-DO-NOT-PUBLISH marker so the privacy guard fails if one is ever committed or published.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "FIXTURE-DO-NOT-PUBLISH";
export const OUT = join(dirname(fileURLToPath(import.meta.url)), ".tmp");

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

const SITES = [
  ["https://www.amazon.com/dp/B0", ["Sony WH-1000XM5 Wireless Headphones", "Anker USB-C Charger 65W", "Kindle Paperwhite", "Logitech MX Master 3S mouse"]],
  ["https://www.bestbuy.com/site/", ["Sony WH-1000XM5 - Best Buy", "Apple iPad Air - Best Buy"]],
  ["https://www.rtings.com/headphones/reviews/", ["Sony WH-1000XM5 review", "Best noise cancelling headphones"]],
  ["https://slickdeals.net/f/", ["Headphones deal", "Laptop deal under $800"]],
  ["https://github.com/fixture/", ["fixture/repo: pull requests", "fixture/repo issues"]],
  ["https://stackoverflow.com/questions/", ["How to type a React hook", "TypeScript generics question"]],
  ["https://chatgpt.com/c/", ["ChatGPT"]],
  ["https://www.youtube.com/watch?v=", ["Sony XM5 vs Bose QC Ultra review", "Lo-fi beats", "Cooking pasta at home"]],
  ["https://www.netflix.com/title/", ["Netflix"]],
  ["https://open.spotify.com/album/", ["Spotify – Album"]],
  ["https://www.theverge.com/", ["The Verge – new phone launch", "Apple announces new MacBook"]],
  ["https://www.ikea.com/us/en/p/", ["KALLAX shelf unit", "MALM desk"]],
  ["https://www.allrecipes.com/recipe/", ["Easy weeknight pasta", "Banana bread"]],
  ["https://www.booking.com/hotel/", ["Hotel in Lisbon"]],
  ["https://www.target.com/p/", ["Throw pillow", "Desk lamp"]],
  ["https://www.walmart.com/ip/", ["Desk lamp", "USB-C cable"]],
  ["https://docs.google.com/document/d/", ["Untitled document"]],
  ["https://mail.google.com/mail/u/0/#inbox", ["Inbox"]],
  ["https://www.webmd.com/", ["Symptoms checker"]], // sensitive — must be excluded
  ["https://accounts.google.com/signin", ["Sign in"]], // noise — must be excluded
];
const WEIGHTS = [10, 4, 3, 2, 9, 6, 8, 9, 4, 3, 3, 2, 2, 1, 2, 2, 6, 7, 1, 1];

export const writeFixtures = () => {
  mkdirSync(OUT, { recursive: true });
  const now = Date.parse("2026-10-20T12:00:00Z");
  const byUrl = new Map();
  for (let d = 120; d >= 0; d--) {
    const sessions = 1 + Math.floor(rnd() * 3);
    for (let s = 0; s < sessions; s++) {
      let t = now - d * 86400000 - Math.floor(rnd() * 14) * 3600000;
      const len = 3 + Math.floor(rnd() * 8);
      for (let k = 0; k < len; k++) {
        let r = rnd() * WEIGHTS.reduce((a, b) => a + b, 0), i = 0;
        while ((r -= WEIGHTS[i]) > 0) i++;
        const [base, titles] = SITES[i];
        const title = pick(titles);
        const url = base + (base.endsWith("/") || base.endsWith("B0") || base.endsWith("=") ? Math.floor(rnd() * 40) : "");
        const it = byUrl.get(url) ?? { url, title, visitCount: 0, typedCount: 0, lastVisitTime: 0, visits: [] };
        it.visits.push({ t, tr: "link" }); it.visitCount++; it.lastVisitTime = Math.max(it.lastVisitTime, t);
        byUrl.set(url, it);
        t += (1 + Math.floor(rnd() * 6)) * 60000;
      }
    }
  }
  const files = {};
  files["fixture-chrome-history.json"] = JSON.stringify({ format: "consumer-lab-extension/v1", _fixture: MARKER, exportedAt: new Date(now).toISOString(), days: 120, items: [...byUrl.values()] });
  const searches = ["best noise cancelling headphones", "sony wh-1000xm5 vs bose", "cheapest usb-c charger", "react typescript tutorial", "lisbon hotels", "kallax shelf review", "laptop deals", "best headphones 2026", "pasta recipe", "symptoms of flu"];
  files["fixture-MyActivity.json"] = JSON.stringify(searches.flatMap((q, i) => [0, 1, 2].map((k) => ({ header: "Search", title: `Searched for ${q}`, titleUrl: `https://www.google.com/search?q=${encodeURIComponent(q)}`, time: new Date(now - (i * 9 + k * 3) * 86400000).toISOString(), products: ["Search"], _fixture: MARKER }))));
  const conv = (title, text, days) => ({ title, create_time: (now - days * 86400000) / 1000, _fixture: MARKER, mapping: { a: { message: { author: { role: "user" }, content: { parts: [text] } } }, b: { message: { author: { role: "assistant" }, content: { parts: ["(assistant reply ignored)"] } } } } });
  files["fixture-conversations.json"] = JSON.stringify([conv("Headphone choice", "Which headphones should I buy, Sony or Bose? Compare price.", 5), conv("React bug", "Fix this TypeScript React code bug", 12), conv("Trip", "Plan a 3 day trip itinerary to Lisbon", 30)]);
  files["fixture-orders.csv"] = `Order Date,Product Name,Unit Price,ASIN,Note\n2026-09-02T10:00:00Z,"Anker USB-C Charger, 65W",29.99,B0FIX1,${MARKER}\n2026-08-14T10:00:00Z,Logitech MX Master 3S Mouse,99.99,B0FIX2,${MARKER}\n2026-07-01T10:00:00Z,Sony WH-1000XM5 Headphones,348.00,B0FIX3,${MARKER}\n`;
  files["fixture-catalog.csv"] = `name,url,price,currency,brand,rating,availability,note\nSony WH-1000XM5 Wireless Noise Cancelling Headphones,https://shop.example.test/sony-xm5,329.99,USD,Sony,4.6,InStock,${MARKER}\nBose QuietComfort Ultra Headphones,https://shop.example.test/bose-qc,379.00,USD,Bose,4.5,InStock,${MARKER}\nGeneric garden hose 50ft,https://shop.example.test/hose,24.99,USD,,4.1,InStock,${MARKER}\nApple iPad Air 11-inch tablet,https://shop.example.test/ipad,599.00,USD,Apple,,OutOfStock,${MARKER}\n`;
  for (const [n, c] of Object.entries(files)) writeFileSync(join(OUT, n), c);
  return Object.keys(files).map((n) => join(OUT, n));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(writeFixtures().join("\n"));
