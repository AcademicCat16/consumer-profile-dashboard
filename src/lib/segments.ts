/**
 * Marketing segments: rule-based, overlapping memberships with stated reasons.
 * A segment is suppressed if it depends on a trait the user rejected as inaccurate.
 */
import type { Analysis } from "./analysis.ts";
import type { Trait } from "./traits.ts";
import type { Feedback } from "./types.ts";

export type Membership = "Strong" | "Moderate" | "Weak" | "Not a member" | "Insufficient data" | "Suppressed by your feedback";
export interface Segment { id: string; name: string; description: string; membership: Membership; reasons: string[]; rule: string; dependsOn: string[]; signals: string[] }

const share = (a: Analysis, ...cats: string[]) => a.categories.filter((c) => cats.includes(c.category)).reduce((s, c) => s + c.share, 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export const computeSegments = (a: Analysis, traits: Trait[], feedback: Record<string, Feedback>): Segment[] => {
  const t = (id: string) => traits.find((x) => x.id === id);
  const enoughVisits = a.counts.analyzedVisits >= 100;
  const level = (x: number, weak: number, mod: number, strong: number): Membership => (x >= strong ? "Strong" : x >= mod ? "Moderate" : x >= weak ? "Weak" : "Not a member");

  const defs: { id: string; name: string; description: string; rule: string; dependsOn: string[]; signals: string[]; eval: () => { m: Membership; reasons: string[] } }[] = [];
  const byShare = (id: string, name: string, description: string, cats: string[], weak: number, mod: number, strong: number) =>
    defs.push({ id, name, description, rule: `Share of analysed visits in ${cats.join(" + ")}: weak ≥ ${pct(weak)}, moderate ≥ ${pct(mod)}, strong ≥ ${pct(strong)}.`, dependsOn: [], signals: cats,
      eval: () => {
        if (!enoughVisits) return { m: "Insufficient data", reasons: [`Needs at least 100 analysed visits (you have ${a.counts.analyzedVisits}).`] };
        const s = share(a, ...cats);
        const top = a.sites.filter((x) => cats.includes(x.category)).slice(0, 3).map((x) => `${x.site} (${x.visits})`);
        return { m: level(s, weak, mod, strong), reasons: [`${pct(s)} of your visits are in ${cats.join(" / ")}.`, ...(top.length ? [`Top sites: ${top.join(", ")}.`] : [])] };
      } });
  const byTrait = (id: string, name: string, description: string, traitId: string, weak: number, mod: number, strong: number, invert = false) =>
    defs.push({ id, name, description, rule: `Based on “${traitId}” trait position${invert ? " (inverted)" : ""}: weak ≥ ${weak}, moderate ≥ ${mod}, strong ≥ ${strong}.`, dependsOn: [traitId], signals: [traitId],
      eval: () => {
        const tr = t(traitId);
        if (!tr || tr.position == null) return { m: "Insufficient data", reasons: [`The ${tr?.name ?? traitId} trait has insufficient data.`] };
        const x = invert ? 1 - tr.position : tr.position;
        return { m: level(x, weak, mod, strong), reasons: [`${tr.name}: ${tr.label}.`, ...tr.evidence.slice(0, 1)] };
      } });

  byShare("tech", "Tech Enthusiast", "Spends notable attention on technology, gadgets and AI tools.", ["Technology", "AI & Developer Tools"], 0.08, 0.15, 0.25);
  byTrait("deal", "Deal Seeker", "Shows price-comparison and deal-hunting behaviour while shopping.", "price", 0.25, 0.4, 0.6);
  byTrait("convenience", "Convenience Shopper", "Gravitates to one-stop and fast-delivery platforms.", "convenience", 0.45, 0.6, 0.75);
  byTrait("loyal", "Brand Loyalist", "Attention concentrates on a few brands.", "brand", 0.5, 0.6, 0.75, true);
  byTrait("variety", "Variety Explorer", "Explores many brands rather than repeating a few.", "brand", 0.8, 0.88, 0.94);
  byTrait("research", "Deliberate Researcher", "Reads reviews and comparisons before buying.", "research", 0.25, 0.45, 0.65);
  byTrait("novelty", "Early Explorer", "Frequently discovers new sites and new releases.", "novelty", 0.3, 0.45, 0.6);
  byTrait("premium", "Premium Seeker", "Leans toward premium retailers and brands.", "premium", 0.55, 0.65, 0.8);
  byShare("travel", "Travel Planner", "Researches trips, flights or accommodation.", ["Travel"], 0.02, 0.05, 0.1);
  byShare("stream", "Entertainment Streamer", "Watches and listens to a lot of streamed content.", ["Entertainment & Video", "Music & Audio"], 0.1, 0.2, 0.35);
  byShare("gamer", "Gamer", "Follows games, platforms and gaming media.", ["Gaming"], 0.03, 0.07, 0.15);
  byShare("home", "Home & Lifestyle", "Interested in home, furniture and living spaces.", ["Home & Living"], 0.02, 0.05, 0.1);
  byShare("style", "Style & Beauty", "Browses fashion, beauty and apparel brands.", ["Fashion & Beauty"], 0.02, 0.05, 0.1);
  byShare("food", "Foodie", "Explores recipes, restaurants and food delivery.", ["Food & Dining"], 0.02, 0.05, 0.1);
  byShare("learner", "Lifelong Learner", "Uses learning platforms and reference material.", ["Education & Learning"], 0.04, 0.08, 0.15);

  return defs.map((d) => {
    const rejected = d.dependsOn.find((id) => feedback[id] === "inaccurate");
    if (rejected) return { id: d.id, name: d.name, description: d.description, rule: d.rule, dependsOn: d.dependsOn, signals: d.signals, membership: "Suppressed by your feedback" as Membership, reasons: [`You marked the “${t(rejected)?.name ?? rejected}” prediction as inaccurate.`] };
    const r = d.eval();
    return { id: d.id, name: d.name, description: d.description, rule: d.rule, dependsOn: d.dependsOn, signals: d.signals, membership: r.m, reasons: r.reasons };
  });
};
