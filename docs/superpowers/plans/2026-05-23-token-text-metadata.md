# Token Text Metadata (2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate pump.fun text metadata (`name`, `symbol`, `description`) for each of the 100 selected no-deal pitches and store it on the record's `token` field.

**Architecture:** A new pure-Python `assets.py` stage with small testable helpers (`_clean_name`, `_derive_symbol`, `_is_junk_blurb`, `_compose_description`) orchestrated by `generate_assets`, wired into the CLI as `ingest → filter → rank → assets → assemble`. A typed `TokenAssets` model replaces the untyped `token` dict and flows through `to_product_fields` into the regenerated schema.

**Tech Stack:** Python 3, pydantic v2, pytest, jsonschema. Tests run from `pipeline/` with `PYTHONPATH=. pytest -q`.

**Spec:** `docs/superpowers/specs/2026-05-23-token-text-metadata-design.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `pipeline/pumptank_pipeline/config.py` | modify | `MAX_TICKER_LEN`, `MAX_DESCRIPTION_LEN`, `TOKEN_DISCLAIMER`, `NAME_OVERRIDES` |
| `pipeline/pumptank_pipeline/models.py` | modify | add `TokenAssets`; `Pitch`/`Product` `token` field; wire `to_product_fields` |
| `pipeline/pumptank_pipeline/assets.py` | **create** | name/ticker/description helpers + `generate_assets` |
| `pipeline/pumptank_pipeline/cli.py` | modify | insert `assets` stage |
| `pipeline/tests/test_config.py` | modify | assert token constants |
| `pipeline/tests/test_models.py` | modify | `TokenAssets` + token passthrough |
| `pipeline/tests/test_assets.py` | **create** | helper + `generate_assets` unit tests |
| `pipeline/tests/test_cli.py` | modify | integration: tokens on selected records |
| `data/products.json` | regenerate | now carries `token` blocks |

`assemble.py` needs **no change** (regenerates schema from the model).

---

### Task 1: Token config constants

**Files:** Modify `pipeline/pumptank_pipeline/config.py`; Test `pipeline/tests/test_config.py`

- [ ] **Step 1: Write the failing test** — append to `pipeline/tests/test_config.py`:

```python
def test_token_metadata_config():
    assert config.MAX_TICKER_LEN == 10
    assert config.MAX_DESCRIPTION_LEN > 0
    assert isinstance(config.NAME_OVERRIDES, dict)
    d = config.TOKEN_DISCLAIMER.lower()
    assert "not affiliated" in d and "not financial advice" in d
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py::test_token_metadata_config -q`
Expected: FAIL (`AttributeError: ... MAX_TICKER_LEN`)

- [ ] **Step 3: Append the constants** to `pipeline/pumptank_pipeline/config.py`:

```python

# --- Token text metadata (sub-project 2a) ---
MAX_TICKER_LEN = 10            # conservative; confirm pump.fun's symbol limit in #3
MAX_DESCRIPTION_LEN = 480      # conservative; confirm pump.fun's limit in #3
TOKEN_DISCLAIMER = (
    "Unofficial fan tribute & parody token. Not affiliated with or endorsed by "
    "the company, its founders, or Shark Tank / ABC / Sony. Not financial advice; "
    "no promise of value."
)
# product id -> hand-fixed display name, for names the de-smoosh regex mangles.
# Populated in Task 8 after eyeballing the 100 rendered names.
NAME_OVERRIDES: dict[str, str] = {}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/config.py pipeline/tests/test_config.py
git commit -m "feat(pipeline): add token-metadata config constants"
```

---

### Task 2: `TokenAssets` model + `token` field + `to_product_fields` wiring

**Files:** Modify `pipeline/pumptank_pipeline/models.py`; Test `pipeline/tests/test_models.py`

**Context:** `Product.token` is currently `Optional[dict] = None` (models.py:53) and `Pitch` has no `token` field. Replace the dict with a typed `TokenAssets`, add `token` to `Pitch`, and pass it through `to_product_fields` (which already builds the Product kwargs).

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_models.py`:

```python
def test_token_assets_defaults():
    from pumptank_pipeline.models import TokenAssets
    t = TokenAssets(name="Smart Tire Company", symbol="SMARTTIRE", description="x")
    assert t.mint is None


def test_to_product_fields_passes_token():
    from pumptank_pipeline.models import Pitch, Product, to_product_fields, TokenAssets
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              token=TokenAssets(name="X Co", symbol="XCO", description="d"),
              got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.token.symbol == "XCO"
    assert prod.token.mint is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py -q`
