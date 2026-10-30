import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Download, ExternalLink, FileUp, Loader2, Lock, PlugZap, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { hasData } from "../lib/analysis.ts";
import { parseFile, fromExtension } from "../lib/parsers.ts";
import { detectExtension, explainError, fetchHistory, isChromium, requestConnection } from "../lib/extension.ts";
import type { ExtStatus } from "../lib/extension.ts";
import { CHROME_WEB_STORE, MIN_EXTENSION_VERSION, REPO_ZIP } from "../lib/config.ts";
import { Card, fmtNum } from "../components/ui.tsx";

type Busy = null | "waiting" | "importing";
const WAIT_LIMIT_MS = 10 * 60 * 1000;

/** The three-step header: Connect Chrome → Approve Permission → Explore My Profile. */
const Steps = ({ current, done }: { current: number; done: boolean[] }) => {
  const names = ["Connect Chrome", "Approve permission", "Explore my profile"];
  return (
    <ol className="stepper" aria-label="Setup progress">
      {names.map((n, i) => (
        <li key={n} className={done[i] ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="dot">{done[i] ? <Check size={14} /> : i + 1}</span><span className="lbl">{n}</span>
          {i < 2 && <span className="bar" />}
        </li>
      ))}
    </ol>
  );
};

function ChromeOnboarding() {
  const { addSource, removeSource, sources, analysis } = useLab();
  const [status, setStatus] = useState<ExtStatus | null>(null);
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState<Busy>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const waitStart = useRef(0);
  const justInstalled = /installed=1/.test(window.location.hash);
  const chromeSource = sources.find((s) => s.kind === "chrome-extension");

  const refresh = useCallback(async () => { const s = await detectExtension(); setStatus(s); return s; }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const importNow = useCallback(async (d: number) => {
    setBusy("importing"); setErr(null);
    try {
      const r = await fetchHistory(d);
      const visits = fromExtension((r.items ?? []) as Parameters<typeof fromExtension>[0], "x");
      if (!visits.length) throw new Error(`Chrome returned no history for the last ${r.days ?? d} days.`);
      sources.filter((s) => s.kind === "chrome-extension").forEach((s) => removeSource(s.id));
      addSource("chrome-extension", `Chrome history · last ${r.days ?? d} days`, { visits });
      setResult(`Analysed ${fmtNum(visits.length)} visits on this device.`);
      setBusy(null);
      setTimeout(() => { window.location.hash = "/overview"; }, 900);
    } catch (e) { setErr(explainError(e)); setBusy(null); refresh(); }
  }, [addSource, removeSource, sources, refresh]);

  // While installing: re-check periodically (works when the extension was already present at page load).
  useEffect(() => {
    if (!status?.runtime || status.installed || busy) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [status, busy, refresh]);

  // While waiting for approval in the extension's window: poll, then start analysis automatically.
  useEffect(() => {
    if (busy !== "waiting") return;
    const t = setInterval(async () => {
      const s = await refresh();
      if (s.authorized) { clearInterval(t); importNow(days); }
      else if (Date.now() - waitStart.current > WAIT_LIMIT_MS) { clearInterval(t); setBusy(null); setErr("No approval was received. Click Connect Chrome to try again."); }
    }, 1000);
    return () => clearInterval(t);
  }, [busy, days, refresh, importNow]);

  const connect = async () => {
    setErr(null);
    try {
      const st = await requestConnection(days);
      if (st === "already_authorized") return importNow(days);
      waitStart.current = Date.now();
      setBusy("waiting");
    } catch (e) { setErr(explainError(e)); }
  };

  const installed = !!status?.installed && !status.outdated;
  const authorized = installed && !!status?.authorized;
  const loaded = !!chromeSource;
  const current = !installed ? 0 : !authorized || busy === "waiting" ? 1 : 2;
  const period = (
    <select className="input" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="History period" disabled={!!busy}>
      {[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
    </select>
  );

  let body;
  if (!status) body = <p className="muted row"><Loader2 size={15} className="animate-spin" /> Checking this browser…</p>;
  else if (!status.runtime && !isChromium()) body = (
    <div className="notice warn"><XCircle size={16} /><span>Connecting needs desktop <b>Google Chrome</b>. In this browser you can still import exported files below.</span></div>
  );
  else if (!installed) body = (
    <div className="onb-body">
      <div>
        <h3 className="onb-title">{status.outdated ? "Update the Consumer Lab extension" : "Add the free Consumer Lab extension to Chrome"}</h3>
        <p className="muted">{status.outdated ? `You have version ${status.version}; version ${MIN_EXTENSION_VERSION} or later is needed for one-step connect.` : "It lets this page read your history only after you approve, and lets you disconnect at any time. It never reads cookies, passwords or sign-in data."}</p>
        {CHROME_WEB_STORE.url ? (
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn primary lg" href={CHROME_WEB_STORE.url} target="_blank" rel="noopener noreferrer" data-testid="store-link"><PlugZap size={17} />Add to Chrome, it's free</a>
            <span className="small muted">Chrome opens this dashboard again when installation finishes.</span>
          </div>
        ) : (
          <>
            <div className="notice warn small" style={{ marginTop: 12 }} data-testid="store-pending"><Lock size={15} style={{ flex: "none" }} /><span><b>Chrome Web Store listing: not published yet.</b> A one-click “Add to Chrome” button will appear here once Google has reviewed and listed the extension. Until then, use the temporary test installation.</span></div>
            <details className="temp-install" open={justInstalled || undefined}>
              <summary>Temporary test installation (testing only, about 2 minutes)</summary>
              <ol className="steps small">
                <li><a href={REPO_ZIP}><Download size={12} /> Download the project ZIP</a> and unzip it.</li>
                <li>Open <span className="kbd">chrome://extensions</span> and switch on <b>Developer mode</b> (top right).</li>
                <li>Click <b>Load unpacked</b> and choose the <span className="kbd">extension</span> folder.</li>
                <li>Chrome opens this dashboard in a new tab. Continue there.</li>
              </ol>
            </details>
          </>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" onClick={() => window.location.reload()}><RefreshCw size={13} />I've installed it, check again</button>
          {status.runtime && <span className="small faint">Checking automatically…</span>}
        </div>
      </div>
    </div>
  );
  else if (busy === "waiting") body = (
    <div className="onb-body" data-testid="waiting">
      <div className="pulse"><ShieldCheck size={26} /></div>
      <div>
        <h3 className="onb-title">Approve in the Chrome window</h3>
        <p className="muted">A small <b>Consumer Lab</b> window has opened. Click <b>Allow and continue</b>. The first time, Chrome then asks you to confirm <b>“Read your browsing history”</b>. This page continues on its own.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={connect}><ExternalLink size={13} />Open the window again</button>
          <button className="btn sm ghost" onClick={() => setBusy(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
  else if (busy === "importing" || result) body = (
    <div className="onb-body" data-testid="importing">
      <div className="pulse">{result ? <CheckCircle2 size={26} color="var(--good)" /> : <Sparkles size={26} />}</div>
      <div>
        <h3 className="onb-title">{result ? "Your profile is ready" : "Analysing your history on this device…"}</h3>
        <p className="muted">{result ?? "Reading your Chrome history and building your profile in this tab. Nothing is uploaded."}</p>
      </div>
    </div>
  );
  else if (authorized && loaded) body = (
    <div className="onb-body">
      <div>
        <h3 className="onb-title">Chrome is connected</h3>
        <p className="muted">{fmtNum(analysis.counts.analyzedVisits)} visits analysed. Load your history again to include recent browsing.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn primary" href="#/overview"><ArrowRight size={15} />Explore my profile</a>
          <button className="btn" onClick={() => importNow(days)}><RefreshCw size={14} />Refresh from Chrome</button>{period}
        </div>
      </div>
    </div>
  );
  else if (authorized) body = (
    <div className="onb-body">
      <div>
        <h3 className="onb-title">Welcome back. Chrome is connected.</h3>
        <p className="muted">You approved this dashboard{status.authorizedAt ? ` on ${new Date(status.authorizedAt).toLocaleDateString()}` : ""}{status.authorizedDays ? ` for up to ${status.authorizedDays} days of history` : ""}. Your data is not stored between visits, so load it again to see your profile.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary lg" onClick={() => (status.authorizedDays && days > status.authorizedDays ? connect() : importNow(days))} data-testid="load-profile"><Sparkles size={16} />Explore my profile</button>{period}
        </div>
        {status.authorizedDays && days > status.authorizedDays && <p className="small muted" style={{ marginTop: 8 }}>A longer period than you approved needs a new approval.</p>}
      </div>
    </div>
  );
  else body = (
    <div className="onb-body">
      <div>
        <h3 className="onb-title">{justInstalled ? "Extension installed. One more step." : "Connect your Chrome history"}</h3>
        <p className="muted">Chrome will open a small Consumer Lab window to ask for your approval. The lab reads page addresses, titles and visit times, then analyses them here in this tab. Nothing is uploaded.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary lg" onClick={connect} data-testid="connect-chrome"><PlugZap size={17} />Connect Chrome</button>{period}
        </div>
      </div>
    </div>
  );

  return (
    <section className="card onboarding" aria-labelledby="onb-h">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h2 id="onb-h" className="display" style={{ margin: 0, fontSize: 18 }}>Set up in three steps</h2>
        {status?.installed && <span className="chip"><span className="legend-dot" style={{ background: "var(--good)" }} />Extension {status.version}{status.build === "development" ? " (test build)" : ""}</span>}
      </div>
      <Steps current={current} done={[installed, authorized, loaded || !!result]} />
      <div style={{ marginTop: 18 }}>{body}</div>
      {err && <div className="notice small bad" style={{ marginTop: 14 }}><XCircle size={15} color="var(--bad)" />{err}</div>}
    </section>
  );
}

export default function Connect() {
  const { addSource, analysis, sources } = useLab();
  const data = hasData(analysis);
  const [fileLog, setFileLog] = useState<{ name: string; ok: boolean; text: string }[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        const r = parseFile(f.name, await f.text(), "x");
        const n = Object.values(r.data).reduce((s, xs) => s + (xs?.length ?? 0), 0);
        if (!n) throw new Error("No usable records found in this file.");
        addSource(r.kind, f.name, r.data);
        const parts = Object.entries(r.data).filter(([, xs]) => xs?.length).map(([k, xs]) => `${fmtNum(xs!.length)} ${k}`);
        setFileLog((l) => [{ name: f.name, ok: true, text: `Imported ${parts.join(", ")}.${r.notes.length ? " " + r.notes.join(" ") : ""}` }, ...l]);
      } catch (e) { setFileLog((l) => [{ name: f.name, ok: false, text: (e as Error).message }, ...l]); }
    }
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="hero">
        <div className="row" style={{ marginBottom: 12 }}><span className="chip on"><ShieldCheck size={12} /> Local-only analysis</span><span className="chip">No account · no upload · no tracking</span></div>
        <h1>A consumer profile built only from <span style={{ color: "var(--accent)" }}>your own data</span>.</h1>
        <p>Connect Chrome, approve once, and explore your profile. Everything is analysed in this browser tab. This page has no server and shows no insights until you provide real data.</p>
      </div>

      {data && (
        <div className="notice" style={{ alignItems: "center" }}>
          <CheckCircle2 size={18} color="var(--good)" />
          <span style={{ flex: 1 }}>{sources.length} source{sources.length === 1 ? "" : "s"} loaded: {fmtNum(analysis.counts.analyzedVisits)} analysed visits, {fmtNum(analysis.counts.searches)} searches, {fmtNum(analysis.counts.conversations)} conversations, {fmtNum(analysis.counts.purchases)} purchases.</span>
          <a className="btn primary sm" href="#/overview">Open your overview</a>
        </div>
      )}

      <ChromeOnboarding />

      <div className="grid g2">
        <Card title={<span className="row"><FileUp size={17} /> Other ways to add data</span>} sub="Import exported files instead of, or as well as, connecting Chrome. Files are read locally and never uploaded.">
          <div className={`drop ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); importFiles(e.dataTransfer.files); }}>
            <FileUp size={24} style={{ margin: "0 auto 8px", display: "block" }} />
            <div>Drag files here, or</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => inputRef.current?.click()}>Choose files</button>
            <input ref={inputRef} type="file" multiple accept=".json,.csv,.txt" hidden data-testid="file-input" onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {fileLog.length > 0 && <div className="ev" style={{ marginTop: 12 }}>{fileLog.map((l, i) => <div key={i} className="ev-item" style={{ gridTemplateColumns: "18px minmax(0,1fr)" }}>{l.ok ? <CheckCircle2 size={14} color="var(--good)" /> : <XCircle size={14} color="var(--bad)" />}<span><b>{l.name}</b>: {l.text}</span></div>)}</div>}
          <details style={{ marginTop: 12 }}>
            <summary>Supported files and how to get them</summary>
            <table className="table small" style={{ marginTop: 6 }}>
              <tbody>
                <tr><td>Chrome history</td><td><a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a> → Chrome → <span className="kbd">BrowserHistory.json</span>, or the extension menu → Export history</td></tr>
                <tr><td>Google searches &amp; YouTube</td><td>Takeout → My Activity → <b>JSON</b> format → <span className="kbd">MyActivity.json</span></td></tr>
                <tr><td>ChatGPT</td><td>Settings → Data controls → Export → <span className="kbd">conversations.json</span> (only your own messages are analysed)</td></tr>
                <tr><td>Amazon orders</td><td>“Request your data” → Your Orders → <span className="kbd">Retail.OrderHistory.1.csv</span></td></tr>
                <tr><td>Other</td><td>Any CSV with <span className="kbd">url</span>, <span className="kbd">title</span> and a time column; order CSVs with date, product and price</td></tr>
              </tbody>
            </table>
          </details>
        </Card>
        <Card title="What this lab will and will not do">
          <ul className="steps small" style={{ margin: 0 }}>
            <li>Analyses only the records you provide, in this tab. Nothing is sent to any server or AI service.</li>
            <li>Records are kept in memory and disappear when you close the tab, unless you opt in under Data &amp; Privacy.</li>
            <li>You approve Chrome access once, and can disconnect at any time from Data &amp; Privacy or the extension menu.</li>
            <li>Health, politics, religion, sexuality and dating records are excluded before analysis. No sensitive traits are inferred.</li>
            <li>Traits are descriptive patterns, not clinical or validated measures, and no probabilities are invented.</li>
            <li>Recommendations come only from real products you capture or import.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
