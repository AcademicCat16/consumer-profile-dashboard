/**
 * Public reference taxonomy (no personal data). Used to classify the user's own records locally.
 * Sensitive topics are EXCLUDED from all profiling: health/medical, politics, religion, sexuality/adult, dating.
 */

export const CATEGORIES = [
  "Shopping", "Technology", "AI & Developer Tools", "Entertainment & Video", "Music & Audio", "Gaming", "Travel", "News & Media",
  "Social & Community", "Education & Learning", "Productivity & Work", "Food & Dining", "Fashion & Beauty", "Home & Living",
  "Sports & Fitness", "Automotive", "Personal Finance", "Search & Reference",
] as const;
export type Category = (typeof CATEGORIES)[number] | "Other";

export const CATEGORY_COLORS: Record<string, string> = {
  Shopping: "#f472b6", Technology: "#60a5fa", "AI & Developer Tools": "#22d3ee", "Entertainment & Video": "#a78bfa", "Music & Audio": "#c084fc",
  Gaming: "#818cf8", Travel: "#34d399", "News & Media": "#94a3b8", "Social & Community": "#fb923c", "Education & Learning": "#facc15",
  "Productivity & Work": "#5eead4", "Food & Dining": "#fbbf24", "Fashion & Beauty": "#f9a8d4", "Home & Living": "#86efac", "Sports & Fitness": "#4ade80",
  Automotive: "#fca5a5", "Personal Finance": "#93c5fd", "Search & Reference": "#cbd5e1", Other: "#64748b",
};

const D: Record<string, Category> = {};
const add = (cat: Category, domains: string) => domains.split(/\s+/).filter(Boolean).forEach((d) => (D[d] = cat));
add("Shopping", "amazon.com amazon.co.uk walmart.com target.com bestbuy.com ebay.com etsy.com costco.com homedepot.com lowes.com wayfair.com temu.com shein.com aliexpress.com newegg.com bhphotovideo.com macys.com nordstrom.com kohls.com chewy.com zappos.com overstock.com samsclub.com qvc.com wish.com rakuten.com slickdeals.net camelcamelcamel.com retailmenot.com dealnews.com keepa.com joinhoney.com shopify.com poshmark.com mercari.com depop.com stockx.com goat.com instacart.com gopuff.com bjs.com dollartree.com dollargeneral.com fivebelow.com tjmaxx.com marshalls.com")
add("Technology", "apple.com samsung.com theverge.com engadget.com cnet.com tomsguide.com techradar.com rtings.com gsmarena.com arstechnica.com wired.com anandtech.com tomshardware.com macrumors.com 9to5mac.com 9to5google.com androidauthority.com dell.com hp.com lenovo.com microsoft.com logitech.com sony.com lg.com asus.com nvidia.com amd.com intel.com bose.com dyson.com garmin.com fitbit.com")
add("AI & Developer Tools", "chatgpt.com openai.com claude.ai anthropic.com gemini.google.com perplexity.ai huggingface.co github.com gitlab.com stackoverflow.com npmjs.com vercel.com netlify.com replit.com codepen.io developer.mozilla.org midjourney.com copilot.microsoft.com")
add("Entertainment & Video", "youtube.com netflix.com hulu.com disneyplus.com max.com hbomax.com primevideo.com tv.apple.com peacocktv.com paramountplus.com crunchyroll.com twitch.tv imdb.com rottentomatoes.com letterboxd.com tiktok.com vimeo.com fandango.com")
add("Music & Audio", "spotify.com open.spotify.com music.apple.com soundcloud.com pandora.com bandcamp.com genius.com audible.com podcasts.apple.com tidal.com")
add("Gaming", "store.steampowered.com steampowered.com steamcommunity.com epicgames.com nintendo.com playstation.com xbox.com ign.com gamespot.com polygon.com kotaku.com roblox.com minecraft.net chess.com itch.io")
add("Travel", "booking.com expedia.com airbnb.com tripadvisor.com kayak.com hotels.com skyscanner.com southwest.com delta.com united.com aa.com jetblue.com marriott.com hilton.com hyatt.com vrbo.com priceline.com lonelyplanet.com amtrak.com uber.com lyft.com")
add("News & Media", "nytimes.com cnn.com bbc.com bbc.co.uk theguardian.com washingtonpost.com reuters.com apnews.com wsj.com bloomberg.com npr.org forbes.com businessinsider.com axios.com usatoday.com medium.com substack.com")
add("Social & Community", "facebook.com instagram.com x.com twitter.com reddit.com linkedin.com pinterest.com threads.net discord.com snapchat.com tumblr.com quora.com whatsapp.com web.whatsapp.com messenger.com bsky.app nextdoor.com")
add("Education & Learning", "coursera.org edx.org khanacademy.org udemy.com duolingo.com wikipedia.org en.wikipedia.org quizlet.com brainly.com chegg.com scholar.google.com jstor.org canvas.instructure.com blackboard.com classroom.google.com britannica.com ted.com skillshare.com masterclass.com")
add("Productivity & Work", "mail.google.com gmail.com outlook.com outlook.live.com office.com docs.google.com drive.google.com calendar.google.com notion.so trello.com asana.com slack.com zoom.us teams.microsoft.com dropbox.com figma.com canva.com miro.com airtable.com monday.com evernote.com onedrive.live.com")
add("Food & Dining", "doordash.com ubereats.com grubhub.com yelp.com opentable.com allrecipes.com seriouseats.com bonappetit.com foodnetwork.com nytcooking.com cooking.nytimes.com starbucks.com chipotle.com mcdonalds.com hellofresh.com tasty.co")
add("Fashion & Beauty", "sephora.com ulta.com zara.com hm.com uniqlo.com nike.com adidas.com lululemon.com gap.com oldnavy.com asos.com revolve.com farfetch.com ssense.com glossier.com fentybeauty.com patagonia.com thenorthface.com urbanoutfitters.com anthropologie.com abercrombie.com everlane.com")
add("Home & Living", "ikea.com crateandbarrel.com potterybarn.com westelm.com cb2.com houzz.com zillow.com redfin.com realtor.com apartments.com thespruce.com hgtv.com containerstore.com")
add("Sports & Fitness", "espn.com strava.com nba.com nfl.com mlb.com nhl.com fifa.com bleacherreport.com peloton.com dickssportinggoods.com rei.com myfitnesspal.com theathletic.com")
add("Automotive", "cars.com carmax.com autotrader.com edmunds.com kbb.com tesla.com toyota.com honda.com ford.com carvana.com caranddriver.com motortrend.com")
add("Personal Finance", "paypal.com venmo.com chase.com bankofamerica.com wellsfargo.com capitalone.com americanexpress.com discover.com mint.intuit.com creditkarma.com nerdwallet.com robinhood.com fidelity.com vanguard.com schwab.com coinbase.com")
add("Search & Reference", "google.com bing.com duckduckgo.com yahoo.com search.yahoo.com ecosia.org maps.google.com translate.google.com weather.com")

