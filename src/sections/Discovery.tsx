import { useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FileUp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { fromCaptured, parseFile } from "../lib/parsers.ts";
import { detectExtension, explainError, fetchCapturedProducts } from "../lib/extension.ts";
import { Card, PageHead, fmtNum } from "../components/ui.tsx";

const CAPTURE_LABEL = "Captured product pages (extension)";

export default function Discovery() {
  const { dataset, sources, addSource, removeSource } = useLab();
  const [url, setUrl] = useState("");
  const [urlErr, setUrlErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = () => {
    let u: URL;
    try { u = new URL(url.trim()); } catch { setUrlErr("Enter a full address starting with https://"); return; }
    if (!/^https?:$/.test(u.protocol)) { setUrlErr("Only http(s) retailer pages can be opened."); return; }
    setUrlErr("");
    window.open(u.href, "_blank", "noopener,noreferrer");
  };

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      await detectExtension();
      const raw = await fetchCapturedProducts();
      const seen = new Set<string>();
      const products = fromCaptured(raw as Parameters<typeof fromCaptured>[0], "x").filter((p) => (seen.has(p.url + p.name) ? false : (seen.add(p.url + p.name), true)));
      if (!products.length) throw new Error("The extension has no captured products yet. Open a product page, click the extension icon, then “Capture products on this page”.");
      sources.filter((s) => s.label === CAPTURE_LABEL).forEach((s) => removeSource(s.id));
      addSource("products", CAPTURE_LABEL, { products });
      setMsg({ ok: true, text: `Synced ${products.length} captured product${products.length === 1 ? "" : "s"}.` });
    } catch (e) { setMsg({ ok: false, text: explainError(e) }); }
    finally { setBusy(false); }
  };

  const importCatalog = async (files: FileList) => {
    for (const f of Array.from(files)) {
      try {
        const r = parseFile(f.name, await f.text(), "x");
        if (r.kind !== "products" || !r.data.products?.length) throw new Error("This file is not a product catalog. It needs name and url columns (price, brand, image are optional).");
        addSource("products", f.name, { products: r.data.products });
        setMsg({ ok: true, text: `Imported ${r.data.products.length} products from ${f.name}.` });
      } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    }
  };

  const products = dataset.products;
  return (
    <>
      <PageHead title="Product Discovery" intro="Bring in real products from retailers you choose. This page never fetches or scrapes retailer sites itself. You open the page, and the extension reads the product data that page publishes (schema.org JSON-LD or OpenGraph) only when you click Capture. Nothing is guessed: if a page publishes no price, none is shown." />
      <div className="grid g3">
        <Card title="1 · Open a retailer page" sub="Paste a product or search-results URL. It opens in a new tab as a normal visit, so the retailer's own rules and protections apply.">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" style={{ flex: 1 }} placeholder="https://www.example-store.com/product/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && open()} aria-label="Retailer URL" />
            <button className="btn" onClick={open}><ExternalLink size={14} />Open</button>
          </div>
          {urlErr && <p className="small" style={{ color: "var(--bad)" }}>{urlErr}</p>}
        </Card>
        <Card title="2 · Capture on that page" sub="In the retailer tab, click the Consumer Lab Connector icon, then “Capture products on this page”.">
          <ul className="steps small" style={{ margin: 0 }}>
            <li>Reads only the tab you are on, after you click. It uses Chrome's activeTab, so there is no background access.</li>
            <li>Records the name, URL, image, brand, price, currency, availability and rating exactly as the page publishes them, plus the capture time.</li>
            <li>Pages that publish no product data yield nothing, and nothing is invented to fill the gap.</li>
          </ul>
        </Card>
        <Card title="3 · Sync or import" sub="Pull your captures into this tab, or import a catalog file (CSV or JSON with name and url; price, brand and image are optional).">
          <div className="row">
            <button className="btn primary" onClick={sync} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Sync captured products</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><FileUp size={14} />Import catalog</button>
            <input ref={fileRef} type="file" accept=".csv,.json" multiple hidden data-testid="catalog-input" onChange={(e) => { if (e.target.files) importCatalog(e.target.files); e.target.value = ""; }} />
          </div>
          {msg && <div className={`notice small ${msg.ok ? "" : "bad"}`} style={{ marginTop: 10 }}>{msg.ok ? <CheckCircle2 size={15} color="var(--good)" /> : <XCircle size={15} color="var(--bad)" />}{msg.text}</div>}
        </Card>
      </div>

      <Card title={`Your product pool (${fmtNum(products.length)})`} sub="Real products from your captures and imports. Prices and availability are as published at capture time and may have changed since." className="scroll-x" >
        {products.length ? (
          <table className="table" style={{ marginTop: 6 }} data-testid="product-table">
            <thead><tr><th>Product</th><th>Retailer</th><th>Price</th><th>Availability</th><th>Source</th><th>Captured</th></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.id}>
                <td className="trunc"><a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a>{p.brand && <span className="faint"> · {p.brand}</span>}</td>
                <td>{p.retailer}</td>
                <td className="mono">{p.price != null ? `${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}${p.currency ? " " + p.currency : ""}` : <span className="faint">not published</span>}</td>
                <td>{p.availability?.replace(/^https?:\/\/schema\.org\//, "") ?? <span className="faint">—</span>}</td>
                <td><span className="chip">{p.evidence}</span></td>
                <td className="small muted">{p.capturedAt ? new Date(p.capturedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="muted small" style={{ marginTop: 8 }}>No products yet. Recommendations stay empty until you capture or import real products.</p>}
      </Card>
    </>
  );
}
