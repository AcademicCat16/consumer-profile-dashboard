# Personal AI Consumer Intelligence Laboratory

A private, local-only dashboard that builds an explainable consumer profile from **your own** browsing, search, conversation and shopping data.

**Live site:** https://academiccat16.github.io/consumer-profile-dashboard/

The site is static and has no server, analytics, cookies or AI API calls. Your files and history are parsed and analysed **inside your browser tab**. The public site opens on a connection/import screen and shows no insights until you provide real data. This repository contains code only: no personal data, profiles or exports.

## Connect your data

### Option A: Chrome extension (live connection)
1. Download this repository ([ZIP](https://github.com/AcademicCat16/consumer-profile-dashboard/archive/refs/heads/main.zip)) and unzip it.
2. Open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked** and select the `extension` folder.
3. Click the **Consumer Lab Connector** icon, then **Grant history access**. Chrome shows its own prompt ("Read your browsing history"), which you approve or decline.
4. In the popup, tick **Allow my dashboard page to request history and captured products**.
5. On the dashboard's *Connect* screen, click **Re-check**, choose a period, tick the consent box and click **Import Chrome history**.

The extension's ID is fixed (`nofeapdkbkkkmfhjmomblmaihnbgcelm`) so the dashboard can find it. It answers only the dashboard's own origins, and only when **both** the Chrome permission and the dashboard toggle are on. It never requests cookies, passwords, sign-in data or network access. To revoke access, use **Revoke** in the popup, or remove the extension.

Without connecting, you can click **Export history as JSON** in the popup and import that file instead.

### Option B: import exports (drag and drop on the Connect screen)
| Source | How to get it |
|---|---|
| Chrome history | [Google Takeout](https://takeout.google.com/) → Chrome → `BrowserHistory.json` |
| Google searches / YouTube | Takeout → My Activity → choose **JSON** format → `MyActivity.json` |
| ChatGPT | Settings → Data controls → Export → `conversations.json` (only *your* messages are analysed) |
| Amazon orders | "Request your data" → Your Orders → `Retail.OrderHistory.1.csv` |
| Other | Any CSV with `url`, `title` and a time column; order CSVs with date, product and price |

Keep personal exports in `private-data/`. It is git-ignored, and so are the common export filenames.

## What you get
- **Consumer Overview**: observed counts (visits, sessions, sites, categories, brands, searches, purchases) kept separate from inferences.
- **Interest Universe**: a WebGL force-directed network (Sigma.js + Graphology, ForceAtlas2 layout) of sites, categories, brands, product interests, search terms and inferred segments. Communities come from Louvain clustering. It has search, type/community/weight filters, draggable nodes, and an evidence panel listing the records behind each node and link.
- **Digital Footprint** (D3): a weekly category streamgraph, a radial 7×24 activity clock, a 365-day calendar heatmap, weekday and session-length distributions, and a Sankey of category-to-category moves within sessions.
- **Personality & Shopping Style**: brand loyalty vs. variety, price sensitivity, convenience, research intensity, novelty, premium vs. value, technology interest, exploration and decision style.
  - Each trait is a **transparent ratio** with its method, sample size, minimum sample, evidence-strength label (based on sample size only), example records, alternative explanations, and confirm/reject controls.
  - Below the minimum sample, a trait shows **INSUFFICIENT DATA**.
- **Consumer Segments**: 15 rule-based, overlapping segments with stated rules and reasons, plus an overlap map.
- **Product Discovery**: open a retailer page, then use the extension's **Capture products on this page**, which reads the page's published schema.org JSON-LD or OpenGraph data, only on that tab, only when you click. Then sync. You can also import a catalog CSV/JSON. The dashboard never fetches or scrapes retailer sites itself.
- **Personalized Recommendations**: only real captured or imported products, ranked by a 0–100 **match index**. The index is a weighted sum of factors shown on each card; it is not a probability. Prices, ratings and availability appear exactly as published, with the capture time.
- **AI vs. Reality**: mark each trait, segment, brand or product interest as accurate, inaccurate or uncertain. Rejected traits suppress dependent segments and zero their recommendation weight. Rejected interests leave the profile, network and recommendations, and can be restored.
- **Data & Privacy**: extension permission status, connected sources with counts, a per-record browser with delete, delete-a-source, delete-everything, and an opt-in "keep on this device" switch (IndexedDB, off by default).

## Limits and safeguards
- Health, medical, political, religious, sexual/adult and dating records are removed **before** analysis, and no sensitive or protected characteristics are inferred.
- Traits are descriptive behavioural patterns. They are **not** clinical or scientifically validated personality measures, and no probabilities are invented.
- Categories, brands and products are matched with a public keyword/domain taxonomy, which can misclassify. Browsing for work or for other people also skews results; the alternatives listed on each trait explain this.
- Recommendations can only be as broad as the products you capture or import.

## Development
```bash
npm install
npm run dev          # local dev server
npm run test:unit    # analysis engine checks (hand-computed expected values)
npm run test:ext     # extension consent gating + product capture
npm run build && npm run test:e2e   # end-to-end UI test in system Chrome
npm run check:privacy               # fails if personal-data files or fixtures would be committed/published
npm run deploy       # privacy check, build, publish dist/ to gh-pages
```
The tests use **synthetic fixtures** generated into the git-ignored `tests/.tmp/`. Every fixture file carries a do-not-publish marker string (defined in `scripts/check-no-private-data.mjs`), and the privacy check fails if the marker appears in tracked files or in the built site. No fixture data is ever bundled into the site.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Sigma.js 3, Graphology, D3 7, lucide-react.
