/**
 * Ranks ACTUAL products the user captured or imported (never invented) by fit with observed behaviour.
 * The match index (0–100) is a transparent weighted sum of factors shown to the user; it is not a probability.
 * Factors tied to a trait the user rejected get zero weight; "uncertain" halves the weight.
 */
import type { Analysis } from "./analysis.ts";
import type { Trait } from "./traits.ts";
import type { Feedback, Product } from "./types.ts";
import { detectBrands, productCategoryOf } from "./taxonomy.ts";

export interface Factor { name: string; score: number; weight: number; explanation: string }
export interface Ranked { product: Product; index: number; factors: Factor[]; category: string | null; brands: string[] }

const fbWeight = (f: Feedback | undefined) => (f === "inaccurate" ? 0 : f === "uncertain" ? 0.5 : 1);

export const rankProducts = (products: Product[], a: Analysis, traits: Trait[], feedback: Record<string, Feedback>): Ranked[] => {
  const catTotal = Math.max(1, ...a.productInterests.map((x) => x.count));
  const brandTotal = Math.max(1, ...a.brands.map((x) => x.count));
  const prices = products.map((p) => p.price).filter((x): x is number => x != null).sort((x, y) => x - y);
  const pctile = (x: number) => (prices.length > 1 ? prices.filter((p) => p < x).length / (prices.length - 1) : 0.5);
  const tr = (id: string) => traits.find((t) => t.id === id);
  const price = tr("price"), premium = tr("premium"), research = tr("research");

  return products.map((p) => {
    const text = `${p.name} ${p.category ?? ""}`;
    const category = productCategoryOf(text) ?? (p.category || null);
    const brands = p.brand ? [p.brand, ...detectBrands(p.name).filter((b) => b.toLowerCase() !== p.brand!.toLowerCase())] : detectBrands(p.name);
    const factors: Factor[] = [];

    const ci = category ? a.productInterests.find((x) => x.name === category) : undefined;
    factors.push({ name: "Category interest", weight: 0.4, score: ci ? ci.count / catTotal : 0,
      explanation: ci ? `You showed interest in ${category} ${ci.count} time(s) in your browsing, searches or purchases.` : category ? `No observed interest in ${category}.` : "Product category not recognised." });

    const bi = a.brands.find((x) => brands.some((b) => b.toLowerCase() === x.name.toLowerCase()));
    factors.push({ name: "Brand familiarity", weight: 0.25 * fbWeight(feedback.brand), score: bi ? bi.count / brandTotal : 0,
      explanation: bi ? `${bi.name} appears ${bi.count} time(s) in your records.` : brands.length ? `No observed engagement with ${brands[0]}.` : "No brand detected." });

    if (p.price != null && prices.length > 1) {
      const q = pctile(p.price);
      if (price?.position != null && price.position >= 0.4) factors.push({ name: "Price fit (price-focused)", weight: 0.25 * fbWeight(feedback.price), score: 1 - q, explanation: `You show price focus (${price.label.toLowerCase()}); this is ${q < 0.34 ? "among the cheaper" : q > 0.66 ? "among the pricier" : "mid-priced among the"} captured products.` });
      else if (premium?.position != null && premium.position >= 0.6) factors.push({ name: "Price fit (premium-leaning)", weight: 0.2 * fbWeight(feedback.premium), score: q, explanation: `You lean premium; this is ${q > 0.66 ? "among the higher-priced" : "not among the higher-priced"} captured products.` });
      else factors.push({ name: "Price fit", weight: 0.1, score: 0.5, explanation: "No clear price orientation in your data, so price is neutral." });
    } else factors.push({ name: "Price fit", weight: 0, score: 0, explanation: p.price == null ? "No verified price on the captured page." : "Only one product with a price, so prices cannot be compared." });

    if (research?.position != null && research.position >= 0.3 && p.rating != null) factors.push({ name: "Ratings (research-minded)", weight: 0.15 * fbWeight(feedback.research), score: Math.min(1, p.rating / 5), explanation: `You research before buying; this page published a ${p.rating}/5 rating${p.reviewCount ? ` from ${p.reviewCount} reviews` : ""}.` });

    const wsum = factors.reduce((s, f) => s + f.weight, 0) || 1;
    const index = Math.round((factors.reduce((s, f) => s + f.weight * f.score, 0) / wsum) * 100);
    return { product: p, index, factors, category, brands };
  }).sort((x, y) => y.index - x.index);
};
