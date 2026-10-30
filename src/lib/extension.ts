/**
 * Client for the "Consumer Lab Connector" extension (see /extension).
 * Chrome exposes chrome.runtime.sendMessage to this page only if an installed extension lists this site in
 * externally_connectable, and only for extensions installed before the page loaded.
 * Access to history needs the user's approval in the extension's own consent window (plus Chrome's prompt once).
 */
import { CHROME_WEB_STORE, DEV_EXTENSION_ID, MIN_EXTENSION_VERSION } from "./config.ts";

export interface ExtStatus {
  runtime: boolean; // chrome.runtime messaging is available on this page
  installed: boolean;
  id?: string;
  build?: "store" | "development";
  version?: string;
  outdated?: boolean;
  historyGranted?: boolean;
  authorized?: boolean;
  authorizedAt?: string | null;
  authorizedDays?: number | null;
}

interface ChromeRuntime { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } }
const runtime = (): ChromeRuntime | null => (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime ?? null;
const candidates = () => [CHROME_WEB_STORE.extensionId, DEV_EXTENSION_ID].filter((x): x is string => !!x);
let activeId: string | null = null;

export const isChromium = () => typeof navigator !== "undefined" && /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent);

export const ERROR_TEXT: Record<string, string> = {
  not_detected: "The Consumer Lab Connector extension was not detected. Install it, then reload this page.",
  history_permission_not_granted: "Chrome's history permission is off. Click Connect Chrome to approve it again.",
  origin_not_authorized: "This dashboard is not connected yet. Click Connect Chrome and approve the request in the Chrome window.",
  timeout: "The extension did not respond in time. Try a shorter period, then try again.",
  unknown_request: "Your extension is out of date. Update it, then reload this page.",
};

const sendTo = <T,>(id: string, msg: unknown, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const rt = runtime();
    if (!rt?.sendMessage) return reject(new Error("not_detected"));
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      rt.sendMessage(id, msg, (r) => {
        clearTimeout(timer);
        const err = rt.lastError;
        if (err || r === undefined) reject(new Error("not_detected"));
        else resolve(r as T);
      });
    } catch (e) { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); }
  });

const send = <T,>(msg: unknown, timeoutMs: number) => (activeId ? sendTo<T>(activeId, msg, timeoutMs) : Promise.reject(new Error("not_detected")));

const older = (a: string, b: string) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); return false; };

/** Finds the installed connector (store build first, then the development build). */
export const detectExtension = async (): Promise<ExtStatus> => {
  if (!runtime()?.sendMessage) return { runtime: false, installed: false };
  for (const id of candidates()) {
    try {
      const r = await sendTo<{ ok: boolean; version: string; historyGranted: boolean; authorized?: boolean; authorizedAt?: string | null; authorizedDays?: number | null }>(id, { type: "ping" }, 2500);
      if (r?.ok) {
        activeId = id;
        return { runtime: true, installed: true, id, build: id === CHROME_WEB_STORE.extensionId ? "store" : "development", version: r.version, outdated: older(r.version, MIN_EXTENSION_VERSION), historyGranted: r.historyGranted, authorized: !!r.authorized, authorizedAt: r.authorizedAt ?? null, authorizedDays: r.authorizedDays ?? null };
      }
    } catch { /* try next */ }
  }
  activeId = null;
  return { runtime: true, installed: false };
};

/** Opens the extension's consent window. Resolves immediately; poll detectExtension() for the result. */
export const requestConnection = async (days: number) => {
  const r = await send<{ ok: boolean; status?: string; error?: string }>({ type: "connect", days }, 8000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
  return r.status as "consent_opened" | "already_authorized";
};

export const fetchHistory = async (days: number) => {
  const r = await send<{ ok: boolean; error?: string; items?: unknown[]; days?: number }>({ type: "getHistory", days, maxItems: 20000 }, 180000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
  return r;
};

export const fetchCapturedProducts = async () => {
  const r = await send<{ ok: boolean; error?: string; products?: unknown[] }>({ type: "getCapturedProducts" }, 10000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
  return r.products ?? [];
};

export const disconnectExtension = async () => {
  const r = await send<{ ok: boolean; error?: string }>({ type: "disconnect" }, 8000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
};

export const explainError = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return ERROR_TEXT[m] ?? m; };
