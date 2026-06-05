export const meta = {
  name: 'yt-audit',
  description: 'Independent adversarial re-check of a sample of kept YouTube links (FP estimate)',
  phases: [{ title: 'Audit', detail: 'one skeptic per link: confirm real video matches the company' }],
}

const N = 53 // sample.json length, hardcoded (args plumbing unreliable)
const idxs = []
for (let i = 0; i < N; i++) idxs.push(i)

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    idx: { type: 'number' },
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['correct', 'wrong', 'uncertain'] },
    realTitle: { type: 'string' },
    channel: { type: 'string' },
    evidence: { type: 'string' },
  },
  required: ['idx', 'id', 'verdict', 'realTitle', 'channel', 'evidence'],
}

const prompt = (i) => `You are an INDEPENDENT, skeptical auditor. Decide whether a single YouTube link is genuinely the correct Shark Tank video for a given company. Try to REFUTE it; default to "wrong"/"uncertain" if you cannot positively confirm.

INPUT: Read \`data/yt-work/sample.json\` (a JSON array). Use ONLY element at index ${i} (0-based). It has: id, company, season, episode, url, confidence, title.

STEPS (do all):
1. Determine the REAL title + channel of the video. Use the WebFetch tool on \`https://www.youtube.com/oembed?url=<the url>&format=json\` — it returns JSON {title, author_name} for a live video, or an error/404 if the video is dead/removed. Record realTitle and channel (author_name).
2. Cross-check with a WebSearch for the company + "Shark Tank" to learn what the company is and which season/episode it pitched.
3. Judge:
   - "correct" = the real video title/channel clearly corresponds to THIS company AND Shark Tank (official Shark Tank clip naming the company, or unmistakably this company's Shark Tank segment). Season/episode should be consistent if determinable.
   - "wrong" = the video is a different company, a different show, a generic promo with no Shark Tank pitch, a post-show interview/audition tape rather than the aired segment, or the video is dead/404.
   - "uncertain" = you genuinely cannot confirm either way.

OUTPUT: Use the Bash tool to \`mkdir -p data/yt-work/audit\`, then Write \`data/yt-work/audit/verdict-${String(i).padStart(2, '0')}.json\` with your finding. Then return the structured object { idx: ${i}, id, verdict, realTitle, channel, evidence } (evidence = one sentence citing the real title/channel).`

const results = await parallel(idxs.map((i) => () =>
  agent(prompt(i), { label: `audit:${String(i).padStart(2, '0')}`, phase: 'Audit', schema: SCHEMA })))

const ok = results.filter(Boolean)
const by = (v) => ok.filter((r) => r.verdict === v)
log(`audit: correct ${by('correct').length}, wrong ${by('wrong').length}, uncertain ${by('uncertain').length} (of ${ok.length})`)
return {
  total: ok.length,
  correct: by('correct').length,
  wrong: by('wrong').length,
  uncertain: by('uncertain').length,
  wrongIds: by('wrong').map((r) => ({ id: r.id, realTitle: r.realTitle, evidence: r.evidence })),
  uncertainIds: by('uncertain').map((r) => ({ id: r.id, evidence: r.evidence })),
}
