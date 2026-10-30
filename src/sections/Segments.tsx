import { useLab } from "../lib/store.tsx";
import type { Membership } from "../lib/segments.ts";
import { Card, FeedbackButtons, PageHead, StrengthBadge } from "../components/ui.tsx";

const ORDER: Membership[] = ["Strong", "Moderate", "Weak", "Not a member", "Insufficient data", "Suppressed by your feedback"];
const LEVEL: Partial<Record<Membership, number>> = { Strong: 3, Moderate: 2, Weak: 1 };

export default function Segments() {
  const { segments, feedback } = useLab();
  const sorted = [...segments].sort((a, b) => ORDER.indexOf(a.membership) - ORDER.indexOf(b.membership));
  const members = sorted.filter((s) => LEVEL[s.membership]);
  const signals = [...new Set(members.flatMap((s) => s.signals))];

  return (
    <>
      <PageHead title="Consumer Segments" intro="Marketing-style segments assigned by explicit rules. Segments overlap, so you can belong to several. Each shows the rule, your values and its membership level. Rejecting a trait in AI vs. Reality suppresses the segments that depend on it." />
      <Card title="Overlap map" sub="Which signals each segment you belong to draws on. Segments in the same column share evidence." className="scroll-x" >
        {members.length ? (
          <table className="table" data-testid="overlap">
            <thead><tr><th>Segment</th><th>Level</th>{signals.map((s) => <th key={s} style={{ textAlign: "center", minWidth: 70 }}>{s}</th>)}</tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td><StrengthBadge s={m.membership} /></td>
                {signals.map((s) => <td key={s} style={{ textAlign: "center" }}>{m.signals.includes(s) ? <span className="legend-dot" style={{ background: "var(--accent)", width: 6 + 4 * (LEVEL[m.membership] ?? 0), height: 6 + 4 * (LEVEL[m.membership] ?? 0) }} /> : <span className="faint">·</span>}</td>)}
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="muted small">You do not reach even weak membership in any segment with the current data.</p>}
      </Card>
      <div className="grid g3" style={{ marginTop: 16 }}>
        {sorted.map((s) => (
          <Card key={s.id} title={s.name} right={<StrengthBadge s={s.membership} />}>
            <p className="small" style={{ marginTop: 4 }}>{s.description}</p>
            <ul className="steps small">{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <details><summary>Rule</summary><p className="small mono" style={{ margin: "6px 0" }}>{s.rule}</p></details>
            {LEVEL[s.membership] && <div className="row between" style={{ marginTop: 10 }}><span className="small muted">Accurate?</span><FeedbackButtons k={`seg:${s.id}`} compact /></div>}
            {feedback[`seg:${s.id}`] === "inaccurate" && <div className="row between" style={{ marginTop: 10 }}><span className="small muted">Change your verdict</span><FeedbackButtons k={`seg:${s.id}`} compact /></div>}
          </Card>
        ))}
      </div>
    </>
  );
}
