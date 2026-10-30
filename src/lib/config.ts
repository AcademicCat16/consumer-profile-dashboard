/**
 * Chrome Web Store listing. Leave both values null until the listing has been APPROVED and is publicly visible.
 * Then copy the item ID and the exact listing URL from the Chrome Web Store Developer Dashboard (never guess them),
 * set them here, and redeploy. See docs/CHROME_WEB_STORE.md.
 */
export const CHROME_WEB_STORE: { extensionId: string | null; url: string | null } = {
  extensionId: null,
  url: null,
};

/** ID of the unpacked development build (derived from the public "key" in extension/manifest.json). */
export const DEV_EXTENSION_ID = "nofeapdkbkkkmfhjmomblmaihnbgcelm";

/** Oldest extension version that supports the one-step connect flow. */
export const MIN_EXTENSION_VERSION = "1.1.0";

/** Temporary install path for testing while the store listing is pending. */
export const REPO_ZIP = "https://github.com/AcademicCat16/consumer-profile-dashboard/archive/refs/heads/main.zip";
