/**
 * Client for the optional "Consumer Lab Connector" extension (see /extension).
 * Chrome exposes chrome.runtime to this page only when an installed extension lists this site in
 * externally_connectable, so "not detected" means the extension is not installed or this is not Chrome.
 * The extension answers only after YOU grant its history permission and switch on "Allow dashboard connection".
 */
export const EXTENSION_ID = "nofeapdkbkkkmfhjmomblmaihnbgcelm";

export interface PingResult { ok: boolean; version?: string; historyGranted?: boolean; dashboardAllowed?: boolean; days?: number; error?: string }

interface ChromeRuntime { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } }
const runtime = (): ChromeRuntime | null => (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime ?? null;

export const ERROR_TEXT: Record<string, string> = {
  not_detected: "The Consumer Lab Connector extension was not detected in this browser. Install it (steps below) and reload this page.",
  history_permission_not_granted: "History permission has not been granted. Open the extension popup and click “Grant history access”.",
  dashboard_connection_not_allowed: "The dashboard connection is switched off. Open the extension popup and tick “Allow my dashboard page to request history and captured products”.",
  timeout: "The extension did not respond in time. Try a shorter period, then try again.",
};

const send = <T,>(msg: unknown, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const rt = runtime();
    if (!rt?.sendMessage) return reject(new Error("not_detected"));
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, msg, (r) => {
        clearTimeout(timer);
        const err = rt.lastError;
        if (err) reject(new Error(/Could not establish|Receiving end/i.test(err.message ?? "") ? "not_detected" : err.message ?? "extension_error"));
        else resolve(r as T);
      });
    } catch (e) { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); }
  });

export const pingExtension = async (): Promise<PingResult> => {
  try { return await send<PingResult>({ type: "ping" }, 4000); }
  catch (e) { return { ok: false, error: (e as Error).message }; }
};

export const fetchHistory = async (days: number) => {
  const r = await send<{ ok: boolean; error?: string; items?: unknown[]; format?: string }>({ type: "getHistory", days, maxItems: 20000 }, 180000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
  return r;
};

export const fetchCapturedProducts = async () => {
  const r = await send<{ ok: boolean; error?: string; products?: unknown[] }>({ type: "getCapturedProducts" }, 10000);
  if (!r?.ok) throw new Error(r?.error ?? "extension_error");
  return r.products ?? [];
};

export const explainError = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return ERROR_TEXT[m] ?? m; };
