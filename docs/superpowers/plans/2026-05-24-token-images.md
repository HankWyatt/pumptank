# Token Images (branded card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a deterministic 1000×1000 branded PNG card for each of the 100 selected tokens (Pillow, no third-party logos) and record it on the record's media.

**Architecture:** A new `images.py` stage with pure helpers (`_fit_name`, `_draw_card`) and an orchestrator `render_images`, wired into the CLI as `… → assets → images → assemble`. Image fields are threaded via two new scalar `Pitch` fields (`image_url`, `image_source`) that `to_product_fields` folds into `Media`; `Media.image_source` gains `"generated"`. A permissive font (Carlito, OFL-1.1) is vendored in the repo.

**Tech Stack:** Python 3, Pillow, pydantic v2, pytest, jsonschema. Tests run from `pipeline/` with `PYTHONPATH=. pytest -q`.

**Spec:** `docs/superpowers/specs/2026-05-24-token-images-design.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `pipeline/pyproject.toml` | modify | add `pillow` dependency |
| `pipeline/pumptank_pipeline/config.py` | modify | `IMAGE_DIR`, `IMAGE_SIZE`, `FONT_DIR`, `IMAGE_PALETTE` |
| `pipeline/pumptank_pipeline/models.py` | modify | `Media.image_source += "generated"`; `Pitch.image_url`/`image_source`; thread into `to_product_fields` |
| `pipeline/pumptank_pipeline/fonts/` | **create** | vendored Carlito-Bold.ttf + Carlito-Regular.ttf |
| `docs/font-license.md` | **create** | record Carlito OFL-1.1 |
| `pipeline/pumptank_pipeline/images.py` | **create** | `_fit_name`, `_draw_card`, `render_images` |
| `pipeline/pumptank_pipeline/cli.py` | modify | insert `images` stage |
| `pipeline/tests/test_images.py` | **create** | unit + render tests |
| `pipeline/tests/test_models.py` / `test_config.py` / `test_cli.py` | modify | model/config/integration assertions |
| `data/token_images/` + `data/products.json` | regenerate | the 100 PNGs + media-populated output |

---

### Task 1: Config constants + Pillow dependency

**Files:** Modify `pipeline/pumptank_pipeline/config.py`, `pipeline/pyproject.toml`; Test `pipeline/tests/test_config.py`

- [ ] **Step 1: Write the failing test** — append to `pipeline/tests/test_config.py`:

```python
def test_image_config():
    assert config.IMAGE_SIZE == 1000
    assert config.IMAGE_DIR.name == "token_images"
    assert config.FONT_DIR.name == "fonts"
    assert set(config.IMAGE_PALETTE) >= {"bg", "accent", "fin", "text", "muted"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py::test_image_config -q`
Expected: FAIL (`AttributeError: ... IMAGE_SIZE`)

- [ ] **Step 3: Append the constants** to `pipeline/pumptank_pipeline/config.py`:

```python

# --- Token images (sub-project 2b) ---
IMAGE_DIR = DATA_DIR / "token_images"
IMAGE_SIZE = 1000
FONT_DIR = Path(__file__).parent / "fonts"
IMAGE_PALETTE = {
    "bg": (11, 32, 39), "accent": (51, 214, 177), "fin": (16, 46, 54),
    "text": (240, 245, 246), "muted": (140, 161, 166),
}
```

- [ ] **Step 4: Add the dependency** — in `pipeline/pyproject.toml`, add `"pillow>=10.0"` to the `dependencies` array (resulting e.g. `["pandas>=2.0", "pydantic>=2.0", "pillow>=10.0"]`).

- [ ] **Step 5: Run to verify it passes**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pipeline/pumptank_pipeline/config.py pipeline/pyproject.toml pipeline/tests/test_config.py
git commit -m "feat(pipeline): add token-image config constants and pillow dep"
```

---

### Task 2: Model changes — `"generated"` source + image fields threaded through `to_product_fields`

**Files:** Modify `pipeline/pumptank_pipeline/models.py`; Test `pipeline/tests/test_models.py`

**Context:** `Media` lives on `Product`, not `Pitch`, and `to_product_fields` builds `Media(former_website=pitch.company_website)`. To let the image stage set the image, add two scalar fields to `Pitch` and fold them into that `Media`. Backward-compatible: defaults reproduce today's output (`image_url=None`, `image_source="none"`).

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_models.py`:

```python
def test_media_allows_generated_source():
    from pumptank_pipeline.models import Media
    assert Media(image_source="generated").image_source == "generated"


def test_to_product_fields_threads_image(tmp_path):
    from pumptank_pipeline.models import Pitch, Product, to_product_fields
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              company_website="https://x", image_url="token_images/x.png",
              image_source="generated", got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.media.image_url == "token_images/x.png"
    assert prod.media.image_source == "generated"
    assert prod.media.former_website == "https://x"  # still threaded
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py -q`
Expected: FAIL (`Pitch` has no `image_url`; `Media` rejects `"generated"`)

- [ ] **Step 3: Implement** in `pipeline/pumptank_pipeline/models.py`:

(a) In `Media`, change the `image_source` line to include `"generated"`:

```python
    image_source: Literal["dataset", "wayback", "none", "generated"] = "none"
```

(b) In `Pitch`, add after `token: Optional[TokenAssets] = None`:

```python
    image_url: Optional[str] = None
    image_source: str = "none"
```

(c) In `to_product_fields`, replace the `media=Media(former_website=pitch.company_website),` line with:

```python
        media=Media(
            former_website=pitch.company_website,
            image_url=pitch.image_url, image_source=pitch.image_source,
        ),
```

- [ ] **Step 4: Run to verify pass + no regression**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py tests/test_assemble.py -q`
Expected: PASS (existing tests stay green — defaults give `image_source="none"`, `image_url=None`)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/models.py pipeline/tests/test_models.py
git commit -m "feat(pipeline): add 'generated' image source and thread image fields to Media"
```

---

### Task 3: Vendor the Carlito font + license record

**Files:** Create `pipeline/pumptank_pipeline/fonts/Carlito-{Bold,Regular}.ttf`, `docs/font-license.md`; Test `pipeline/tests/test_images.py`

- [ ] **Step 1: Write the failing test** — create `pipeline/tests/test_images.py`:

```python
from pumptank_pipeline import config
from PIL import ImageFont


def test_vendored_fonts_present_and_load():
    for name in ("Carlito-Bold.ttf", "Carlito-Regular.ttf"):
        p = config.FONT_DIR / name
        assert p.exists(), f"missing vendored font {p}"
        ImageFont.truetype(str(p), 40)  # loads without raising
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_images.py -q`
Expected: FAIL (`assert ... .exists()` — fonts not vendored yet)

- [ ] **Step 3: Vendor the fonts + license**

```bash
mkdir -p pipeline/pumptank_pipeline/fonts
cp /usr/share/fonts/google-carlito-fonts/Carlito-Bold.ttf    pipeline/pumptank_pipeline/fonts/
cp /usr/share/fonts/google-carlito-fonts/Carlito-Regular.ttf pipeline/pumptank_pipeline/fonts/
```

Create `docs/font-license.md`:

```markdown
# Vendored font license

- Font: **Carlito** (Bold + Regular), `pipeline/pumptank_pipeline/fonts/`
- License: **SIL Open Font License 1.1 (OFL-1.1)** — redistribution and embedding permitted.
- Author: Łukasz Dziedzic for Google (metric-compatible Calibri substitute).
- Used to render token card images deterministically without depending on system fonts.
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_images.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/fonts/ docs/font-license.md pipeline/tests/test_images.py
git commit -m "chore(pipeline): vendor Carlito font (OFL-1.1) for card rendering"
```

---

### Task 4: `_fit_name` — wrap + auto-size + clip

**Files:** Create `pipeline/pumptank_pipeline/images.py`; Modify `pipeline/tests/test_images.py`

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_images.py`:

```python
from PIL import Image, ImageDraw
from pumptank_pipeline.images import _fit_name

BOLD = str(config.FONT_DIR / "Carlito-Bold.ttf")


def _d():
    return ImageDraw.Draw(Image.new("RGB", (1000, 1000)))


def test_fit_name_short_single_line():
    lines, font, lh = _fit_name(_d(), "Joyebells", BOLD, 840, 300)
    assert lines == ["Joyebells"]


def test_fit_name_wraps_long():
    lines, font, lh = _fit_name(_d(), "50 State Capitals in 50 Minutes", BOLD, 840, 300)
    assert 1 < len(lines) <= 3


def test_fit_name_clips_pathological_single_word():
    lines, font, lh = _fit_name(_d(), "Supercalifragilistic" * 4, BOLD, 840, 300)
    assert len(lines) <= 3
    assert lines[-1].endswith("…")
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_images.py -q`
Expected: FAIL (`ModuleNotFoundError: ... images`)

- [ ] **Step 3: Implement** — create `pipeline/pumptank_pipeline/images.py`:

```python
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .models import Pitch


def _wrap(draw, text, font_path, size, max_w):
    f = ImageFont.truetype(font_path, size)
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return (lines or [""]), f


def _clip_to_width(draw, line, font, max_w):
    if draw.textlength(line, font=font) <= max_w:
        return line
    s = line
    while s and draw.textlength(s + "…", font=font) > max_w:
        s = s[:-1]
    return (s + "…") if s else "…"


def _fit_name(draw, text, font_path, max_w, max_h, max_lines=3,
              size_hi=120, size_lo=44, step=4):
    """Largest size whose wrap fits the box in <= max_lines; else clip at min size."""
    for size in range(size_hi, size_lo - 1, -step):
        lines, f = _wrap(draw, text, font_path, size, max_w)
        a, d = f.getmetrics()
        lh = a + d + 8
        if len(lines) <= max_lines and lh * len(lines) <= max_h:
            return lines, f, lh
    lines, f = _wrap(draw, text, font_path, size_lo, max_w)
    a, d = f.getmetrics()
    lh = a + d + 8
    had_more = len(lines) > max_lines
    lines = [_clip_to_width(draw, ln, f, max_w) for ln in lines[:max_lines]]
    if had_more and not lines[-1].endswith("…"):
        lines[-1] = _clip_to_width(draw, lines[-1] + "…", f, max_w)
    return lines, f, lh
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_images.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/images.py pipeline/tests/test_images.py
git commit -m "feat(pipeline): add card name auto-fit/wrap/clip helper"
```

---

### Task 5: `_draw_card` + `render_images`

**Files:** Modify `pipeline/pumptank_pipeline/images.py`, `pipeline/tests/test_images.py`

**Context:** `_draw_card` reproduces the approved sample (deep-teal bg, accent, `PUMPTANK` wordmark, `NO DEAL` badge, auto-fit name, `$TICKER`, tag row, footer microcopy, small corner fin). Layout constants are module-level so tests can assert the ticker/tag width bound and the footer↔fin clearance. Measured widths: worst ticker 919px, longest tag 719px, footer 603px — all clear the usable width (940) and the fin (footer right ≈ 801 < fin left ≈ 876 at the footer's y).

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_images.py`:

```python
from pumptank_pipeline.models import TokenAssets, Selection
from pumptank_pipeline.images import (
    _draw_card, render_images, _fin_left_x, FOOTER, FOOTER_Y, MICRO_SIZE,
    TICKER_SIZE, TAG_SIZE, USABLE_W,
)

REG = str(config.FONT_DIR / "Carlito-Regular.ttf")


def _pitch(pid, include=True):
    tok = TokenAssets(name="Acme Co", symbol="ACME", description="d") if include else None
    return Pitch(id=pid, season=5, episode=9, pitch_number=1, company_name="AcmeCo",
                 industry="Tech", got_deal=False, include=include, token=tok,
                 selection=Selection(selected=include, rank=1 if include else None))


def test_draw_card_dimensions():
    img = _draw_card("Smart Tire Company", "SMARTTIRE", 13, 10, "Automotive",
                     size=1000, palette=config.IMAGE_PALETTE, font_dir=config.FONT_DIR)
    assert img.size == (1000, 1000)
    assert img.mode == "RGB"


def test_ticker_and_tag_within_usable_width():
    d = _d()
    bold = ImageFont.truetype(BOLD, TICKER_SIZE)
    reg = ImageFont.truetype(REG, TAG_SIZE)
    assert d.textlength("$" + "W" * 10, font=bold) <= USABLE_W      # worst ticker
    assert d.textlength("SHARK TANK  ·  S16 E22  ·  FITNESS/SPORTS/OUTDOORS",
                        font=reg) <= USABLE_W                        # longest tag


def test_footer_clears_fin():
    d = _d()
    fw = d.textlength(FOOTER, font=ImageFont.truetype(REG, MICRO_SIZE))
    footer_right = 500 + fw / 2          # centered footer
    assert footer_right < _fin_left_x(FOOTER_Y, 1000)


def test_render_images_only_selected(tmp_path):
    out = render_images([_pitch("a", True), _pitch("b", False)],
                        out_dir=tmp_path, font_dir=config.FONT_DIR,
                        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    by = {p.id: p for p in out}
    assert (tmp_path / "a.png").exists() and not (tmp_path / "b.png").exists()
    assert by["a"].image_url.endswith("a.png") and by["a"].image_source == "generated"
    assert by["b"].image_source == "none"
    im = Image.open(tmp_path / "a.png")
    assert im.size == (1000, 1000) and im.format == "PNG"


def test_render_images_deterministic(tmp_path):
    render_images([_pitch("a", True)], out_dir=tmp_path / "x", font_dir=config.FONT_DIR,
                  size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    render_images([_pitch("a", True)], out_dir=tmp_path / "y", font_dir=config.FONT_DIR,
                  size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    assert (tmp_path / "x/a.png").read_bytes() == (tmp_path / "y/a.png").read_bytes()
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_images.py -q`
Expected: FAIL (`cannot import name '_draw_card'`)

- [ ] **Step 3: Implement** — append to `pipeline/pumptank_pipeline/images.py`:

```python
# --- layout (for IMAGE_SIZE = 1000) ---
MARGIN = 70
TICKER_SIZE = 96
TICKER_Y = 560
TAG_SIZE = 32
TAG_Y = 706
MICRO_SIZE = 23
FOOTER_Y = 924
USABLE_W = 940  # IMAGE_SIZE - 2*30; worst ticker 919px and longest tag 719px both fit
FOOTER = "Unofficial tribute & parody  ·  not affiliated  ·  not financial advice"


def _fin_polygon(size):
    return [(size, size), (size, int(size * 0.8)), (int(size * 0.8), size)]


def _fin_left_x(y, size):
    """Left edge x of the corner fin at height y (for y in [0.8*size, size])."""
    return 1.8 * size - y


def _centered(draw, text, font, y, fill, width):
    w = draw.textlength(text, font=font)
    draw.text(((width - w) // 2, y), text, font=font, fill=fill)


def _draw_card(name, symbol, season, episode, industry, *, size, palette, font_dir):
    font_dir = Path(font_dir)
    bold = str(font_dir / "Carlito-Bold.ttf")
    reg = str(font_dir / "Carlito-Regular.ttf")
    img = Image.new("RGB", (size, size), palette["bg"])
    d = ImageDraw.Draw(img)
    d.polygon(_fin_polygon(size), fill=palette["fin"])
    # wordmark + NO DEAL badge
    d.text((MARGIN, 64), "P U M P T A N K", font=ImageFont.truetype(bold, 40),
           fill=palette["accent"])
    pf = ImageFont.truetype(bold, 34)
    lab = "NO DEAL"
    tw = d.textlength(lab, font=pf)
    x2 = size - MARGIN
    d.rounded_rectangle([x2 - tw - 44, 58, x2, 116], radius=28,
                        outline=palette["accent"], width=3)
    d.text((x2 - tw - 22, 64), lab, font=pf, fill=palette["accent"])
    # name (auto-fit, centered block around y=360)
    lines, nf, lh = _fit_name(d, name, bold, size - 2 * 80, 300)
    y = 360 - (lh * len(lines)) // 2
    for ln in lines:
        _centered(d, ln, nf, y, palette["text"], size)
        y += lh
    # ticker
    _centered(d, "$" + symbol, ImageFont.truetype(bold, TICKER_SIZE), TICKER_Y,
              palette["accent"], size)
    # tag row
    tag = f"SHARK TANK  ·  S{season} E{episode}  ·  {industry.upper()}".strip(" ·")
    _centered(d, tag, ImageFont.truetype(reg, TAG_SIZE), TAG_Y, palette["muted"], size)
    # footer microcopy
    _centered(d, FOOTER, ImageFont.truetype(reg, MICRO_SIZE), FOOTER_Y, palette["muted"], size)
    return img


def render_images(pitches, *, out_dir, font_dir, size, palette):
    """Render + save a card PNG for each include==True pitch; set its image fields."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in pitches:
        if not (p.include and p.token):
            continue
        img = _draw_card(p.token.name, p.token.symbol, p.season, p.episode,
                         p.industry or "", size=size, palette=palette, font_dir=font_dir)
        img.save(out_dir / f"{p.id}.png")
        p.image_url = f"{out_dir.name}/{p.id}.png"
        p.image_source = "generated"
    return pitches
```

- [ ] **Step 4: Run to verify pass + full suite**

Run: `cd pipeline && PYTHONPATH=. pytest -q`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/images.py pipeline/tests/test_images.py
git commit -m "feat(pipeline): render branded token card PNGs"
```

---

### Task 6: Wire `images` into the CLI

**Files:** Modify `pipeline/pumptank_pipeline/cli.py`, `pipeline/tests/test_cli.py`

- [ ] **Step 1: Write the failing test** — append to `pipeline/tests/test_cli.py`:

```python
def test_run_generates_images(csv_factory, base_row, tmp_path):
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory([dict(base_row)]), out_path=out, schema_path=schema)
    rec = json.loads(out.read_text())[0]
    assert rec["media"]["image_source"] == "generated"
    assert rec["media"]["image_url"].endswith(".png")
    from pathlib import Path as _P
    from pumptank_pipeline import config
    assert (config.IMAGE_DIR / f'{rec["id"]}.png').exists()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_cli.py::test_run_generates_images -q`
Expected: FAIL (`image_source` is `"none"` — images stage not wired)

- [ ] **Step 3: Wire the stage** in `pipeline/pumptank_pipeline/cli.py`:

(a) Add alongside the other stage imports:

```python
from .images import render_images
```

(b) In `run`, insert after the `generate_assets(...)` reassignment and before `write_products(...)`:

```python
    ranked = render_images(
        ranked, out_dir=config.IMAGE_DIR, font_dir=config.FONT_DIR,
        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE,
    )
```

- [ ] **Step 4: Run the full suite**

Run: `cd pipeline && PYTHONPATH=. pytest -q`
Expected: PASS (all). Note: this test writes a PNG into the real `config.IMAGE_DIR`; that's fine (it's regenerated in Task 7). The fixture pitch (DoorBot) is findable + S5, so it's selected and gets an image.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/cli.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): wire image rendering into CLI (assets->images->assemble)"
```

---

### Task 7: Real run — render all 100, verify, commit output

**Files:** Regenerate `data/token_images/*.png`, `data/products.json`, `data/products.schema.json`

- [ ] **Step 1: Run the pipeline on the real CSV**

Run:
```bash
cd pipeline && PYTHONPATH=. python -m pumptank_pipeline.cli \
  --input "../data/raw/Shark Tank US dataset.csv"
```
Expected: `1481 pitches; 567 no-deal; 100 selected (top 100); wrote .../data/products.json`

- [ ] **Step 2: Verify the images + records**

Run:
```bash
cd pipeline && PYTHONPATH=. python - <<'PY'
import json
from pathlib import Path
from PIL import Image
P = Path("../data")
prods = json.loads((P / "products.json").read_text())
sel = [p for p in prods if p["include"]]
assert len(sel) == 100, len(sel)
imgs = list((P / "token_images").glob("*.png"))
assert len(imgs) == 100, len(imgs)
for p in sel:
    assert p["media"]["image_source"] == "generated"
    rel = p["media"]["image_url"]
    fp = P / rel
    assert fp.exists(), rel
    im = Image.open(fp)
    assert im.size == (1000, 1000) and im.format == "PNG"
# no stray images for non-selected
assert all(p["media"]["image_source"] == "none" for p in prods if not p["include"])
print("OK: 100 cards, all 1000x1000 PNG, media wired, schema-consistent")
PY
```
Expected: prints `OK: ...`. Spot-check 2–3 PNGs visually (open the files).

- [ ] **Step 3: Commit the output**

```bash
git add data/token_images data/products.json data/products.schema.json
git commit -m "chore(data): regenerate products.json with branded token images"
```

---

## Self-Review

- **Spec coverage:** branded 1000×1000 card (Task 5) ✓; palette/wordmark/badge/name/ticker/tag/footer/fin (Task 5) ✓; auto-fit name only, ticker/tag bound + footer↔fin clearance asserted (Task 5 tests) ✓; Pillow + vendored OFL font (Tasks 1, 3) ✓; `media.image_url` + `image_source="generated"` threaded (Task 2) and set per selected token (Task 5) ✓; only selected get images (Task 5 test) ✓; deterministic (Task 5 test) ✓; CLI wiring `assets→images→assemble` (Task 6) ✓; schema regenerated with `"generated"` (Tasks 2, 7) ✓; committed `data/token_images/` (Task 7) ✓.
- **Placeholder scan:** none — complete code + exact commands in every step. The pyproject step shows the exact entry to add.
- **Type consistency:** `_fit_name(draw, text, font_path, max_w, max_h, ...)`, `_draw_card(name, symbol, season, episode, industry, *, size, palette, font_dir)`, `render_images(pitches, *, out_dir, font_dir, size, palette)`, and the module constants (`FOOTER`, `FOOTER_Y`, `MICRO_SIZE`, `TICKER_SIZE`, `TAG_SIZE`, `USABLE_W`, `_fin_left_x`) are referenced identically in `images.py` and `test_images.py`. `Pitch.image_url`/`image_source` and `Media.image_source` literal match between Task 2 and the renders/tests.
- **Measured invariants:** worst ticker 919px / longest tag 719px ≤ `USABLE_W` 940; footer right ≈801 < fin left ≈876 at `FOOTER_Y` — all from real measurement, asserted in tests.
