/**
 * Explainable consumer-tendency inferences from observed behaviour.
 * NOT a validated psychological or clinical measure. No probabilities are invented:
 * each trait reports a transparent ratio from the user's own records, the sample it rests on,
 * an evidence-strength label derived only from sample size, and alternative explanations.
 * When the sample is below the stated minimum, the trait is INSUFFICIENT DATA.
 */
import type { Analysis } from "./analysis.ts";

export type Strength = "Strong" | "Moderate" | "Limited" | "Insufficient";
export interface Trait {
  id: string;
  name: string;
  poles: [string, string]; // left (0) → right (1)
  position: number | null; // transparent ratio in [0,1]; null = insufficient data
  label: string; // plain-language reading, or "INSUFFICIENT DATA"
  sample: number;
  sampleUnit: string;
  minSample: number;
  strength: Strength;
  method: string;
  evidence: string[];
  examples: string[]; // record ids
  alternatives: string[];
}

const strengthOf = (n: number, min: number): Strength => (n < min ? "Insufficient" : n >= min * 6 ? "Strong" : n >= min * 2.5 ? "Moderate" : "Limited");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const insufficient = (t: Omit<Trait, "position" | "label" | "strength">): Trait => ({ ...t, position: null, label: "INSUFFICIENT DATA", strength: "Insufficient" });
const make = (t: Omit<Trait, "strength">): Trait => ({ ...t, strength: strengthOf(t.sample, t.minSample) });
const band = (x: number, lo: number, hi: number, low: string, mid: string, high: string) => (x >= hi ? high : x <= lo ? low : mid);

