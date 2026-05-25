# Token Images (branded card) — Design Spec

**Date:** 2026-05-24
**Status:** Draft for review (agent-review fixes applied)
**Sub-project:** 2b (image half of sub-project 2 — token assets). Text = 2a (done).

---

## Project context (PUMPTANK)

Each of the 100 selected no-deal pitches (`include == true`) needs a pump.fun token
image. The dataset has **no images**, and putting a real company's logo on an
*unaffiliated* token is the project's biggest trademark/copyright exposure — so we
generate a **branded PUMPTANK card** per token from our own design (decided in
brainstorming). This is the safest IP posture: every pixel is our creative work; the only
third-party text is the product name (a fact, already used in 2a) plus the public
"got no deal" fact. The card visually embeds the tribute/parody + not-affiliated +
not-financial-advice disclaimers.

This spec covers **image generation only**. IPFS upload and the real pump.fun create call
are #3; 2a (name/ticker/description) is done.

## Goal

Render a deterministic **1000×1000 PNG** branded card for every selected token and record
it on the record: `media.image_url` = the file path, `media.image_source = "generated"`.

**Done means:** running the pipeline writes one PNG per selected token to
`data/token_images/`, sets `media.image_url`/`image_source` on those records, leaves
non-selected records' media untouched, and the run is reproducible (same inputs → same
images). A sample was rendered during design and approved.

## Non-goals