export const RETAILERS = new Set("amazon.com walmart.com target.com bestbuy.com ebay.com etsy.com costco.com homedepot.com lowes.com wayfair.com temu.com shein.com aliexpress.com newegg.com bhphotovideo.com macys.com nordstrom.com kohls.com chewy.com zappos.com overstock.com samsclub.com sephora.com ulta.com ikea.com rei.com dickssportinggoods.com apple.com nike.com adidas.com zara.com hm.com uniqlo.com lululemon.com crateandbarrel.com westelm.com potterybarn.com poshmark.com mercari.com stockx.com instacart.com tjmaxx.com fivebelow.com dollartree.com".split(" "));
export const DEAL_SITES = new Set("slickdeals.net camelcamelcamel.com retailmenot.com dealnews.com keepa.com joinhoney.com rakuten.com coupons.com groupon.com honey.com".split(" "));
export const REVIEW_SITES = new Set("rtings.com consumerreports.org cnet.com tomsguide.com techradar.com trustpilot.com wirecutter.com theverge.com engadget.com gsmarena.com tomshardware.com".split(" "));
export const CONVENIENCE_SITES = new Set("amazon.com walmart.com target.com instacart.com doordash.com ubereats.com grubhub.com gopuff.com costco.com samsclub.com".split(" "));
export const VALUE_SITES = new Set("walmart.com temu.com shein.com aliexpress.com wish.com dollartree.com dollargeneral.com fivebelow.com tjmaxx.com marshalls.com oldnavy.com costco.com samsclub.com".split(" "));
export const PREMIUM_SITES = new Set("nordstrom.com apple.com farfetch.com ssense.com revolve.com lululemon.com patagonia.com dyson.com bose.com crateandbarrel.com potterybarn.com westelm.com sephora.com tesla.com".split(" "));