Expected: FAIL (`Pitch` has no `token`; `to_product_fields` doesn't pass it)

- [ ] **Step 3: Implement** in `pipeline/pumptank_pipeline/models.py`:

(a) Add the `TokenAssets` class right after the `Selection` class:

```python
class TokenAssets(BaseModel):
    name: str
    symbol: str
    description: str
    mint: Optional[str] = None  # filled by sub-project 3 at launch
```

(b) In `Pitch`, replace the existing `selection`/`include` block's trailing lines by adding a `token` field after `include: bool = True`:

```python
    token: Optional[TokenAssets] = None
```

(c) In `Product`, change the existing `token: Optional[dict] = None` line to:

```python
    token: Optional[TokenAssets] = None
```

(d) In `to_product_fields`, add `token=pitch.token,` as the final kwarg in the returned `dict(...)` (after `include=pitch.include,`):

```python
        token=pitch.token,
```

- [ ] **Step 4: Run to verify pass + no regression**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py tests/test_assemble.py -q`
Expected: PASS (existing `test_product_is_nested_and_defaults` still green — `token` still defaults `None`)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/models.py pipeline/tests/test_models.py
git commit -m "feat(pipeline): add TokenAssets model and wire token through to_product_fields"
```

---

### Task 3: `_clean_name` helper (de-smoosh + overrides)

**Files:** Create `pipeline/pumptank_pipeline/assets.py`; Create `pipeline/tests/test_assets.py`

- [ ] **Step 1: Write the failing tests** — create `pipeline/tests/test_assets.py`:

```python
from pumptank_pipeline.assets import _clean_name


def test_clean_name_camelcase():
    assert _clean_name("SmartTireCompany", {}, "id1") == "Smart Tire Company"
    assert _clean_name("BelloVerde", {}, "id2") == "Bello Verde"
    assert _clean_name("TheHappyBirdwatcher", {}, "id3") == "The Happy Birdwatcher"


def test_clean_name_allcaps_and_spaced_passthrough():
    assert _clean_name("ALL33", {}, "id4") == "ALL33"
    assert _clean_name("Already Spaced", {}, "id5") == "Already Spaced"


def test_clean_name_override_wins():
    assert _clean_name("Buzzy4Shots", {"id6": "Buzzy 4 Shots"}, "id6") == "Buzzy 4 Shots"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: FAIL (`ModuleNotFoundError: ... assets`)

- [ ] **Step 3: Implement** — create `pipeline/pumptank_pipeline/assets.py`:

```python
import re
from typing import Optional

from .models import Pitch, TokenAssets

_CORP_SUFFIX = re.compile(r"\s+(?:Company|Co|Inc|LLC|Corp)\.?$", re.IGNORECASE)
_SPACED_DASH = re.compile(r"\s[-–—]\s")


def _clean_name(company_name: str, overrides: dict[str, str], pitch_id: str) -> str:
    """De-smoosh a dataset name into a display name; overrides win."""
    if pitch_id in overrides:
        return overrides[pitch_id]
    name = company_name.strip()
    if " " in name:
        return name
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)   # camelCase boundary
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", name)  # acronym -> word
    return re.sub(r"\s+", " ", name).strip()
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/assets.py pipeline/tests/test_assets.py
git commit -m "feat(pipeline): add token name de-smoosh helper"
```

---

### Task 4: `_derive_symbol` helper

**Files:** Modify `pipeline/pumptank_pipeline/assets.py`, `pipeline/tests/test_assets.py`

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_assets.py`:

```python
from pumptank_pipeline.assets import _derive_symbol


def test_derive_symbol_basic_and_suffix_strip():
    assert _derive_symbol("Smart Tire Company", 10) == "SMARTTIRE"
    assert _derive_symbol("Bello Verde", 10) == "BELLOVERDE"
    assert _derive_symbol("ALL33", 10) == "ALL33"


def test_derive_symbol_strips_leading_the_and_truncates():
    assert _derive_symbol("The Happy Birdwatcher", 10) == "HAPPYBIRDW"


def test_derive_symbol_strips_nonalnum_and_uppercases():
    assert _derive_symbol("Joye-bells!", 10) == "JOYEBELLS"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: FAIL (`cannot import name '_derive_symbol'`)

- [ ] **Step 3: Implement** — append to `pipeline/pumptank_pipeline/assets.py`:

```python
def _derive_symbol(clean_name: str, max_len: int) -> str:
    """Compact uppercase cashtag: drop leading 'The' + corp suffixes, alnum-only, cap len."""
    base = re.sub(r"^The\s+", "", clean_name, flags=re.IGNORECASE)
    base = _CORP_SUFFIX.sub("", base)
    base = re.sub(r"[^A-Za-z0-9]", "", base).upper()
    return base[:max_len]
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/assets.py pipeline/tests/test_assets.py
git commit -m "feat(pipeline): add token symbol derivation helper"
```

---

### Task 5: `_is_junk_blurb` + `_compose_description`

**Files:** Modify `pipeline/pumptank_pipeline/assets.py`, `pipeline/tests/test_assets.py`

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_assets.py`:

