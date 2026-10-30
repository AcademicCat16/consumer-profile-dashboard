import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Globe, FileUp, Info, Loader2, PlugZap, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { hasData } from "../lib/analysis.ts";
import { parseFile, fromExtension } from "../lib/parsers.ts";
import { explainError, fetchHistory, pingExtension } from "../lib/extension.ts";
import type { PingResult } from "../lib/extension.ts";
import { Card, fmtNum } from "../components/ui.tsx";

const REPO_ZIP = "https://github.com/AcademicCat16/consumer-profile-dashboard/archive/refs/heads/main.zip";

export default function Connect() {
  const { addSource, analysis, sources } = useLab();
  const data = hasData(analysis);
  const [ping, setPing] = useState<PingResult | null>(null);
  const [days, setDays] = useState(90);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fileLog, setFileLog] = useState<{ name: string; ok: boolean; text: string }[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const recheck = useCallback(async () => { setPing(null); setPing(await pingExtension()); }, []);
  useEffect(() => { recheck(); }, [recheck]);

  const importChrome = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetchHistory(days);
      const visits = fromExtension((r.items ?? []) as Parameters<typeof fromExtension>[0], "x");
      if (!visits.length) throw new Error(`Chrome returned no history for the last ${days} days.`);
      addSource("chrome-extension", `Chrome history · last ${days} days (extension)`, { visits });
      setMsg({ ok: true, text: `Imported ${fmtNum(visits.length)} visits from ${fmtNum(r.items?.length ?? 0)} pages. They are held in this tab's memory only.` });
      setConsent(false);
    } catch (e) { setMsg({ ok: false, text: explainError(e) }); recheck(); }
    finally { setBusy(false); }
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const r = parseFile(f.name, text, "x");
        const n = Object.values(r.data).reduce((s, xs) => s + (xs?.length ?? 0), 0);
        if (!n) throw new Error("No usable records found in this file.");
        addSource(r.kind, f.name, r.data);
        const parts = Object.entries(r.data).filter(([, xs]) => xs?.length).map(([k, xs]) => `${fmtNum(xs!.length)} ${k}`);
        setFileLog((l) => [{ name: f.name, ok: true, text: `Imported ${parts.join(", ")}.${r.notes.length ? " " + r.notes.join(" ") : ""}` }, ...l]);
      } catch (e) { setFileLog((l) => [{ name: f.name, ok: false, text: (e as Error).message }, ...l]); }
    }
  };

  const status = !ping ? { icon: <Loader2 size={15} className="animate-spin" />, text: "Checking for the extension…" }
    : !ping.ok ? { icon: <XCircle size={15} color="var(--faint)" />, text: "Extension not detected in this browser." }
    : ping.historyGranted && ping.dashboardAllowed ? { icon: <CheckCircle2 size={15} color="var(--good)" />, text: `Extension v${ping.version} ready: history permission granted and dashboard connection allowed.` }
    : { icon: <Info size={15} color="var(--warn)" />, text: `Extension v${ping.version} detected. ${!ping.historyGranted ? "History permission not granted yet. " : ""}${!ping.dashboardAllowed ? "Dashboard connection switched off." : ""}` };
  const ready = !!ping?.ok && !!ping.historyGranted && !!ping.dashboardAllowed;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="hero">
        <div className="row" style={{ marginBottom: 12 }}><span className="chip on"><ShieldCheck size={12} /> Local-only analysis</span><span className="chip">No account · no upload · no tracking</span></div>
        <h1>A consumer profile built only from <span style={{ color: "var(--accent)" }}>your own data</span>.</h1>
        <p>Connect your Chrome history or import your own exports. Everything is parsed and analysed in this browser tab. This page has no server and shows no insights until you provide real data.</p>
      </div>

      {data && (
        <div className="notice" style={{ alignItems: "center" }}>
          <CheckCircle2 size={18} color="var(--good)" />
          <span style={{ flex: 1 }}>{sources.length} source{sources.length === 1 ? "" : "s"} loaded: {fmtNum(analysis.counts.analyzedVisits)} analysed visits, {fmtNum(analysis.counts.searches)} searches, {fmtNum(analysis.counts.conversations)} conversations, {fmtNum(analysis.counts.purchases)} purchases.</span>
          <a className="btn primary sm" href="#/overview">Open your overview</a>
        </div>
      )}

      <div className="grid g2">
        <Card title={<span className="row"><Globe size={17} /> Connect Chrome (recommended)</span>} sub="Reads your Chrome history through a small extension you install and control. You approve Chrome's own permission prompt; you can revoke it at any time.">
          <div className="notice small" style={{ marginBottom: 12 }}>{status.icon}<span style={{ flex: 1 }}>{status.text}</span><button className="btn sm ghost" onClick={recheck}><RefreshCw size={12} /> Re-check</button></div>
          {!ready && (
            <ol className="steps small">
              <li>Download the project: <a href={REPO_ZIP}>repository ZIP</a>, and unzip it.</li>
              <li>Open <span className="kbd">chrome://extensions</span>, switch on <b>Developer mode</b>, click <b>Load unpacked</b> and select the <span className="kbd">extension</span> folder.</li>
              <li>Click the extension's icon, then <b>Grant history access</b>. Chrome asks you to approve “Read your browsing history”.</li>
              <li>In the popup, tick <b>Allow my dashboard page to request history and captured products</b>, then click <b>Re-check</b> here.</li>
            </ol>
          )}
          <div className="hr" />
          <div className="row">
            <label className="small muted" htmlFor="days">Period</label>
            <select id="days" className="input" value={days} onChange={(e) => setDays(+e.target.value)}>
              {[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
          </div>
          <label className="row small" style={{ marginTop: 12, alignItems: "flex-start", flexWrap: "nowrap" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I approve this page reading my Chrome history (URLs, page titles, visit times) for the last {days} days, for analysis in this tab only. Cookies, passwords and sign-in data are never read.</span>
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!ready || !consent || busy} onClick={importChrome}>{busy ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}Import Chrome history</button>
          </div>
          {msg && <div className={`notice small ${msg.ok ? "" : "bad"}`} style={{ marginTop: 12 }}>{msg.ok ? <CheckCircle2 size={15} color="var(--good)" /> : <XCircle size={15} color="var(--bad)" />}{msg.text}</div>}
          <p className="small faint" style={{ marginTop: 12 }}>Alternative without connecting: in the extension popup click <b>Export history as JSON</b> and import that file on the right.</p>
        </Card>

        <Card title={<span className="row"><FileUp size={17} /> Import your exports</span>} sub="Drop one or more files. Formats are detected automatically, and files are read locally. They are never uploaded.">
          <div className={`drop ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); importFiles(e.dataTransfer.files); }}>
            <FileUp size={26} style={{ margin: "0 auto 8px", display: "block" }} />
            <div>Drag files here, or</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => inputRef.current?.click()}>Choose files</button>
            <input ref={inputRef} type="file" multiple accept=".json,.csv,.txt" hidden data-testid="file-input" onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {fileLog.length > 0 && <div className="ev" style={{ marginTop: 12 }}>{fileLog.map((l, i) => <div key={i} className="ev-item" style={{ gridTemplateColumns: "18px minmax(0,1fr)" }}>{l.ok ? <CheckCircle2 size={14} color="var(--good)" /> : <XCircle size={14} color="var(--bad)" />}<span><b>{l.name}</b>: {l.text}</span></div>)}</div>}
          <div className="hr" />
          <table className="table small">
            <thead><tr><th>Source</th><th>How to get it</th></tr></thead>
            <tbody>
              <tr><td>Chrome history</td><td><a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a> → Chrome → <span className="kbd">BrowserHistory.json</span></td></tr>
              <tr><td>Google searches &amp; YouTube</td><td>Takeout → My Activity → choose <b>JSON</b> format → <span className="kbd">MyActivity.json</span></td></tr>
              <tr><td>ChatGPT</td><td>ChatGPT Settings → Data controls → Export → <span className="kbd">conversations.json</span> (only your own messages are analysed)</td></tr>
              <tr><td>Amazon orders</td><td>Amazon “Request your data” → Your Orders → <span className="kbd">Retail.OrderHistory.1.csv</span></td></tr>
              <tr><td>Other</td><td>Any CSV with <span className="kbd">url</span>, <span className="kbd">title</span> and a time column; order CSVs with date, product and price</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="What this lab will and will not do">
        <div className="grid g2 small">
          <ul className="steps" style={{ margin: 0 }}>
            <li>Analyses only records you provide, in this tab. Nothing is sent to any server or AI service.</li>
            <li>Records are kept in memory and disappear when you close the tab, unless you opt in to keeping them on this device (Data &amp; Privacy).</li>
            <li>Every prediction shows its evidence, method, evidence strength and alternative explanations, and you can confirm or reject it.</li>
          </ul>
          <ul className="steps" style={{ margin: 0 }}>
            <li>Health, politics, religion, sexuality and dating records are excluded before analysis. No sensitive traits are inferred.</li>
            <li>The traits are descriptive patterns, not clinical or validated personality measures, and no probabilities are invented.</li>
            <li>Recommendations come only from real product pages you capture or catalogs you import. Nothing is made up.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