- Scraping real logos or AI-generated imagery (rejected on IP/cost grounds).
- IPFS upload / pinning and the pump.fun create call (#3).
- The hub `$PUMPTANK` token's own art (handled separately).
- Animation, multiple sizes, or social-share variants.

## Inputs (per selected record)

`token.name`, `token.symbol` (from 2a), `season`, `episode`, `industry`. Plus a
**vendored font** (below). No network, no dataset images.

## The card (reference design — matches the approved sample)

- **Canvas:** 1000×1000 PNG, RGB.
- **Palette:** background `#0B2027`; accent `#33D6B1`; corner "fin" `#102E36`;
  primary text `#F0F5F6`; muted text `#8CA1A6`. (All in config.)
- **Layout (top → bottom):**
  - `P U M P T A N K` letter-spaced wordmark, top-left, accent color.
  - `NO DEAL` badge, top-right: rounded-rectangle outline + accent text.
  - **Product name** (`token.name`), centered, bold, white — **auto-fit**: pick the
    largest size in a range that wraps to ≤ 3 lines within a ~840px width / ~300px-tall
    box; if it still overflows at the minimum size, truncate the last line with `…`.
  - **`$SYMBOL`** ticker (`"$" + token.symbol`), centered, large, accent color.
  - Tag row: `SHARK TANK  ·  S{season} E{episode}  ·  {INDUSTRY}` (uppercased), muted.
  - Microcopy footer: `Unofficial tribute & parody  ·  not affiliated  ·  not financial advice`, muted.
  - Decorative triangular "fin" in the bottom-right corner (`#102E36`), small enough to
    **clear the centered footer** (see the clearance note below).
- The exact coordinates/sizes from the approved sample are the implementation reference
  (wordmark 40px @ (70,64); ticker 96px; tag 32px; microcopy 23px). **Fin polygon
  `[(1000,1000),(1000,800),(800,1000)]`** — a small corner accent. The originally-sampled
  larger fin (`(1000,640),(700,1000)`) overlapped the centered footer microcopy and
  rendered the disclaimer low-contrast over the fin; the smaller fin keeps the guardrail
  copy crisp. **Constraint:** the footer must not intersect the fin (a test asserts this).
  The plan carries the precise values.

## Rendering

- **Pillow (PIL)**, `ImageDraw`/`ImageFont.truetype`. Deterministic for a fixed
  font + Pillow version (text rasterization is stable). New dependency: `pillow>=10`.
- **Auto-fit helper:** wrap the name greedily at word boundaries; iterate font size from
  large → small until it fits the line-count + box; floor at a minimum size and clip with
  `…`. Pure function, unit-testable.
- **Only the name auto-fits;** the ticker and tag render at fixed sizes — safe because
  `MAX_TICKER_LEN` (2a) caps symbols at 10 chars and the tag uses a fixed ~16-value
  industry vocabulary. Empirically (all 100) the widest ticker is ~665px and the widest tag
  (`FITNESS/SPORTS/OUTDOORS`) ~719px, both within the ~900px usable width. A unit test
  asserts a 10-char ticker + the longest industry tag fit, so a future `MAX_TICKER_LEN` bump
  or a new industry value can't silently overflow.
- **Font vendoring (reproducibility):** bundle the TTFs in the repo at
  `pipeline/pumptank_pipeline/fonts/` (resolved via `Path(__file__).parent / "fonts"`),
  rather than relying on system fonts. Use **Carlito** (the approved sample's font, licensed
  **OFL-1.1** — redistribution permitted) or DejaVu Sans (also permissive). Record the
  chosen font's license in a `docs/` file mirroring `docs/dataset-license.md`.

## Output & schema

- PNGs → `data/token_images/{id}.png` (e.g. `s13e10p1129-smarttirecompany.png` — the `id`
  embeds the global pitch number).
- On each selected record: `media.image_url = "token_images/{id}.png"` (relative to the
  `data/` dir; the site/#3 resolves it), `media.image_source = "generated"`.
- **Schema change:** add `"generated"` to the `Media.image_source` `Literal`
  (currently `"dataset" | "wayback" | "none"`). `media.image_url` already exists.
- `data/token_images/` is committed (the 100 PNGs are the deliverable). Add nothing to
  `.gitignore`.

## Architecture

- **New module** `pipeline/pumptank_pipeline/images.py` — one responsibility: render cards.
  - Interface: `render_images(pitches, *, out_dir, font_dir, size, palette) -> list[Pitch]`
    — for each `include == True` pitch: render + save the PNG, set `media.image_url` /
    `media.image_source`; return all pitches. Helpers `_fit_name`, `_draw_card`.
  - Reads only the record fields + the vendored font; writes PNG files.
- **CLI wiring:** `ingest → filter → rank → assets → images → assemble`. `run()` calls
  `render_images(ranked, out_dir=config.IMAGE_DIR, ...)` after `generate_assets` and
  before `write_products`.
- **`config.py`:** `IMAGE_DIR = DATA_DIR / "token_images"`, `IMAGE_SIZE = 1000`,
  `IMAGE_PALETTE = {...}`, `FONT_DIR = Path(__file__).parent / "fonts"`.
- **`models.py`:** extend the `Media.image_source` Literal with `"generated"`.

## Determinism

Same record + same vendored font + same Pillow version → byte-identical PNG. No
randomness/network. Pillow is pinned with a lower bound; if a Pillow upgrade shifts text
metrics, image bytes may change while the layout stays correct — tests assert structure
(size/format/existence), not a byte hash, to avoid version brittleness.

## Error handling

- **Missing vendored font:** raise loudly (a packaging error, not a per-token issue).
- **Name too long even at min font size:** wrap to the max line count and clip the last
  line with `…` — never overflow the canvas, never crash.
- **`out_dir`** is created if absent.
- Non-selected records: media untouched (`image_source` stays `"none"`).

## Testing plan

**Unit (`images.py`):**
- `_fit_name`: short name → single line at max size; long name → wraps to ≤ max lines;
  pathological long single token → clipped with `…`, never exceeds the box.
- `render_images` (using `tmp_path` as `out_dir`): a PNG is written per selected pitch;
  opening it with Pillow yields a `1000×1000` `"PNG"`; `media.image_url` ends with
  `{id}.png` and `media.image_source == "generated"`; non-selected pitches get **no** file
  and unchanged media.
- Determinism: render the same pitch twice → identical bytes.
- Bound check: a 10-char ticker at ticker-size and the longest industry tag at tag-size
  each render within the canvas usable width (guards future ticker/industry growth).
- Footer↔fin clearance: the footer microcopy's bounding box does not intersect the fin.

**Integration:** end-to-end CLI on a fixture CSV → selected records have a `media.image_url`
pointing at an existing PNG of the right size; `products.json` validates against the
regenerated schema (with `"generated"` allowed).

**Smoke (Task in plan, on real data):** render all 100; assert 100 files exist, all
`1000×1000` PNG, total size sane; spot-check a few visually.

## Open questions / cross-checks

- **Exact pump.fun image constraints** (max dimensions/size, format) confirmed in #3; 1000×1000 PNG is a safe, conventional choice.
- **Legal review** of the on-card microcopy mirrors 2a's disclaimer review (same wording family).
- Font license confirmation recorded at vendoring time.

## Risks

- **Cards are generic** (our branded card, not the real product) — accepted; it's the
  deliberate trade for a clean IP posture.
- **Font licensing** — mitigated by vendoring a permissive font and recording the license.
- **Pillow-version metric drift** could change image bytes — mitigated by testing
  structure, not byte-hashes, and a Pillow lower-bound pin.

## Review (2026-05-24)

Independent agent review (Opus 4.7) audited the spec and **rendered all 100 cards**.
Integration confirmed (schema regenerates from the model; wiring consistent; Pillow 11.3;
Carlito = OFL-1.1; renders byte-deterministic). Empirically **0 ticker overflows, 0 tag
overflows, 0 clipped names** (79 one-line, 21 two-line) — robust on the real data. Verdict
**APPROVE WITH CHANGES**. Applied: (1) shrank the corner fin so it no longer overlaps the
centered footer disclaimer (guardrail copy stays crisp) + a clearance test; (2) documented
that only the name auto-fits and added a ticker/tag width-bound assertion; (3) fixed the
filename example (ids embed the global pitch number); (4) stated the font license as
OFL-1.1 and to record it in `docs/`.