export const BRANDS: { name: string; tokens: RegExp }[] = [
  ["Apple", /\b(apple|iphone|ipad|macbook|airpods|apple watch|imac)\b/i], ["Samsung", /\b(samsung|galaxy s\d|galaxy tab)\b/i], ["Google", /\b(pixel \d|pixel phone|nest hub|chromecast)\b/i],
  ["Sony", /\b(sony|playstation|ps5)\b/i], ["Microsoft", /\b(microsoft|surface pro|xbox)\b/i], ["Nintendo", /\b(nintendo|switch 2|switch oled)\b/i], ["Dell", /\b(dell|alienware|xps)\b/i],
  ["HP", /\bhp (laptop|envy|spectre|pavilion|omen)\b/i], ["Lenovo", /\b(lenovo|thinkpad|legion)\b/i], ["Asus", /\b(asus|rog strix|zenbook)\b/i], ["Bose", /\bbose\b/i], ["Logitech", /\blogitech\b/i],
  ["Dyson", /\bdyson\b/i], ["Garmin", /\bgarmin\b/i], ["Canon", /\bcanon\b/i], ["Nikon", /\bnikon\b/i], ["GoPro", /\bgopro\b/i], ["LG", /\blg (tv|oled|monitor|gram)\b/i],
  ["Nike", /\bnike\b/i], ["Adidas", /\badidas\b/i], ["Lululemon", /\blululemon\b/i], ["Patagonia", /\bpatagonia\b/i], ["The North Face", /\bnorth face\b/i], ["Uniqlo", /\buniqlo\b/i],
  ["Zara", /\bzara\b/i], ["H&M", /\bh&m\b/i], ["New Balance", /\bnew balance\b/i], ["Hoka", /\bhoka\b/i], ["IKEA", /\bikea\b/i], ["LEGO", /\blego\b/i], ["Stanley", /\bstanley (cup|quencher|tumbler)\b/i],
  ["Sephora", /\bsephora\b/i], ["Glossier", /\bglossier\b/i], ["CeraVe", /\bcerave\b/i], ["Tesla", /\btesla\b/i], ["Toyota", /\btoyota\b/i], ["Honda", /\bhonda\b/i], ["Starbucks", /\bstarbucks\b/i],
  ["Kindle", /\bkindle\b/i], ["Anker", /\banker\b/i], ["JBL", /\bjbl\b/i], ["Beats", /\bbeats (studio|solo|fit|pill)\b/i], ["Instant Pot", /\binstant pot\b/i], ["KitchenAid", /\bkitchenaid\b/i],
].map(([name, tokens]) => ({ name: name as string, tokens: tokens as RegExp }));

export const PRODUCT_CATEGORIES: { name: string; re: RegExp }[] = [
  ["Electronics & Gadgets", /\b(laptop|notebook|phone|smartphone|headphones?|earbuds|airpods|tv|television|monitor|camera|tablet|ipad|charger|keyboard|mouse|speaker|smartwatch|router|ssd|gpu|graphics card|console)\b/i],
  ["Apparel & Shoes", /\b(shirt|t-shirt|dress|shoes?|sneakers?|jacket|jeans|hoodie|coat|boots?|leggings|sweater|pants|shorts|skirt)\b/i],
  ["Beauty & Personal Care", /\b(skincare|makeup|serum|moisturi[sz]er|lipstick|fragrance|perfume|shampoo|sunscreen|cleanser|mascara)\b/i],
  ["Home & Kitchen", /\b(sofa|couch|mattress|kitchen|vacuum|decor|lamp|rug|blender|air fryer|cookware|bedding|desk|chair|shelf|organizer)\b/i],
  ["Books & Media", /\b(book|novel|kindle|paperback|hardcover|audiobook|vinyl|blu-?ray)\b/i],
  ["Toys & Games", /\b(lego|toy|board game|puzzle|action figure|video game)\b/i],
  ["Sports & Outdoors", /\b(yoga|bike|bicycle|running|gym|dumbbell|tent|hiking|camping|golf|tennis|treadmill)\b/i],
  ["Grocery & Food", /\b(snack|coffee|grocery|tea|protein|cereal|chocolate|recipe)\b/i],
  ["Pets", /\b(dog food|cat food|pet|leash|litter)\b/i],
  ["Travel Gear", /\b(luggage|suitcase|backpack|carry-?on|travel bag|packing cubes)\b/i],
  ["Jewelry & Accessories", /\b(watch|jewel(le)?ry|necklace|earrings?|bracelet|ring|sunglasses|wallet|handbag|purse)\b/i],
].map(([name, re]) => ({ name: name as string, re: re as RegExp }));

/** Sensitive topics: records matching these are excluded from every inference. */
const SENSITIVE_DOMAINS = /(webmd|mayoclinic|healthline|medlineplus|nih\.gov|cdc\.gov|drugs\.com|goodrx|zocdoc|teladoc|planned\s?parenthood|plannedparenthood|psychologytoday|betterhelp|talkspace|patient\.|mychart|clevelandclinic|hopkinsmedicine|democrats\.org|gop\.com|actblue|winred|church|bible|quran|torah|jw\.org|lds\.org|pornhub|xvideos|onlyfans|grindr|tinder|bumble|hinge\.co|okcupid|match\.com|scruff|her\.app)/i;
const SENSITIVE_TERMS = /\b(symptoms?|diagnos\w*|disease|cancer|diabetes|depress\w*|anxiety|therapy|therapist|prescription|medication|pregnan\w*|std|hiv|clinic|hospital|surgery|abortion|vote|election|candidate|democrat|republican|liberal|conservative|senator|congress|church|mosque|synagogue|temple|bible|prayer|religio\w*|gay|lesbian|transgender|sexual\w*|porn\w*|dating app|hookup)\b/i;

