export const meta = {
  name: 'logo-discovery',
  description: 'Find + confirm each Shark Tank company\'s real logo image URL (agent fan-out)',
  phases: [{ title: 'Find', detail: 'one agent per batch: web-search the brand logo, confirm it, return direct image URLs' }],
}

// Hardcoded range (args plumbing proved unreliable). Edit FROM/TO for pilot vs full.
const FROM = 0
const TO = 149
const idxs = []
for (let i = FROM; i < TO; i++) idxs.push(i)
const pad = (i) => String(i).padStart(3, '0')
log(`logo-discovery: batches ${FROM}..${TO - 1} (${idxs.length})`)

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    batch: { type: 'number' },
    total: { type: 'number' },
    found: { type: 'number' },
    none: { type: 'number' },
  },
  required: ['batch', 'total', 'found', 'none'],
}

const prompt = (i) => `You find the OFFICIAL logo image for a batch of Shark Tank companies. Your output is a set of direct, downloadable image URLs another process will fetch and validate.

INPUT: Read \`data/logo-work/batches/batch-${pad(i)}.json\` — a JSON array of products, each: id, company, website, season, episode, industry, desc.

FOR EACH product, find the company's real brand logo:
1. Use WebSearch. Try: "{company} logo png transparent", "{company} brand logo svg", and if a website is given, look there too. For ambiguous names add a disambiguator from desc/industry (e.g. "{company} {industry} Shark Tank").
2. Collect 1-3 DIRECT image URLs (the URL must end in .png/.svg/.jpg/.jpeg/.webp OR be a known logo CDN/asset path). Strongly prefer, in order: (a) Wikimedia Commons \`upload.wikimedia.org/...\` files, (b) the company's own website logo asset or og:image, (c) reputable logo repositories (worldvectorlogo, seeklogo, brandfetch cdn, logo.wine). Prefer transparent PNG or SVG, and the actual wordmark/brand logo over a tiny favicon.
3. CONFIRM it is the RIGHT company by provenance — the page title, file name, alt text, or hosting domain must clearly tie to THIS company (and ideally match the website/industry). Beware same-name companies. Use WebFetch on the source page if unsure.
4. confidence: "high" = official source or clearly-named brand logo file; "medium" = plausible but less certain; if you cannot find a real, on-brand image URL, return an empty candidates list (do NOT invent URLs).

ABSOLUTE RULES:
- Only return URLs you actually saw in real search results / on real pages. NEVER fabricate or guess an image URL or file path.
- A wrong-company logo is worse than none. When unsure, leave candidates empty.
- Order candidates best-first (the process tries them in order until one downloads as a valid image).

OUTPUT: Use Bash \`mkdir -p data/logo-work/out\`, then Write \`data/logo-work/out/found-${pad(i)}.json\` — a JSON array, ONE object per input product (same order):
{ "id": "<id>", "company": "<company>", "candidates": ["<url1>", "<url2>"], "source": "<wikimedia|site|repository|other>", "confidence": "high|medium|none", "reason": "<one short sentence>" }
(candidates = [] when nothing good found.)

Then return the structured summary { batch: ${i}, total, found, none } where found = products with >=1 candidate.`

const results = await pipeline(
  idxs,
  (i) => agent(prompt(i), { label: `logo:b${pad(i)}`, phase: 'Find', schema: SCHEMA })
)

const ok = results.filter(Boolean)
const found = ok.reduce((s, r) => s + (r.found || 0), 0)
const none = ok.reduce((s, r) => s + (r.none || 0), 0)
log(`done: ${ok.length}/${idxs.length} batches; ${found} with candidates, ${none} empty`)
return { batchesDone: ok.length, totalBatches: idxs.length, withCandidates: found, empty: none }
