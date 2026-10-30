import { useLab } from "../lib/store.tsx";
import { categoryPreferences } from "../lib/traits.ts";
import type { Trait } from "../lib/traits.ts";
import { Card, Evidence, FeedbackButtons, HBar, PageHead, StrengthBadge, fmtNum, pct } from "../components/ui.tsx";

const TraitCard = ({ t }: { t: Trait }) => {
  const { feedback } = useLab();
  const fb = feedback[t.id];
  return (
    <Card title={t.name} right={<StrengthBadge s={t.strength} />} className="trait" >
      <div data-testid={`trait-${t.id}`}>
        {t.id !== "style" && (
          <>
            <div className="row between small muted" style={{ margin: "6px 0" }}><span>{t.poles[0]}</span><span>{t.poles[1]}</span></div>
            <div className={`spectrum ${t.position == null ? "na" : ""}`} aria-label={t.position == null ? "Insufficient data" : `Position ${pct(t.position)}`}>
              {t.position != null && <span className="dot" style={{ left: `${Math.min(100, Math.max(0, t.position * 100))}%` }} />}
            </div>
          </>
        )}
        <div style={{ margin: "14px 0 6px" }}>
          {t.label === "INSUFFICIENT DATA" ? <span className="insufficient">INSUFFICIENT DATA</span> : <span className="display" style={{ fontSize: 19, fontWeight: 600 }}>{t.label}{t.position != null && t.id !== "style" && <span className="muted mono" style={{ fontSize: 13, marginLeft: 8 }}>ratio {t.position.toFixed(2)}</span>}</span>}
        </div>
        <div className="small muted">Based on {fmtNum(t.sample)} {t.sampleUnit} (minimum {t.minSample}). Evidence strength reflects the sample size only.</div>
        <ul className="steps small" style={{ marginTop: 8 }}>{t.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <Evidence ids={t.examples} label="Example records" />
        <details style={{ marginTop: 6 }}><summary>Method</summary><p className="small" style={{ margin: "6px 0" }}>{t.method}</p></details>
        <details style={{ marginTop: 6 }}><summary>Alternative explanations</summary><ul className="steps small">{t.alternatives.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
        <div className="hr" />
        <div className="row between">
          <span className="small muted">{fb ? `You marked this ${fb}.` : "Does this match you?"}</span>
          {t.label !== "INSUFFICIENT DATA" && <FeedbackButtons k={t.id} />}
        </div>
      </div>
    </Card>
  );
};

export default function Personality() {
  const { traits, analysis } = useLab();
  const prefs = categoryPreferences(analysis);
  return (
    <>
      <PageHead title="Personality & Shopping Style" intro={<>Descriptive consumer tendencies computed from your own records. Each one is a <b>transparent ratio</b> with its method, the sample it rests on and alternative explanations. These are not clinical or validated personality measurements, and no probabilities are invented. If the sample is below the minimum, the trait shows <span className="insufficient">INSUFFICIENT DATA</span>.</>} />
      <div className="grid g2">
        {traits.map((t) => <TraitCard key={t.id} t={t} />)}
        <Card title="Category preferences" sub={`Observed · product-category interest across browsing, searches and purchases (${fmtNum(prefs.total)} signals)`}>
          {prefs.items.length ? <HBar items={prefs.items.slice(0, 10).map((x) => ({ label: x.name, value: x.count, note: `${pct(x.share)} · ${x.count}` }))} /> : <span className="insufficient">INSUFFICIENT DATA</span>}
        </Card>
      </div>
    </>
  );
}