export const isSensitive = (domain: string, text: string) => SENSITIVE_DOMAINS.test(domain) || SENSITIVE_TERMS.test(text);

/** Pages that carry no consumer signal (browser internals, sign-in pages, this dashboard). */
export const isNoise = (url: string, domain: string) =>
  !/^https?:/i.test(url) || /^(localhost|127\.0\.0\.1)$/.test(domain) || /(^|\.)accounts\.google\.com$|^login\.|^auth\.|^signin\./.test(domain) || /academiccat16\.github\.io/.test(domain) || /\/(login|signin|oauth|sso)\b/i.test(url);

export const domainOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};
/** Registrable-ish site key: keeps known multi-part keys (open.spotify.com → spotify.com unless listed). */
export const siteOf = (domain: string) => {
  if (D[domain]) return domain;
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) { const d = parts.slice(i).join("."); if (D[d]) return d; }
  return parts.slice(-2).join(".");
};

const TITLE_RULES: { cat: Category; re: RegExp }[] = [
  { cat: "Travel", re: /\b(flight|flights|hotel|resort|itinerary|vacation|airport|trip to|things to do in|airbnb)\b/i },
  { cat: "Food & Dining", re: /\b(recipe|restaurant|menu|delivery|takeout|cafe)\b/i },
  { cat: "Technology", re: /\b(review|specs|unboxing|vs\.?|benchmark)\b.*\b(phone|laptop|camera|headphones|gpu|tablet)\b/i },
  { cat: "Shopping", re: /\b(buy|price|deal|sale|coupon|discount|add to cart|free shipping)\b/i },
  { cat: "Gaming", re: /\b(walkthrough|patch notes|gameplay|speedrun)\b/i },
];

export const categorize = (domain: string, title: string): Category => {
  const site = siteOf(domain);
  if (D[domain]) return D[domain];
  if (D[site]) return D[site];
  for (const r of TITLE_RULES) if (r.re.test(title)) return r.cat;
  return "Other";
};

export const detectBrands = (text: string) => BRANDS.filter((b) => b.tokens.test(text)).map((b) => b.name);
export const productCategoryOf = (text: string) => PRODUCT_CATEGORIES.find((c) => c.re.test(text))?.name ?? null;

/** Search engines and retailer search pages whose query parameter reveals a search. */
export const SEARCH_PARAMS: { host: RegExp; param: string; engine: string }[] = [
  { host: /(^|\.)google\.[a-z.]+$/, param: "q", engine: "Google" }, { host: /(^|\.)bing\.com$/, param: "q", engine: "Bing" },
  { host: /(^|\.)duckduckgo\.com$/, param: "q", engine: "DuckDuckGo" }, { host: /(^|\.)search\.yahoo\.com$/, param: "p", engine: "Yahoo" },
  { host: /(^|\.)youtube\.com$/, param: "search_query", engine: "YouTube" }, { host: /(^|\.)amazon\.[a-z.]+$/, param: "k", engine: "Amazon" },
  { host: /(^|\.)walmart\.com$/, param: "q", engine: "Walmart" }, { host: /(^|\.)target\.com$/, param: "searchTerm", engine: "Target" },
  { host: /(^|\.)ebay\.com$/, param: "_nkw", engine: "eBay" }, { host: /(^|\.)bestbuy\.com$/, param: "st", engine: "Best Buy" },
  { host: /(^|\.)etsy\.com$/, param: "q", engine: "Etsy" }, { host: /(^|\.)reddit\.com$/, param: "q", engine: "Reddit" },
];
export const PRICE_TERMS = /\b(cheap|cheapest|best price|price|deal|deals|discount|coupon|promo code|sale|under \$?\d+|budget|vs\.?|compare|comparison)\b/i;
export const RESEARCH_TERMS = /\b(review|reviews|best|vs\.?|compare|comparison|worth it|specs|rating|top \d+)\b/i;
export const NOVELTY_TERMS = /\b(new|launch|release date|preorder|pre-order|announced|upcoming|beta|first look|202[5-9])\b/i;
export const PREMIUM_TERMS = /\b(premium|luxury|designer|pro max|ultra|flagship|high-end)\b/i;
export const VALUE_TERMS = /\b(cheap|cheapest|budget|affordable|bargain|clearance|dupe|generic|value)\b/i;

export const STOPWORDS = new Set("the a an and or of for to in on at with by from is are was be how what why when where who which best vs near me my your you i it this that can do does new 2025 2026 top review reviews price buy".split(" "));
