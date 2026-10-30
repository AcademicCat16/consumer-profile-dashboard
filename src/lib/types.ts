/** Record types. All records come from the user's own imports; nothing is generated. */

export type SourceKind = "chrome-extension" | "chrome-export" | "takeout-history" | "takeout-activity" | "csv-history" | "chatgpt" | "purchases" | "products";

export interface Source {
  id: string;
  kind: SourceKind;
  label: string; // e.g. file name or "Chrome (extension)"
  importedAt: number;
  counts: Record<string, number>;
}

export interface Visit {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  time: number; // ms epoch
  transition?: string;
}

export interface SearchEvent {
  id: string;
  sourceId: string;
  engine: string;
  query: string;
  time: number;
  url?: string;
}

export interface Conversation {
  id: string;
  sourceId: string;
  title: string;
  time: number;
  userText: string; // only the user's own messages, concatenated
  messageCount: number;
}

export interface Purchase {
  id: string;
  sourceId: string;
  time: number;
  product: string;
  price: number | null;
  currency: string | null;
  store: string;
  category: string | null;
}

export interface Product {
  id: string;
  sourceId: string;
  name: string;
  url: string;
  image: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  brand: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  retailer: string;
  capturedAt: string | null;
  evidence: "json-ld" | "opengraph" | "catalog-import";
}

export interface Dataset {
  visits: Visit[];
  searches: SearchEvent[];
  conversations: Conversation[];
  purchases: Purchase[];
  products: Product[];
}

export const emptyDataset = (): Dataset => ({ visits: [], searches: [], conversations: [], purchases: [], products: [] });

export type Feedback = "accurate" | "inaccurate" | "uncertain";