export const computeTraits = (a: Analysis): Trait[] => {
  const v = a.visits;
  const shopSessions = a.sessions.filter((s) => s.shopping);
  const out: Trait[] = [];

  // 1. Brand loyalty vs variety seeking — concentration of brand mentions (HHI)
  {
    const total = a.brands.reduce((s, b) => s + b.count, 0);
    const base = { id: "brand", name: "Brand loyalty vs. variety seeking", poles: ["Brand-loyal", "Variety-seeking"] as [string, string], sample: total, sampleUnit: "brand mentions", minSample: 12,
      method: "Herfindahl index (HHI) of brand mentions across visits, searches, purchases and conversations. Position = 1 − HHI. HHI ≥ 0.40 reads as brand-loyal, ≤ 0.15 as variety-seeking.",
      alternatives: ["Brand mentions depend on which brands the taxonomy recognises.", "Researching many brands before one purchase can look like variety seeking.", "Work or school tasks may mention brands you do not personally prefer."] };
    if (total < base.minSample) out.push(insufficient({ ...base, evidence: [`Only ${total} brand mentions detected.`], examples: [] }));
    else {
      const hhi = a.brands.reduce((s, b) => s + (b.count / total) ** 2, 0);
      const top = a.brands.slice(0, 3);
      out.push(make({ ...base, position: 1 - hhi, label: hhi >= 0.4 ? "Leans brand-loyal" : hhi <= 0.15 ? "Leans variety-seeking" : "Mixed brand behaviour",
        evidence: [`${a.brands.length} distinct brands across ${total} mentions; HHI = ${hhi.toFixed(2)}.`, `Top brands: ${top.map((b) => `${b.name} (${b.count}, ${pct(b.count / total)})`).join(", ")}.`],
        examples: top.flatMap((b) => b.evidence.slice(0, 3)) }));
    }
  }

  // 2. Price sensitivity — share of shopping sessions with price-comparison signals
  {
    const base = { id: "price", name: "Price sensitivity", poles: ["Few price signals", "Strong price focus"] as [string, string], sample: shopSessions.length, sampleUnit: "shopping sessions", minSample: 6,
      method: "Share of shopping sessions containing at least one price signal: a deal/coupon/price-tracking site, price words in titles or searches (deal, cheapest, coupon, under $…), price-sorted results, or two or more different retailers in the same session (comparison).",
      alternatives: ["Comparing retailers can reflect stock availability or delivery speed, not price.", "Deal sites may be browsed for entertainment.", "Gift shopping can involve budget limits set by others."] };
    if (shopSessions.length < base.minSample) out.push(insufficient({ ...base, evidence: [`${shopSessions.length} shopping sessions found.`], examples: [] }));
    else {
      const flagged = shopSessions.filter((s) => s.retailers.length >= 2 || s.visits.some((i) => v[i].deal || v[i].priceSignal));
      const multi = shopSessions.filter((s) => s.retailers.length >= 2).length;
      const deals = shopSessions.filter((s) => s.visits.some((i) => v[i].deal)).length;
      const share = flagged.length / shopSessions.length;
      out.push(make({ ...base, position: share, label: band(share, 0.2, 0.5, "Few price-comparison signals", "Moderate price focus", "Strong price focus"),
        evidence: [`${flagged.length} of ${shopSessions.length} shopping sessions (${pct(share)}) show price signals.`, `${multi} sessions compared 2+ retailers; ${deals} included a deal or price-tracking site.`],
        examples: flagged.slice(0, 5).flatMap((s) => s.visits.slice(0, 2).map((i) => v[i].id)) }));
    }
  }

  // 3. Convenience orientation — share of shopping visits on one-stop / fast-delivery platforms
  {
    const DELIVERY = /^(doordash|ubereats|grubhub|instacart|gopuff)\.com$/;
    const ONE_STOP = /^(amazon\.[a-z.]+|walmart\.com|target\.com|costco\.com|samsclub\.com|instacart\.com|doordash\.com|ubereats\.com|grubhub\.com|gopuff\.com)$/;
    const shopVisits = v.filter((x) => x.retailer || DELIVERY.test(x.site));
    const base = { id: "convenience", name: "Convenience orientation", poles: ["Specialist / varied stores", "One-stop & fast delivery"] as [string, string], sample: shopVisits.length, sampleUnit: "retail & delivery visits", minSample: 15,
      method: "Share of retail and delivery visits that go to one-stop or fast-delivery platforms (Amazon, Walmart, Target, Costco, Instacart, DoorDash, Uber Eats, Grubhub, Gopuff).",
      alternatives: ["Large retailers may simply carry what you need.", "Price, not convenience, may drive use of big platforms.", "Household or work purchases may happen on shared accounts."] };
    if (shopVisits.length < base.minSample) out.push(insufficient({ ...base, evidence: [`${shopVisits.length} retail/delivery visits found.`], examples: [] }));
    else {
      const conv = shopVisits.filter((x) => ONE_STOP.test(x.site));
      const share = conv.length / shopVisits.length;
      out.push(make({ ...base, position: share, label: band(share, 0.35, 0.65, "Leans specialist stores", "Mixed", "Leans convenience-first"),
        evidence: [`${conv.length} of ${shopVisits.length} retail/delivery visits (${pct(share)}) were on one-stop or fast-delivery platforms.`],
        examples: conv.slice(0, 6).map((x) => x.id) }));
    }
  }

  // 4. Product research intensity
  {
    const base = { id: "research", name: "Product research intensity", poles: ["Quick decisions", "Extensive research"] as [string, string], sample: shopSessions.length, sampleUnit: "shopping sessions", minSample: 6,
      method: "Share of shopping sessions that include research behaviour: review sites (RTINGS, CNET, Wirecutter, …), review videos/threads, or searches and titles with review / best / vs / compare / specs.",
      alternatives: ["Reading reviews can be entertainment rather than purchase research.", "Research for someone else's purchase looks the same.", "Short sessions may hide research done in other sessions or on other devices."] };
    if (shopSessions.length < base.minSample) out.push(insufficient({ ...base, evidence: [`${shopSessions.length} shopping sessions found.`], examples: [] }));
    else {
      const res = shopSessions.filter((s) => s.visits.some((i) => v[i].review || v[i].researchSignal));
      const share = res.length / shopSessions.length;
      const pages = shopSessions.reduce((s, x) => s + x.visits.length, 0) / shopSessions.length;
      out.push(make({ ...base, position: share, label: band(share, 0.2, 0.45, "Few research signals", "Moderate research", "Research-intensive"),
        evidence: [`${res.length} of ${shopSessions.length} shopping sessions (${pct(share)}) include review or comparison behaviour.`, `${a.shopping.reviewVisits} visits to review sources; average ${pages.toFixed(1)} pages per shopping session.`],
        examples: res.slice(0, 5).flatMap((s) => s.visits.filter((i) => v[i].review || v[i].researchSignal).slice(0, 2).map((i) => v[i].id)) }));
    }
  }

  // 5. Novelty seeking — share of recently active sites first seen recently
  {
    const span = a.counts.first && a.counts.last ? (a.counts.last - a.counts.first) / 86400000 : 0;
    const base = { id: "novelty", name: "Novelty seeking", poles: ["Familiar routines", "Seeks new things"] as [string, string], sample: Math.round(span), sampleUnit: "days of history", minSample: 45,
      method: "Of the sites you visited in your latest 30 days, the share first seen within those 30 days (needs at least 45 days of history). Novelty words (new, launch, preorder, release date) are reported alongside.",
      alternatives: ["Starting a new job, course or project brings many new sites.", "Link-heavy news or social feeds introduce new domains automatically.", "Shorter histories exaggerate novelty."] };
    if (span < base.minSample || !a.counts.last) out.push(insufficient({ ...base, evidence: [`History spans ${Math.round(span)} days.`], examples: [] }));
    else {
      const cut = a.counts.last - 30 * 86400000;
      const recent = a.sites.filter((s) => s.last >= cut);
      const fresh = recent.filter((s) => s.first >= cut);
      const share = recent.length ? fresh.length / recent.length : 0;
      const nov = v.filter((x) => x.noveltySignal).length + a.searches.filter((s) => s.novelty).length;
      out.push(make({ ...base, position: share, label: band(share, 0.2, 0.45, "Leans familiar routines", "Balanced", "Leans novelty-seeking"),
        evidence: [`${fresh.length} of ${recent.length} sites used in the last 30 days (${pct(share)}) were new in that period.`, `${nov} pages or searches contain novelty words.`],
        examples: v.filter((x) => fresh.some((f) => f.site === x.site)).slice(0, 6).map((x) => x.id) }));
    }
  }

  // 6. Premium vs value orientation
  {
    const p = v.filter((x) => x.premiumSignal), val = v.filter((x) => x.valueSignal);
    const n = p.length + val.length;
    const base = { id: "premium", name: "Premium vs. value orientation", poles: ["Value-oriented", "Premium-oriented"] as [string, string], sample: n, sampleUnit: "premium/value signals", minSample: 10,
      method: "Premium signals (visits to premium retailers/brands such as Nordstrom, Apple, Dyson, Lululemon; words like premium, luxury, flagship) divided by premium + value signals (Walmart, Temu, Shein, dollar stores; words like budget, cheapest, dupe).",
      alternatives: ["Browsing premium items is not the same as buying them (aspirational browsing).", "Value retailers are also used for everyday essentials regardless of preference.", "Store lists are illustrative and incomplete."] };
    if (n < base.minSample) out.push(insufficient({ ...base, evidence: [`${n} premium/value signals found.`], examples: [] }));
    else {
      const share = p.length / n;
      out.push(make({ ...base, position: share, label: band(share, 0.35, 0.65, "Leans value", "Mixed", "Leans premium"),
        evidence: [`${p.length} premium signals vs ${val.length} value signals (${pct(share)} premium).`],
        examples: [...p.slice(0, 3), ...val.slice(0, 3)].map((x) => x.id) }));
    }
  }

  // 7. Technology interest
  {
    const n = v.length;
    const base = { id: "tech", name: "Technology interest", poles: ["Low", "High"] as [string, string], sample: n, sampleUnit: "analysed visits", minSample: 100,
      method: "Share of analysed visits in Technology and AI & Developer Tools categories. ≥ 20% reads as high, ≤ 8% as low. Gadget novelty searches are listed as supporting evidence.",
      alternatives: ["Technical work or study raises this share without personal interest.", "Using AI tools for homework counts as technology browsing."] };
    if (n < base.minSample) out.push(insufficient({ ...base, evidence: [`${n} analysed visits.`], examples: [] }));
    else {
      const t = v.filter((x) => x.category === "Technology" || x.category === "AI & Developer Tools");
      const share = t.length / n;
      out.push(make({ ...base, position: Math.min(1, share / 0.4), label: band(share, 0.08, 0.2, "Low technology share", "Moderate technology interest", "High technology interest"),
        evidence: [`${t.length} of ${n} visits (${pct(share)}) are technology or AI/developer sites.`, `Top tech sites: ${a.sites.filter((s) => s.category === "Technology" || s.category === "AI & Developer Tools").slice(0, 4).map((s) => `${s.site} (${s.visits})`).join(", ") || "none"}.`],
        examples: t.slice(0, 6).map((x) => x.id) }));
    }
  }

  // 8. Exploration vs repeat browsing
  {
    const n = v.length;
    const base = { id: "explore", name: "Exploration vs. repeat browsing", poles: ["Repeat favourites", "Explores widely"] as [string, string], sample: n, sampleUnit: "analysed visits", minSample: 200,
      method: "Position = 1 − share of all visits that go to your 10 most-visited sites. Higher means attention spread across more sites.",
      alternatives: ["A few work tools (email, docs) can dominate visits.", "Single-page apps record fewer visits than multi-page sites."] };
    if (n < base.minSample) out.push(insufficient({ ...base, evidence: [`${n} analysed visits.`], examples: [] }));
    else {
      const top10 = a.sites.slice(0, 10).reduce((s, x) => s + x.visits, 0) / n;
      out.push(make({ ...base, position: 1 - top10, label: band(1 - top10, 0.3, 0.55, "Repeats favourite sites", "Balanced", "Explores widely"),
        evidence: [`Your top 10 sites account for ${pct(top10)} of ${n} visits across ${a.sites.length} sites.`, `Top 3: ${a.sites.slice(0, 3).map((s) => `${s.site} (${s.visits})`).join(", ")}.`],
        examples: [] }));
    }
  }

  // 9. Purchase decision style (derived from the traits above; only when its inputs are available)
  {
    const get = (id: string) => out.find((t) => t.id === id);
    const pr = get("price"), re = get("research"), co = get("convenience"), br = get("brand");
    const ready = [pr, re].every((t) => t && t.position != null);
    const base = { id: "style", name: "Purchase decision style", poles: ["", ""] as [string, string], sample: shopSessions.length, sampleUnit: "shopping sessions", minSample: 6,
      method: "Rule-based summary of the other traits: research ≥ 45% and price ≥ 50% → Deliberate deal-seeker; research ≥ 45% → Researcher; price ≥ 50% → Deal hunter; convenience ≥ 65% → Convenience-first; brand HHI ≥ 0.40 → Loyal repeat buyer; otherwise Mixed.",
      alternatives: ["Styles differ by category (e.g. careful with electronics, quick with groceries).", "This summary inherits every limitation of the traits it combines."] };
    if (!ready) out.push(insufficient({ ...base, evidence: ["Needs price-sensitivity and research-intensity evidence first."], examples: [] }));
    else {
      const P = pr!.position!, R = re!.position!, C = co?.position ?? 0, H = br?.position != null ? 1 - br.position : 0;
      const style = R >= 0.45 && P >= 0.5 ? "Deliberate deal-seeker" : R >= 0.45 ? "Researcher" : P >= 0.5 ? "Deal hunter" : C >= 0.65 ? "Convenience-first" : H >= 0.4 ? "Loyal repeat buyer" : "Mixed / no dominant style";
      out.push(make({ ...base, position: null, label: style, evidence: [`Price focus ${pct(P)}, research ${pct(R)}${co?.position != null ? `, convenience ${pct(C)}` : ""}${br?.position != null ? `, brand HHI ${H.toFixed(2)}` : ""}.`], examples: [] }));
    }
  }
  return out;
};

/** Shopping category preferences (observed counts, not an inference). */
export const categoryPreferences = (a: Analysis) => {
  const total = a.productInterests.reduce((s, x) => s + x.count, 0);
  return { total, items: a.productInterests.map((x) => ({ ...x, share: total ? x.count / total : 0 })) };
};
