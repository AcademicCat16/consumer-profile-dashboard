import { useEffect, useMemo, useState } from "react";
import { HardDrive, PlugZap, RefreshCw, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { detectExtension, disconnectExtension, explainError } from "../lib/extension.ts";
import type { ExtStatus } from "../lib/extension.ts";
import { Card, PageHead, fmtNum } from "../components/ui.tsx";

type Kind = "visits" | "searches" | "conversations" | "purchases" | "products";
const KIND_LABEL: Record<Kind, string> = { visits: "Visits", searches: "Searches", conversations: "Conversations", purchases: "Purchases", products: "Products" };
const PAGE = 50;

export default function Privacy() {
  const { sources, dataset, analysis, removeSource, deleteRecord, deleteAll, persist, setPersist } = useLab();
  const [ext, setExt] = useState<ExtStatus | null>(null);
  const [extMsg, setExtMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("visits");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [confirmAll, setConfirmAll] = useState(false);
  const recheck = async () => setExt(await detectExtension());
  const disconnect = async () => {
    try { await disconnectExtension(); setExtMsg("Disconnected. Chrome's history permission was removed and this dashboard can no longer read your history. Data already loaded in this tab stays until you delete it below."); }
    catch (e) { setExtMsg(explainError(e)); }
    recheck();
  };
  useEffect(() => { recheck(); }, []);
  useEffect(() => setPage(0), [kind, q]);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    const list: { id: string; time: number | null; title: string; sub: string }[] =
      kind === "visits" ? dataset.visits.map((v) => ({ id: v.id, time: v.time, title: v.title || v.url, sub: v.url }))
      : kind === "searches" ? dataset.searches.map((s) => ({ id: s.id, time: s.time, title: s.query, sub: s.engine }))
      : kind === "conversations" ? dataset.conversations.map((c) => ({ id: c.id, time: c.time, title: c.title, sub: `${c.messageCount} of your messages` }))
      : kind === "purchases" ? dataset.purchases.map((p) => ({ id: p.id, time: p.time, title: p.product, sub: p.store }))
      : dataset.products.map((p) => ({ id: p.id, time: p.capturedAt ? Date.parse(p.capturedAt) : null, title: p.name, sub: p.url }));
    return (ql ? list.filter((r) => r.title.toLowerCase().includes(ql) || r.sub.toLowerCase().includes(ql)) : list).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  }, [dataset, kind, q]);
  const c = analysis.counts;

  return (
    <>
      <PageHead title="Data Connections & Privacy" intro="Everything this lab knows about you is listed here, and you can delete any of it. The site is static: it has no server, analytics, cookies or AI API calls. Your records stay in this browser tab." />
      <div className="grid g3">
        <Card title={<span className="row"><ShieldCheck size={16} /> Chrome connection</span>} right={<button className="btn sm ghost" onClick={recheck} aria-label="Re-check extension"><RefreshCw size={12} /></button>}>
          {!ext ? <p className="muted small">Checking…</p> : !ext.installed ? <p className="small">Extension not detected. No browser permission is active for this site.</p> : (
            <table className="table small" data-testid="ext-status"><tbody>
              <tr><td>Extension</td><td>v{ext.version}{ext.build === "development" ? " (test build)" : ""}</td></tr>
              <tr><td>Chrome history permission</td><td>{ext.historyGranted ? <span className="badge b-strong">Granted</span> : <span className="badge b-insufficient">Not granted</span>}</td></tr>
              <tr><td>This dashboard</td><td>{ext.authorized ? <span className="badge b-strong">Connected{ext.authorizedDays ? ` · ${ext.authorizedDays} days` : ""}</span> : <span className="badge b-insufficient">Not connected</span>}</td></tr>
            </tbody></table>
          )}
          {ext?.authorized ? <button className="btn sm danger" onClick={disconnect} data-testid="disconnect"><Unplug size={13} />Disconnect Chrome</button>
            : ext?.installed ? <a className="btn sm" href="#/connect"><PlugZap size={13} />Connect Chrome</a> : null}
          {extMsg && <p className="small" style={{ color: "var(--good)" }}>{extMsg}</p>}
          <p className="small muted">Disconnecting removes Chrome's history permission and this dashboard's access. You can also disconnect from the extension menu, or remove the extension at <span className="kbd">chrome://extensions</span>. The extension never requests cookies, passwords or sign-in data.</p>
        </Card>
        <Card title={<span className="row"><HardDrive size={16} /> Storage on this device</span>}>
          <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} style={{ marginTop: 3 }} data-testid="persist-toggle" />
            <span><b>Keep my data on this device</b> (off by default). When on, your imported records and verdicts are saved in this browser's IndexedDB so they survive reloads. They are never uploaded. Turning this off erases the saved copy.</span>
          </label>
          <p className="small muted" style={{ marginTop: 10 }}>Currently: {persist ? "saved in this browser until you turn this off or delete everything." : "memory only. Closing the tab erases everything."}</p>
        </Card>
        <Card title="Excluded from analysis">
          <table className="table small"><tbody>
            <tr><td>Sensitive-topic records</td><td className="mono">{fmtNum(c.sensitiveExcluded)}</td></tr>
            <tr><td>Sensitive conversations</td><td className="mono">{fmtNum(c.conversationsExcluded)}</td></tr>
            <tr><td>Technical pages (sign-in, settings, local)</td><td className="mono">{fmtNum(c.noiseExcluded)}</td></tr>
          </tbody></table>
          <p className="small muted">Health, politics, religion, sexuality and dating topics are removed before any counting, and no sensitive characteristics are inferred.</p>
        </Card>
      </div>

      <Card title="Connected sources" sub="Delete a source to remove all of its records and recompute the profile." className="scroll-x" >
        {sources.length ? (
          <table className="table" data-testid="sources-table">
            <thead><tr><th>Source</th><th>Type</th><th>Imported</th><th>Records</th><th /></tr></thead>
            <tbody>{sources.map((s) => (
              <tr key={s.id}><td>{s.label}</td><td><span className="chip">{s.kind}</span></td><td className="small muted">{new Date(s.importedAt).toLocaleString()}</td>
                <td className="small">{Object.entries(s.counts).map(([k, n]) => `${fmtNum(n)} ${k}`).join(", ")}</td>
                <td><button className="btn sm danger" onClick={() => removeSource(s.id)} aria-label={`Delete source ${s.label}`}><Trash2 size={13} />Delete</button></td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted small">No sources connected. <a href="#/connect">Connect or import data</a>.</p>}
      </Card>

      <Card title="Your records" sub="Browse and delete individual records. Deleting a visit also removes any search embedded in its URL." className="scroll-x" >
        <div className="row" style={{ marginBottom: 10 }}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]} ({fmtNum(dataset[k].length)})</button>)}
          <input className="input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: "auto" }} aria-label="Filter records" />
        </div>
        {rows.length ? (
          <>
            <table className="table" data-testid="records-table">
              <tbody>{rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => (
                <tr key={r.id}><td className="small muted mono" style={{ whiteSpace: "nowrap" }}>{r.time ? new Date(r.time).toLocaleString() : "—"}</td><td className="trunc">{r.title}<div className="small faint trunc">{r.sub}</div></td>
                  <td style={{ width: 40 }}><button className="btn sm ghost" onClick={() => deleteRecord(r.id)} aria-label="Delete record" title="Delete record"><Trash2 size={13} /></button></td></tr>
              ))}</tbody>
            </table>
            <div className="row between small muted" style={{ marginTop: 8 }}>
              <span>{fmtNum(page * PAGE + 1)}–{fmtNum(Math.min(rows.length, (page + 1) * PAGE))} of {fmtNum(rows.length)}</span>
              <span className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button></span>
            </div>
          </>
        ) : <p className="muted small">No records.</p>}
      </Card>

      <Card title="Delete everything" sub="Removes all sources, records, verdicts and any copy saved on this device. It does not touch your Chrome history itself.">
        {!confirmAll ? <button className="btn danger" onClick={() => setConfirmAll(true)} disabled={!sources.length && !persist}><Trash2 size={14} />Delete all data</button> : (
          <div className="row"><span className="small">Delete all data from this lab?</span><button className="btn danger" onClick={async () => { await deleteAll(); setConfirmAll(false); window.location.hash = "/connect"; }}>Yes, delete everything</button><button className="btn" onClick={() => setConfirmAll(false)}>Cancel</button></div>
        )}
      </Card>
    </>
  );
}