```python
from pumptank_pipeline.models import Pitch
from pumptank_pipeline.assets import _is_junk_blurb, _compose_description

DISC = "Not affiliated. Not financial advice."


def _p(desc, name="Skyride", industry="Fitness/Sports/Outdoors", season=3, episode=13):
    return Pitch(id="s3e13p1-x", season=season, episode=episode, pitch_number=1,
                 company_name=name, industry=industry, description=desc, got_deal=False)


def test_is_junk_blurb():
    assert _is_junk_blurb("Skyride - Outdoor Recreation") is True
    assert _is_junk_blurb("Invisible Xero Shoes - Men and Women's Shoes") is True
    assert _is_junk_blurb("High-performance airless tires") is False
    assert _is_junk_blurb("Premium refrigerated pie") is False
    assert _is_junk_blurb(None) is False


def test_compose_description_keeps_real_blurb():
    d = _compose_description(_p("Premium refrigerated pie"), "Joyebells",
                             disclaimer=DISC, max_len=480)
    assert d.startswith("Premium refrigerated pie.")
    assert "Pitched on Shark Tank S3E13 — no deal." in d
    assert d.endswith(DISC)


def test_compose_description_templates_junk():
    d = _compose_description(_p("Skyride - Outdoor Recreation"), "Skyride",
                             disclaimer=DISC, max_len=480)
    assert d.startswith("Skyride, a Fitness/Sports/Outdoors product.")


def test_compose_description_truncates_blurb_only():
    long = "x" * 600
    d = _compose_description(_p(long), "Name", disclaimer=DISC, max_len=120)
    assert len(d) <= 120
    assert d.endswith(DISC)  # disclaimer never trimmed
    assert "…" in d
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: FAIL (`cannot import name '_is_junk_blurb'`)

- [ ] **Step 3: Implement** — append to `pipeline/pumptank_pipeline/assets.py`:

```python
def _is_junk_blurb(description: Optional[str]) -> bool:
    """Junk = the templated '{Name} - {Category}' pattern: a space-surrounded dash."""
    return bool(description) and bool(_SPACED_DASH.search(description))


def _compose_description(pitch: Pitch, clean_name: str, *,
                         disclaimer: str, max_len: int) -> str:
    industry = pitch.industry or "Shark Tank"
    if _is_junk_blurb(pitch.description):
        blurb = f"{clean_name}, a {industry} product."
    else:
        blurb = (pitch.description or f"A {industry} product.").strip()
    if not blurb.endswith((".", "!", "?")):
        blurb += "."
    tail = f" Pitched on Shark Tank S{pitch.season}E{pitch.episode} — no deal. {disclaimer}"
    budget = max_len - len(tail)
    if len(blurb) > budget:
        blurb = blurb[: max(0, budget - 1)].rstrip() + "…"
    return f"{blurb}{tail}"
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/assets.py pipeline/tests/test_assets.py
git commit -m "feat(pipeline): add blurb classification and description composition"
```

---

### Task 6: `generate_assets` (orchestration + ticker dedup)

**Files:** Modify `pipeline/pumptank_pipeline/assets.py`, `pipeline/tests/test_assets.py`

- [ ] **Step 1: Write the failing tests** — append to `pipeline/tests/test_assets.py`:

```python
from pumptank_pipeline.models import Selection
from pumptank_pipeline.assets import generate_assets


def _sel(pid, name, rank, include=True, desc="A gadget"):
    return Pitch(id=pid, season=5, episode=1, pitch_number=1, company_name=name,
                 industry="Tech", description=desc, got_deal=False,
                 include=include, selection=Selection(selected=include, rank=rank))


def test_generate_assets_only_selected_get_tokens():
    out = generate_assets(
        [_sel("a", "Acme", 1, include=True), _sel("b", "Beta", None, include=False)],
        max_ticker_len=10, max_description_len=480, disclaimer="D.", name_overrides={})
    by_id = {p.id: p for p in out}
    assert by_id["a"].token is not None
    assert by_id["a"].token.symbol == "ACME"
    assert by_id["b"].token is None


