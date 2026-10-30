import { ExternalLink } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { Card, Empty, PageHead } from "../components/ui.tsx";

export default function Recommendations() {
  const { ranked } = useLab();
  if (!ranked.length) return (
    <>
      <PageHead title="Personalized Recommendations" />
      <Empty title="No products to recommend yet">Recommendations are made only from real products you capture or import, so none are invented. Go to <a href="#/discovery">Product Discovery</a> to add some.</Empty>
    </>
  );
  return (
    <>
      <PageHead title="Personalized Recommendations" intro="Your captured and imported products, ranked by how well they fit your observed behaviour. The match index (0–100) is a weighted sum of the factors listed on each card. It is not a probability of purchase. Your verdicts in AI vs. Reality change the weights." />
      <div className="grid g3">
        {ranked.map((r, i) => (
          <Card key={r.product.id} className="rec" title={<a href={r.product.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)" }}>{r.product.name}</a>} sub={`${r.product.retailer}${r.product.brand ? " · " + r.product.brand : ""}`} right={<span className="badge b-moderate mono" title="Match index, not a probability">#{i + 1} · {r.index}</span>}>
            {r.product.image ? <img className="product-img" src={r.product.image} alt={r.product.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement("div"), { className: "product-ph", textContent: "Image unavailable" })); }} /> : <div className="product-ph">No image published</div>}
            <div className="row between" style={{ margin: "12px 0 6px" }}>
              <span className="display" style={{ fontSize: 20, fontWeight: 600 }}>{r.product.price != null ? `${r.product.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}${r.product.currency ? " " + r.product.currency : ""}` : <span className="small muted">Price not published</span>}</span>
              {r.product.availability && <span className="chip">{r.product.availability.replace(/^https?:\/\/schema\.org\//, "")}</span>}
            </div>
            {r.product.rating != null && <div className="small muted">Rated {r.product.rating}/5{r.product.reviewCount ? ` from ${r.product.reviewCount.toLocaleString()} reviews` : ""}{r.product.evidence === "catalog-import" ? " (as given in your catalog file)" : " (as published on the page)"}</div>}
            <div className="small faint">{r.product.capturedAt ? `Captured ${new Date(r.product.capturedAt).toLocaleString()}; the price may have changed since.` : "Imported from a catalog file."}</div>
            <div className="hr" />
            <div className="small faint" style={{ marginBottom: 6 }}>Why it ranks here</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {r.factors.map((f) => (
                <div key={f.name} className="small">
                  <div className="row between"><span>{f.name}</span><span className="mono muted">{f.weight ? `${Math.round(f.score * 100)} × w${f.weight.toFixed(2)}` : "not used"}</span></div>
                  <div className="bar" style={{ height: 5, margin: "3px 0" }}><span style={{ width: `${f.score * 100}%`, background: f.weight ? "var(--accent)" : "var(--faint)" }} /></div>
                  <div className="faint">{f.explanation}</div>
                </div>
              ))}
            </div>
            <a className="btn sm" style={{ marginTop: 12 }} href={r.product.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />View at {r.product.retailer}</a>
          </Card>
        ))}
      </div>
    </>
  );
}
