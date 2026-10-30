import { RotateCcw } from "lucide-react";
import { useLab } from "../lib/store.tsx";
import { Card, Evidence, FeedbackButtons, PageHead, Stat, StrengthBadge, pct } from "../components/ui.tsx";

const Row = ({ k, title, sub, badge, ids }: { k: string; title: string; sub: string; badge?: string; ids?: string[] }) => (
  <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }} data-testid={`fb-row-${k}`}>
    <div className="row between" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: "1 1 260px" }}><b>{title}</b> {badge && <StrengthBadge s={badge} />}<div className="small muted">{sub}</div></div>
      <FeedbackButtons k={k} />
    </div>
    {ids && ids.length > 0 && <div style={{ marginTop: 4 }}><Evidence ids={ids} limit={5} /></div>}
  </div>
);


export default function Reality() {
  const { traits, segments, analysis, feedback, setFeedback } = useLab();
  const vals = Object.values(feedback);
  const acc = vals.filter((v) => v === "accurate").length, inacc = vals.filter((v) => v === "inaccurate").length, unc = vals.filter((v) => v === "uncertain").length;
  const scoredTraits = traits.filter((t) => t.label !== "INSUFFICIENT DATA");
  const segs = segments.filter((s) => s.membership === "Strong" || s.membership === "Moderate" || s.membership === "Weak" || feedback[`seg:${s.id}`]);
  const removed = Object.entries(feedback).filter(([k, v]) => v === "inaccurate" && /^(brand|prod):/.test(k));
  const rejectedTraits = traits.filter((t) => feedback[t.id] === "inaccurate");
  const suppressed = segments.filter((s) => s.membership === "Suppressed by your feedback");

  return (
    <>
      <PageHead title="AI vs. Reality" intro="Check each prediction against what you know about yourself. Marking one inaccurate updates the profile at once: rejected traits stop driving segments and recommendation weights, and rejected interests are removed from the interest profile, network and recommendations. “Uncertain” halves a trait's weight in recommendations." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Card><Stat value={acc} label="marked accurate" /></Card>
        <Card><Stat value={inacc} label="marked inaccurate" /></Card>
        <Card><Stat value={unc} label="marked uncertain" /></Card>
        <Card><Stat value={acc + inacc ? pct(acc / (acc + inacc)) : "—"} label="agreement (accurate ÷ accurate + inaccurate)" /></Card>
      </div>
      {(rejectedTraits.length > 0 || removed.length > 0) && (
        <Card title="How your corrections changed the profile" className="" >
          <ul className="steps small">
            {rejectedTraits.map((t) => <li key={t.id}>Rejected <b>{t.name}</b>: its recommendation weight is now 0{suppressed.some((s) => s.dependsOn.includes(t.id)) ? `, and these segments are suppressed: ${suppressed.filter((s) => s.dependsOn.includes(t.id)).map((s) => s.name).join(", ")}` : ""}.</li>)}
            {removed.map(([k]) => <li key={k}>Removed <b>{k.split(":").slice(1).join(":")}</b> ({k.startsWith("brand:") ? "brand" : "product interest"}) from your interest profile. <button className="btn sm ghost" onClick={() => setFeedback(k, null)}><RotateCcw size={12} />Restore</button></li>)}
          </ul>
        </Card>
      )}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Traits" sub={`${scoredTraits.length} traits have enough data to check`}>
          {scoredTraits.length ? scoredTraits.map((t) => <Row key={t.id} k={t.id} title={`${t.name}: ${t.label}`} sub={t.evidence[0] ?? ""} badge={t.strength} ids={t.examples} />) : <p className="muted small">No trait has enough data yet.</p>}
          {rejectedTraits.filter((t) => t.label === "INSUFFICIENT DATA").map((t) => <Row key={t.id} k={t.id} title={t.name} sub="Previously rejected (now insufficient data)" />)}
        </Card>
        <Card title="Segments" sub="Segments you were assigned to">
          {segs.length ? segs.map((s) => <Row key={s.id} k={`seg:${s.id}`} title={s.name} sub={s.reasons[0] ?? ""} badge={s.membership} />) : <p className="muted small">No segment memberships to check.</p>}
        </Card>
        <Card title="Brand interests" sub="Brands detected in your records. Mark ones that don't reflect you, for example work-related ones.">
          {analysis.brands.slice(0, 12).map((b) => <Row key={b.name} k={`brand:${b.name}`} title={b.name} sub={`${b.count} mentions`} ids={b.evidence} />)}
          {!analysis.brands.length && <p className="muted small">No brands detected.</p>}
        </Card>
        <Card title="Product interests" sub="Product categories you appear interested in">
          {analysis.productInterests.slice(0, 10).map((p) => <Row key={p.name} k={`prod:${p.name}`} title={p.name} sub={`${p.count} signals`} ids={p.evidence} />)}
          {!analysis.productInterests.length && <p className="muted small">No product interests detected.</p>}
        </Card>
      </div>
    </>
  );
}
