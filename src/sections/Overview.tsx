import { useLab } from "../lib/store.tsx";
import { CATEGORY_COLORS } from "../lib/taxonomy.ts";
import { Card, Evidence, HBar, PageHead, Stat, StrengthBadge, fmtDate, fmtNum, pct } from "../components/ui.tsx";

export default function Overview() {
  const { analysis: a, traits, segments, sources } = useLab();
  const c = a.counts;
  const scored = traits.filter((t) => t.id !== "style" && t.position != null);
  const style = traits.find((t) => t.id === "style");
  const members = segments.filter((s) => s.membership === "Strong" || s.membership === "Moderate");

  return (
    <>
      <PageHead title="Consumer Overview" intro={<>Built from {sources.length} source{sources.length === 1 ? "" : "s"} you provided, covering {fmtDate(c.first)} to {fmtDate(c.last)}. <b>Observed</b> panels are counts from your records. <b>Inferred</b> panels are interpretations you can check in AI vs. Reality.</>} />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Card><Stat value={fmtNum(c.analyzedVisits)} label={`analysed visits (of ${fmtNum(c.rawVisits)} imported)`} /></Card>
        <Card><Stat value={fmtNum(c.activeDays)} label={`active days · ${fmtNum(a.sessions.length)} sessions`} /></Card>
        <Card><Stat value={fmtNum(a.sites.length)} label="distinct sites" /></Card>
        <Card><Stat value={fmtNum(c.searches)} label={`searches · ${fmtNum(c.conversations)} conversations · ${fmtNum(c.purchases)} purchases`} /></Card>
      </div>
      <div className="notice small" style={{ marginBottom: 16 }}>
        Excluded before analysis: {fmtNum(c.sensitiveExcluded)} sensitive-topic records (health, politics, religion, sexuality, dating), {fmtNum(c.noiseExcluded)} technical pages (sign-in, settings, local pages){c.conversationsExcluded ? `, ${fmtNum(c.conversationsExcluded)} conversations` : ""}.
      </div>

      <div className="grid g3">
        <Card title="Where your attention goes" sub="Observed · share of analysed visits by category" className="span2">
          <HBar items={a.categories.slice(0, 10).map((x) => ({ label: x.category, value: x.visits, note: `${pct(x.share, 1)} · ${fmtNum(x.visits)}`, color: CATEGORY_COLORS[x.category] }))} />
        </Card>
        <Card title="Profile snapshot" sub={`Inferred · ${scored.length} of ${traits.length - 1} traits have enough data`}>
          {style && <div style={{ marginBottom: 12 }}><div className="small faint">Decision style</div><div className="display" style={{ fontSize: 20 }}>{style.label === "INSUFFICIENT DATA" ? <span className="insufficient">INSUFFICIENT DATA</span> : style.label}</div></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {traits.filter((t) => t.id !== "style").map((t) => (
              <div key={t.id} className="row between small" style={{ flexWrap: "nowrap" }}>
                <span className="muted">{t.name}</span>
                <span className="row" style={{ flexWrap: "nowrap" }}>{t.position == null ? <span className="insufficient">INSUFFICIENT</span> : <b>{t.label}</b>}</span>
              </div>
            ))}
          </div>
          <a className="btn sm" style={{ marginTop: 14 }} href="#/personality">Method &amp; evidence</a>
        </Card>

        <Card title="Most-visited sites" sub="Observed">
          <table className="table"><tbody>
            {a.sites.slice(0, 10).map((s) => <tr key={s.site}><td><span className="legend-dot" style={{ background: CATEGORY_COLORS[s.category] }} /> {s.site}</td><td className="muted mono" style={{ textAlign: "right" }}>{fmtNum(s.visits)}</td></tr>)}
          </tbody></table>
        </Card>
        <Card title="Brands & product interests" sub="Observed · mentions in titles, searches, purchases">
          <div className="small faint" style={{ marginBottom: 6 }}>Brands</div>
          <div className="row" style={{ gap: 6 }}>{a.brands.slice(0, 14).map((b) => <span key={b.name} className="chip">{b.name} <b>{b.count}</b></span>)}{!a.brands.length && <span className="muted small">No known brands detected.</span>}</div>
          <div className="small faint" style={{ margin: "14px 0 6px" }}>Product categories</div>
          <div className="row" style={{ gap: 6 }}>{a.productInterests.slice(0, 10).map((b) => <span key={b.name} className="chip">{b.name} <b>{b.count}</b></span>)}{!a.productInterests.length && <span className="muted small">No product interests detected.</span>}</div>
          {a.brands[0] && <div style={{ marginTop: 12 }}><Evidence ids={a.brands[0].evidence} label={`Evidence for ${a.brands[0].name}`} /></div>}
        </Card>
        <Card title="Segments you fall into" sub="Inferred · rule-based, overlapping">
          {members.length ? members.map((s) => <div key={s.id} className="row between small" style={{ marginBottom: 8, flexWrap: "nowrap" }}><span>{s.name}</span><StrengthBadge s={s.membership} /></div>) : <p className="muted small">No segment reaches moderate membership with the current data.</p>}
          <a className="btn sm" style={{ marginTop: 8 }} href="#/segments">All segments</a>
        </Card>

        <Card title="Shopping behaviour" sub="Observed">
          <div className="grid g2" style={{ gap: 10 }}>
            <Stat value={fmtNum(a.shopping.sessions)} label="shopping sessions" />
            <Stat value={fmtNum(a.shopping.retailerVisits)} label="retailer visits" />
            <Stat value={fmtNum(a.shopping.dealVisits)} label="deal-site visits" />
            <Stat value={fmtNum(a.shopping.reviewVisits)} label="review visits" />
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Top retailers: {a.shopping.retailers.slice(0, 4).map((r) => `${r.site} (${r.visits})`).join(", ") || "none"}</div>
        </Card>
        <Card title="Recurring search terms" sub="Observed · words in 2+ searches">
          <div className="row" style={{ gap: 6 }}>{a.queryTerms.slice(0, 24).map((t) => <span key={t.name} className="chip">{t.name} <b>{t.count}</b></span>)}{!a.queryTerms.length && <span className="muted small">No repeated search terms.</span>}</div>
        </Card>
        <Card title="Conversation topics" sub="Observed · keyword topics in your own ChatGPT messages">
          {a.conversationTopics.length ? <HBar items={a.conversationTopics.slice(0, 8).map((t) => ({ label: t.category, value: t.conversations, color: CATEGORY_COLORS[t.category] }))} /> : <p className="muted small">No ChatGPT export imported.</p>}
        </Card>
      </div>
    </>
  );
}