def test_generate_assets_dedupes_tickers():
    # two names that derive the same symbol -> second gets a numeric suffix
    out = generate_assets(
        [_sel("r1", "Acme", 1), _sel("r2", "Acme", 2)],
        max_ticker_len=10, max_description_len=480, disclaimer="D.", name_overrides={})
    syms = sorted(p.token.symbol for p in out)
    assert syms == ["ACME", "ACME2"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_assets.py -q`
Expected: FAIL (`cannot import name 'generate_assets'`)

- [ ] **Step 3: Implement** — append to `pipeline/pumptank_pipeline/assets.py`:

```python
def _unique_symbol(base: str, taken: set, max_len: int) -> str:
    if base not in taken:
        return base
    i = 2
    while True:
        suffix = str(i)
        cand = base[: max_len - len(suffix)] + suffix
        if cand not in taken:
            return cand
        i += 1


def generate_assets(pitches: list[Pitch], *, max_ticker_len: int,
                    max_description_len: int, disclaimer: str,
                    name_overrides: dict) -> list[Pitch]:
    """Set .token on every include==True pitch; return all pitches.

    Tickers are deduped deterministically in selection.rank order.
    """
    def _rank(p):
        return p.selection.rank if (p.selection and p.selection.rank is not None) else 1_000_000

    selected = sorted((p for p in pitches if p.include), key=_rank)
    taken: set = set()
    for p in selected:
        name = _clean_name(p.company_name, name_overrides, p.id)
        base = _derive_symbol(name, max_ticker_len) or f"TKN{_rank(p)}"
        symbol = _unique_symbol(base, taken, max_ticker_len)
        taken.add(symbol)
        p.token = TokenAssets(
            name=name, symbol=symbol,
            description=_compose_description(
                p, name, disclaimer=disclaimer, max_len=max_description_len),
        )
    return pitches
```

- [ ] **Step 4: Run to verify pass + full suite**

Run: `cd pipeline && PYTHONPATH=. pytest -q`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/assets.py pipeline/tests/test_assets.py
git commit -m "feat(pipeline): add generate_assets with ticker dedup"
```

---

### Task 7: Wire `assets` into the CLI

**Files:** Modify `pipeline/pumptank_pipeline/cli.py`, `pipeline/tests/test_cli.py`

- [ ] **Step 1: Write the failing test** — append to `pipeline/tests/test_cli.py`:

```python
def test_run_generates_token_assets(csv_factory, base_row, tmp_path):
    rows = [
        dict(base_row),  # DoorBot S5 no-deal, findable -> selected
        dict(base_row, **{"Pitch Number": 2, "Startup Name": "Acme",
                          "Got Deal": 1}),  # deal -> filtered
    ]
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory(rows), out_path=out, schema_path=schema)
    data = {r["company_name"]: r for r in json.loads(out.read_text())}
    tok = data["DoorBot"]["token"]
    assert tok is not None
    assert tok["symbol"] == "DOORBOT"
    assert "no deal" in tok["description"].lower()
    assert tok["mint"] is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_cli.py::test_run_generates_token_assets -q`
Expected: FAIL (`token` is `None` — assets stage not wired)

- [ ] **Step 3: Wire the stage** in `pipeline/pumptank_pipeline/cli.py`:

(a) Add the import alongside the other stage imports:

```python
from .assets import generate_assets
```

(b) In `run`, insert the assets step between `rank_and_select(...)` and `write_products(...)`, and pass its result to `write_products`:

```python
    ranked = rank_and_select(
        no_deal, weights=config.SELECTION_WEIGHTS,
        n=config.SELECT_TOP_N, max_season=config.MAX_SEASON,
    )
    ranked = generate_assets(
        ranked, max_ticker_len=config.MAX_TICKER_LEN,
        max_description_len=config.MAX_DESCRIPTION_LEN,
        disclaimer=config.TOKEN_DISCLAIMER, name_overrides=config.NAME_OVERRIDES,
    )
    write_products(ranked, out_path, schema_path)
```

- [ ] **Step 4: Run the full suite**

Run: `cd pipeline && PYTHONPATH=. pytest -q`
Expected: PASS (all, including the existing `test_run_annotates_selection`)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/cli.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): wire assets stage into CLI (rank->assets->assemble)"
```

---

### Task 8: Real run, populate overrides, commit output

**Files:** Modify `pipeline/pumptank_pipeline/config.py` (overrides only); Regenerate `data/products.json`, `data/products.schema.json`

- [ ] **Step 1: Run the pipeline on the real CSV**

Run:
```bash
cd pipeline && PYTHONPATH=. python -m pumptank_pipeline.cli \
  --input "../data/raw/Shark Tank US dataset.csv"
