import { useState } from "react";
import type { ReactNode } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import type { Feedback } from "../lib/types.ts";
import type { Strength } from "../lib/traits.ts";
import { useLab } from "../lib/store.tsx";

export const PageHead = ({ title, intro, right }: { title: string; intro?: ReactNode; right?: ReactNode }) => (
  <div className="page-head">
    <div><h1>{title}</h1>{intro && <p>{intro}</p>}</div>
    {right}
  </div>
);

export const Card = ({ title, sub, children, className = "", right }: { title?: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string; right?: ReactNode }) => (
  <section className={`card ${className}`}>
    {(title || right) && <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}><div style={{ minWidth: 0 }}>{title && <h3>{title}</h3>}{sub && <p className="sub">{sub}</p>}</div>{right}</div>}
    {children}
  </section>
);

export const Stat = ({ value, label }: { value: ReactNode; label: ReactNode }) => (
  <div className="stat"><span className="v">{value}</span><span className="l">{label}</span></div>
);

export const StrengthBadge = ({ s }: { s: Strength | string }) => {
  const cls = s === "Strong" ? "b-strong" : s === "Moderate" ? "b-moderate" : s === "Limited" || s === "Weak" ? "b-limited" : s.startsWith("Suppressed") ? "b-bad" : "b-insufficient";
  return <span className={`badge ${cls}`}>{s === "Insufficient" ? "Insufficient data" : s}</span>;
};

export const FeedbackButtons = ({ k, compact = false }: { k: string; compact?: boolean }) => {
  const { feedback, setFeedback } = useLab();
  const cur = feedback[k];
  const b = (f: Feedback, icon: ReactNode, label: string) => (
    <button type="button" className={cur === f ? `sel-${f}` : ""} aria-pressed={cur === f} title={label} onClick={() => setFeedback(k, cur === f ? null : f)}>
      {icon}{!compact && label}
    </button>
  );
  return <span className="fb" role="group" aria-label="Your verdict">{b("accurate", <Check size={13} />, "Accurate")}{b("inaccurate", <X size={13} />, "Inaccurate")}{b("uncertain", <HelpCircle size={13} />, "Uncertain")}</span>;
};

export const fmtDate = (t: number | null | undefined, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }) => (t ? new Date(t).toLocaleDateString(undefined, opts) : "—");
export const fmtNum = (n: number) => n.toLocaleString();
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Lists the user's own records behind an inference, newest first. */
export const Evidence = ({ ids, limit = 8, label = "Show evidence" }: { ids: string[]; limit?: number; label?: string }) => {
  const { record } = useLab();
  const [n, setN] = useState(limit);
  const recs = ids.map(record).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  if (!recs.length) return null;
  return (
    <details>
      <summary>{label} ({recs.length} record{recs.length === 1 ? "" : "s"})</summary>
      <div className="ev">
        {recs.slice(0, n).map((r) => (
          <div className="ev-item" key={r.id}>
            <span className="t">{r.time ? fmtDate(r.time, { month: "short", day: "numeric", year: "2-digit" }) : r.kind}</span>
            <span className="x" title={r.url ?? r.title}>
              <span className="faint">{r.kind} · </span>
              {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}
              {r.detail && <span className="faint"> · {r.detail}</span>}
            </span>
          </div>
        ))}
        {recs.length > n && <button className="btn sm ghost" onClick={() => setN(n + 20)}>Show more</button>}
      </div>
    </details>
  );
};

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="card" style={{ textAlign: "center", padding: 36 }}>
    <h3 style={{ marginBottom: 6 }}>{title}</h3>
    <div className="muted" style={{ maxWidth: 560, margin: "0 auto" }}>{children}</div>
  </div>
);

export const HBar = ({ items, color, max }: { items: { label: string; value: number; note?: string; color?: string }[]; color?: string; max?: number }) => {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((i) => (
        <div key={i.label}>
          <div className="row between small"><span>{i.label}</span><span className="muted mono">{i.note ?? fmtNum(i.value)}</span></div>
          <div className="bar"><span style={{ width: `${(i.value / m) * 100}%`, background: i.color ?? color ?? "var(--accent)" }} /></div>
        </div>
      ))}
    </div>
  );
};
