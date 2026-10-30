# Publishing the Consumer Lab Connector on the Chrome Web Store

Status: **not submitted or published yet.** Until Google approves and lists the extension, the dashboard shows a "listing not published yet" notice and a clearly labelled temporary test installation. Do not add a store URL anywhere until the listing is live.

## 1. Build the upload package
```bash
node scripts/package-extension.mjs
# → extension-dist/consumer-lab-connector-1.1.0.zip (git-ignored)
```
The script removes the development `key` field (the store assigns its own extension ID and rejects packages that include `key`), limits `externally_connectable` to `https://academiccat16.github.io/*`, and checks that every referenced file exists. Bump `version` in `extension/manifest.json` before every new upload.

## 2. Register and upload (account owner)
1. Sign in at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that will own the listing. A first-time registration requires a one-time fee and identity/contact verification. Check the dashboard for the current amount.
2. Click **New item** and upload the ZIP.
3. Complete the **Store listing**, **Privacy** and **Distribution** tabs using the text below, then click **Submit for review**.
4. Keep "Publish automatically after review" **off** if you want to check the listing before it goes live.

## 3. Store listing text
- **Name:** Consumer Lab Connector
- **Summary (≤132 chars):** Connects your own Chrome history, with your approval, to the Consumer Lab dashboard for private, on-device analysis.
- **Category:** Education (alternative: Productivity)
- **Language:** English
- **Description:**
  > Consumer Lab Connector links your own Chrome history to the Consumer Lab dashboard, a teaching tool that turns your browsing into an explainable consumer profile (interests, shopping style and segments), entirely on your own computer.
  >
  > How it works
  > 1. Open the Consumer Lab dashboard and click Connect Chrome.
  > 2. Approve the request in the extension's window, then confirm Chrome's "Read your browsing history" prompt (first time only).
  > 3. Explore your profile. The analysis runs in the dashboard tab.
  >
  > Privacy
  > • History is read only after you approve, only for the period you choose (30–365 days), and only by the approved dashboard page.
  > • Nothing is uploaded: there is no server, no analytics and no AI service.
  > • It never reads cookies, passwords, form data or sign-in information.
  > • Disconnect at any time from the dashboard or the extension menu.
  >
  > Optional: capture product details (name, price, image) that a shopping page publishes, by clicking Capture on that page, so the dashboard can rank real products against your profile.
- **Homepage URL:** https://academiccat16.github.io/consumer-profile-dashboard/
- **Support URL:** https://github.com/AcademicCat16/consumer-profile-dashboard/issues
- **Icon:** `extension/icons/icon128.png`
- **Small promo tile (440×280):** `store-assets/promo-small-440x280.png`
- **Screenshots (1280×800):** `store-assets/screenshot-*.png`. They show the onboarding screen, consent window and extension menu, with no personal data.

## 4. Privacy tab
**Single purpose:**
> Let the user connect their own Chrome browsing history, and product details from pages they choose, to the Consumer Lab dashboard so they can view an on-device analysis of their own consumer behaviour.

**Permission justifications:**
| Permission | Justification |
|---|---|
| `history` (optional, requested at runtime) | Core feature. It is requested only when the user clicks "Allow and continue" in the extension's consent window. It reads URLs, titles and visit times for the period the user approved, and passes them only to the approved dashboard tab for local analysis. The user can remove it at any time (Disconnect). |
| `storage` | Stores the user's approval (dashboard origin, date, period) and the product details they captured, locally. |
| `activeTab` | When the user clicks "Capture products", grants temporary access to that one tab so the extension can read its published product data. There is no background access to pages. |
| `scripting` | Runs the product-capture function in the active tab after the user clicks "Capture products". It reads schema.org JSON-LD / OpenGraph product data only, and does not modify the page. |
| `externally_connectable` (manifest key, not a permission) | Lets only the dashboard origin `https://academiccat16.github.io` message the extension. |

**Host permissions:** none. **Remote code:** No. All code ships in the package, with no eval or remote scripts.

**Data usage disclosures:** tick **Web history** and **Website content** (the product details from pages the user captures). Do not tick personally identifiable information, health, financial/payment, authentication, personal communications, location or user activity (clicks, keystrokes). Then certify:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://academiccat16.github.io/consumer-profile-dashboard/privacy.html

**Notes for the reviewer (test instructions field):**
> 1. Install the extension. A tab opens at the dashboard's Connect screen.
> 2. Click "Connect Chrome". The extension opens consent.html; click "Allow and continue" and approve Chrome's history prompt.
> 3. The dashboard reads history through chrome.runtime.sendMessage (externally_connectable) and analyses it in the page. Nothing is sent to any server; the site is a static GitHub Pages app.
> 4. Disconnect: Data & Privacy → Disconnect Chrome. This removes the optional history permission and the stored approval.

## 5. Distribution
For a class you can choose **Unlisted** (only people with the link can install it) or **Public**. Either way the dashboard links to the listing URL once you add it.

## 6. After approval (required to switch the dashboard over)
1. In the Developer Dashboard, copy the **item ID** (32 letters a–p) and the listing URL it shows. Do not construct the URL by hand.
2. Edit `src/lib/config.ts`:
   ```ts
   export const CHROME_WEB_STORE = { extensionId: "<item id>", url: "<listing URL from the dashboard>" };
   ```
3. Run the checks and deploy: `npm run test:unit && npm run test:ext && npm run build && npm run test:e2e && npm run deploy`.
4. Open the live dashboard in a Chrome profile without the test build. Confirm that **Add to Chrome** appears, that installing opens the dashboard, and that Connect → Allow → profile works.

The dashboard looks for the store build first and the development build second, so testers who still have the unpacked build keep working.

## What only a real installation or store review can confirm
- Chrome's native permission prompt (automated tests can't click it; the test build pre-grants the permission instead).
- Installation from the store page and the welcome tab that opens after installing.
- Google's policy review outcome and timing.
