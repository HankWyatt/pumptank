export const meta = {
  name: 'yt-discovery',
  description: 'Find + verify Shark Tank YouTube pitch clips for products missing a link (agent fan-out)',
  phases: [
    { title: 'Search', detail: 'one agent per batch: web-search + confirm the right clip' },
    { title: 'Verify', detail: 'independent skeptic re-checks each found link' },
  ],
}

// args: { from?: number, to?: number }  -> process batch indices [from, to)
const FROM = (args && Number.isInteger(args.from)) ? args.from : 0
const TO = (args && Number.isInteger(args.to)) ? args.to : 144
const indices = []
for (let i = FROM; i < TO; i++) indices.push(i)
const pad = (i) => String(i).padStart(3, '0')

log(`yt-discovery: batches ${FROM}..${TO - 1} (${indices.length} batches)`)

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    batch: { type: 'number' },
    total: { type: 'number' },
    found: { type: 'number' },
    notFound: { type: 'number' },
  },
  required: ['batch', 'total', 'found', 'notFound'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    batch: { type: 'number' },
    checked: { type: 'number' },
    kept: { type: 'number' },
    rejected: { type: 'number' },
  },
  required: ['batch', 'checked', 'kept', 'rejected'],
}

const searchPrompt = (i) => `You are finding the official Shark Tank pitch clip on YouTube for a batch of Shark Tank companies.

INPUT: Read the file \`data/yt-work/batches/batch-${pad(i)}.json\` — a JSON array of products, each with: id, company, season, episode, industry, founders, desc.

FOR EACH product, find the YouTube video of that company's Shark Tank pitch segment:
1. Use the WebSearch tool. Try queries like: "Shark Tank {company} season {season} episode {episode}", "{company} Shark Tank pitch", and "{company} {desc keywords} Shark Tank YouTube". Run 1-3 searches as needed.
2. From the ACTUAL search results, pick a youtube.com/watch (or youtu.be) URL whose title/snippet clearly refers to THIS company AND to Shark Tank. Strongly prefer the official "Shark Tank Global" / "Shark Tank" / ABC / Sony Pictures Television channel clip of the pitch. The company's own "our Shark Tank appearance" video is acceptable. A generic company promo that does NOT mention Shark Tank is NOT acceptable.
3. Confidence: "high" = a real result whose title explicitly names the company AND Shark Tank (or is on an official Shark Tank channel); "medium" = strongly implied by title+snippet+channel; otherwise leave the link null (do NOT guess).

ABSOLUTE RULES:
- NEVER invent, construct, or guess a video ID. Only use a URL that appears VERBATIM in real WebSearch results. If no suitable real result exists, set youtube_url to null.
- Wrong links are far worse than missing links. When unsure, leave it null.
- Match the right company AND ideally the right season/episode. Beware same-name companies from other shows or other seasons.

OUTPUT: Write \`data/yt-work/out/found-${pad(i)}.json\` — a JSON array with ONE object per input product, in the same order, each:
{ "id": "<id>", "company": "<company>", "youtube_url": "<watch url or null>", "confidence": "high|medium|none", "title": "<the video title you matched, or empty>", "query": "<the search query that found it>", "reason": "<one short sentence>" }

Use the Write tool to create that file (create the data/yt-work/out/ dir if needed via Bash mkdir -p). Then return the structured summary { batch: ${i}, total, found, notFound } where found = count with a non-null youtube_url.`

const verifyPrompt = (i) => `You are an independent, SKEPTICAL verifier of YouTube links proposed for Shark Tank companies. Your job is to REJECT any link that is not clearly correct.

INPUT: Read \`data/yt-work/out/found-${pad(i)}.json\` (array of {id, company, youtube_url, confidence, title, ...}). Only entries with a non-null youtube_url need checking; entries already null pass through as null.

FOR EACH entry that has a youtube_url:
1. Independently confirm the video really is THIS company's Shark Tank appearance. Use WebSearch on the company + Shark Tank, and/or WebFetch the youtube URL to read its real title/channel.
2. Keep it ONLY if the video's real title/channel clearly corresponds to this company AND Shark Tank. Reject if: the title doesn't match the company, it's the wrong show/season, it's a generic promo with no Shark Tank reference, the URL doesn't resolve, or you cannot confirm. Default to REJECT when uncertain.

OUTPUT: Write \`data/yt-work/out/verified-${pad(i)}.json\` — a JSON array with ONE object per input entry (same order):
{ "id": "<id>", "youtube_url": "<url kept, or null if rejected/originally null>", "verdict": "keep|reject|na", "reason": "<one short sentence>" }
("na" = was already null in input.) Use Write (mkdir -p the dir if needed).

Then return the structured summary { batch: ${i}, checked, kept, rejected } where checked = entries that had a url, kept = verdict keep, rejected = verdict reject.`

const results = await pipeline(
  indices,
  (i) => agent(searchPrompt(i), { label: `search:b${pad(i)}`, phase: 'Search', schema: SEARCH_SCHEMA }),
  (search, i) => agent(verifyPrompt(i), { label: `verify:b${pad(i)}`, phase: 'Verify', schema: VERIFY_SCHEMA })
)

const ok = results.filter(Boolean)
const totalKept = ok.reduce((s, r) => s + (r.kept || 0), 0)
const totalRejected = ok.reduce((s, r) => s + (r.rejected || 0), 0)
log(`done: ${ok.length}/${indices.length} batches verified; ${totalKept} links kept, ${totalRejected} rejected`)
return { batchesDone: ok.length, totalBatches: indices.length, totalKept, totalRejected }