```
Expected: `1481 pitches; 567 no-deal; 100 selected (top 100); wrote .../data/products.json`

- [ ] **Step 2: Inspect rendered names; populate `NAME_OVERRIDES`**

Run:
```bash
cd pipeline && PYTHONPATH=. python - <<'PY'
import json
from pathlib import Path
prods = json.loads(Path("../data/products.json").read_text())
sel = [p for p in prods if p["include"]]
# names that still contain a digit adjacent to a letter (likely mangled by de-smoosh)
import re
for p in sel:
    nm = p["token"]["name"]
    if re.search(r"[A-Za-z]\d|\d[A-Za-z]", nm.replace(" ", "")):
        print(p["id"], "->", repr(nm))
PY
```
For each `id` printed whose name reads wrong (expected: `Buzzy4Shots`, `50StateCapitalsin50Minutes`), add an entry to `NAME_OVERRIDES` in `pipeline/pumptank_pipeline/config.py`, e.g.:
```python
NAME_OVERRIDES: dict[str, str] = {
    "<buzzy-id>": "Buzzy 4 Shots",
    "<50states-id>": "50 States in 50 Minutes",
}
```
Then re-run Step 1.

- [ ] **Step 3: Verify the output**

Run:
```bash
cd pipeline && PYTHONPATH=. python - <<'PY'
import json, collections
from pathlib import Path
import jsonschema
P = Path("../data")
prods = json.loads((P / "products.json").read_text())
sel = [p for p in prods if p["include"]]
assert len(sel) == 100, len(sel)
assert all(p["token"] for p in sel), "every selected record must have a token"
syms = [p["token"]["symbol"] for p in sel]
assert len(syms) == len(set(syms)), "symbols must be unique"
assert all(p["token"] is None for p in prods if not p["include"])
lens = [len(p["token"]["description"]) for p in sel]
jsonschema.validate(prods, json.loads((P / "products.schema.json").read_text()))
print("tokens:", len(sel), "| unique symbols:", len(set(syms)),
      "| desc len min/max:", min(lens), max(lens))
print("sample:", [(p["token"]["name"], p["token"]["symbol"]) for p in sel[:5]])
print("OK")
PY
```
Expected: 100 tokens, 100 unique symbols, descriptions within `MAX_DESCRIPTION_LEN`, schema valid.

- [ ] **Step 4: Commit**

```bash
git add pipeline/pumptank_pipeline/config.py data/products.json data/products.schema.json
git commit -m "chore(data): regenerate products.json with token text metadata"
```

---

## Self-Review

- **Spec coverage:** config constants (Task 1) ✓; `TokenAssets` + token field + `to_product_fields` (Task 2) ✓; name de-smoosh + `NAME_OVERRIDES` (Tasks 3, 8) ✓; ticker derivation incl. `The`/suffix strip + truncate + uppercase (Task 4) ✓; spaced-dash junk detection + hybrid blurb + factual hook + disclaimer + length truncation (Task 5) ✓; ticker dedup + only-selected + rank-order determinism (Task 6) ✓; CLI wiring `rank→assets→assemble` (Task 7) ✓; schema regen via model + validation (Tasks 2, 8) ✓; real-data run + overrides (Task 8) ✓.
- **Placeholder scan:** none — every step has complete code/commands. `NAME_OVERRIDES` starts `{}` by design and is filled in Task 8 from real ids (an explicit, scripted step, not a placeholder).
- **Type consistency:** `generate_assets(pitches, *, max_ticker_len, max_description_len, disclaimer, name_overrides)` and helper signatures (`_clean_name(company_name, overrides, pitch_id)`, `_derive_symbol(clean_name, max_len)`, `_is_junk_blurb(description)`, `_compose_description(pitch, clean_name, *, disclaimer, max_len)`) are used identically across Tasks 3–7; `TokenAssets` fields (`name/symbol/description/mint`) match the model, the tests, and the CLI assertions; config names match between Task 1 and Task 7.
- **Defensive-only paths** (per spec review): ticker dedup, `TKN{rank}` fallback, and blurb truncation are unit-tested (Tasks 5, 6) though real data won't trigger them — intended.
