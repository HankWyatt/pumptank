# Shark Tank No-Deal Selection Stage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `rank` stage to the existing pipeline that scores every no-deal pitch by a blended, season-relative metric and marks the top N (default 100) for minting via the `include` flag.

**Architecture:** A new pure-Python module `rank.py` exposes `rank_and_select(pitches, *, weights, n, max_season)`, wired into the CLI as `ingest → filter → rank → assemble`. It partitions out out-of-scope (S17) and un-findable pitches, scores the rest (`0.45·reach + 0.30·ambition + 0.25·findability`), ranks deterministically, and annotates each record with a `Selection` block. Ingest gains two new columns (`US Viewership`, `Company Website`); `models.py` gains the `Selection` type and wires both through `to_product_fields`.

**Tech Stack:** Python 3, pandas (ingest only), pydantic v2, pytest, jsonschema.

**Spec:** `docs/superpowers/specs/2026-05-23-shark-tank-no-deal-selection-design.md`

**Run all tests from `pipeline/` with:** `PYTHONPATH=. pytest -q` (or `cd pipeline && pytest -q`). The repo has no installed console script; tests import `pumptank_pipeline` from the package dir.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `pipeline/pumptank_pipeline/config.py` | modify | add `SELECTION_WEIGHTS`, `SELECT_TOP_N`, `MAX_SEASON` |
| `pipeline/pumptank_pipeline/models.py` | modify | add `Selection`; add fields to `Pitch`/`Product`; wire `to_product_fields` |
| `pipeline/pumptank_pipeline/ingest.py` | modify | map + populate `us_viewership`, `company_website` |
| `pipeline/pumptank_pipeline/rank.py` | **create** | percentile helper + `rank_and_select` (scoring, floor, season cap, select) |
| `pipeline/pumptank_pipeline/cli.py` | modify | insert `rank` between `filter` and `assemble` |
| `pipeline/tests/conftest.py` | modify | add the two new columns to `_BASE_ROW` |
| `pipeline/tests/test_rank.py` | **create** | unit tests for `_pct_rank` and `rank_and_select` |
| `pipeline/tests/test_models.py` | modify | tests for `Selection` + `to_product_fields` wiring |
| `pipeline/tests/test_ingest.py` | modify | test new columns captured |
| `pipeline/tests/test_config.py` | **create** | test selection constants |
| `pipeline/tests/test_cli.py` | modify | integration test for selection annotation |

`assemble.py` needs **no change** — it regenerates the schema from `Product.model_json_schema()`, which picks up the new fields automatically once the model changes.

---

### Task 1: Selection config constants

**Files:**
- Modify: `pipeline/pumptank_pipeline/config.py`
- Test: `pipeline/tests/test_config.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_config.py
from pumptank_pipeline import config


def test_selection_config_present_and_valid():
    assert config.SELECT_TOP_N == 100
    assert config.MAX_SEASON == 16
    assert set(config.SELECTION_WEIGHTS) == {"reach", "ambition", "findability"}
    assert abs(sum(config.SELECTION_WEIGHTS.values()) - 1.0) < 1e-9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py -q`
Expected: FAIL with `AttributeError: module ... has no attribute 'SELECT_TOP_N'`

- [ ] **Step 3: Add the constants**

Append to `pipeline/pumptank_pipeline/config.py`:

```python

# --- Selection stage (sub-project 1b) ---
# Blended-score weights; must sum to 1.0.
SELECTION_WEIGHTS = {"reach": 0.45, "ambition": 0.30, "findability": 0.25}
SELECT_TOP_N = 100          # how many pitches to mark for minting
MAX_SEASON = 16             # exclude the partial Season 17 this round
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/config.py pipeline/tests/test_config.py
git commit -m "feat(pipeline): add selection-stage config constants"
```

---

### Task 2: `Selection` model + new `Pitch`/`Product` fields + `to_product_fields` wiring

**Files:**
- Modify: `pipeline/pumptank_pipeline/models.py`
- Test: `pipeline/tests/test_models.py`

**Context:** `to_product_fields` currently builds **no `Media`** (verified, models.py:56-68), so `former_website` is always null. This task adds the website + viewership + selection plumbing. `Selection` must be defined *before* `Pitch` (which references it).

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_models.py`:

```python
def test_selection_defaults():
    from pumptank_pipeline.models import Selection
    s = Selection()
    assert s.selected is False
    assert s.rank is None
    assert s.score is None
    assert s.excluded_reason is None


def test_to_product_fields_wires_website_viewership_selection():
    from pumptank_pipeline.models import Pitch, Product, to_product_fields, Selection
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              founders=["A"], company_website="https://x", us_viewership=4.2,
              selection=Selection(selected=True, rank=3, score=0.9),
              include=True, got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.media.former_website == "https://x"
    assert prod.us_viewership == 4.2
    assert prod.selection.rank == 3
    assert prod.selection.selected is True
    assert prod.include is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py -q`
Expected: FAIL — `Pitch` has no `company_website`/`us_viewership`/`selection`, and `prod.media.former_website` is `None`.

- [ ] **Step 3: Implement the model changes**

In `pipeline/pumptank_pipeline/models.py`, add the `Selection` class immediately after the imports (before `Pitch`):

```python
class Selection(BaseModel):
    selected: bool = False
    rank: Optional[int] = None
    score: Optional[float] = None
    reach: Optional[float] = None
    ambition: Optional[float] = None
    findability: Optional[float] = None
    excluded_reason: Optional[str] = None  # "out_of_scope_season" | "unfindable" | None
```

Add these fields to `Pitch` (after `got_deal: bool`):

```python
    us_viewership: Optional[float] = None
    company_website: Optional[str] = None
    selection: Optional[Selection] = None
    include: bool = True
```

Add these fields to `Product` (after `media: Media = ...`, before `include`):

```python
    us_viewership: Optional[float] = None
    selection: Optional[Selection] = None
```

Replace `to_product_fields` with:

```python
def to_product_fields(pitch: Pitch) -> dict:
    """Map a Pitch onto Product constructor kwargs (used by assemble.py)."""
    return dict(
        id=pitch.id, season=pitch.season, episode=pitch.episode,
        pitch_number=pitch.pitch_number, air_date=pitch.air_date,
        company_name=pitch.company_name,
        founders=pitch.founders, industry=pitch.industry,
        pitch=PitchDetail(
            ask_amount=pitch.ask_amount, ask_equity=pitch.ask_equity,
            valuation_requested=pitch.valuation_requested,
            description=pitch.description,
        ),
        media=Media(former_website=pitch.company_website),
        us_viewership=pitch.us_viewership,
        selection=pitch.selection,
        include=pitch.include,
    )
```

- [ ] **Step 4: Run tests to verify they pass (and nothing regressed)**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_models.py tests/test_assemble.py -q`
Expected: PASS (existing assemble tests still green — `Media` default `image_source` stays `"none"`, `include` stays `True`).

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/models.py pipeline/tests/test_models.py
git commit -m "feat(pipeline): add Selection model and wire website/viewership through to_product_fields"
```

---

### Task 3: Ingest the two new columns

**Files:**
- Modify: `pipeline/tests/conftest.py` (FIRST — see context)
- Modify: `pipeline/pumptank_pipeline/ingest.py`
- Test: `pipeline/tests/test_ingest.py`

**Context — order matters:** Adding entries to `COLUMN_MAP` makes ingest's missing-column guard (ingest.py:89-94) **require** those columns in *every* CSV. The shared fixture `_BASE_ROW` in `conftest.py` must gain them in the same commit, or every ingest/cli test will raise `IngestError`. Update `conftest.py` first.

- [ ] **Step 1: Update the shared fixture**

In `pipeline/tests/conftest.py`, add two keys to `_BASE_ROW` (e.g. after the `"Got Deal": 0,` line):

```python
    "US Viewership": 5.0, "Company Website": "https://doorbot.example",
```

- [ ] **Step 2: Write the failing test**

Append to `pipeline/tests/test_ingest.py`:

```python
def test_captures_viewership_and_website(sample_csv):
    pitches = load_pitches(sample_csv)
    doorbot = next(p for p in pitches if p.company_name == "DoorBot")
    assert doorbot.us_viewership == 5.0
    assert doorbot.company_website == "https://doorbot.example"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_ingest.py::test_captures_viewership_and_website -q`
Expected: FAIL — `doorbot.us_viewership` is `None` (column not yet mapped/populated).

- [ ] **Step 4: Map and populate the columns**

In `pipeline/pumptank_pipeline/ingest.py`, add to `COLUMN_MAP` (after the `"got_deal"` entry):

```python
    "us_viewership": "US Viewership",
    "company_website": "Company Website",
```

In the same file, inside the `Pitch(...)` construction in `load_pitches` (after `got_deal=got,`), add:

```python
            us_viewership=_opt_float(row[COLUMN_MAP["us_viewership"]]),
            company_website=_opt_str(row[COLUMN_MAP["company_website"]]),
```

- [ ] **Step 5: Run the full ingest suite to verify pass + no regression**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_ingest.py -q`
Expected: PASS (all ingest tests, including `test_missing_column_raises`, still green because `_BASE_ROW` now carries the new columns).

- [ ] **Step 6: Commit**

```bash
git add pipeline/pumptank_pipeline/ingest.py pipeline/tests/conftest.py pipeline/tests/test_ingest.py
git commit -m "feat(pipeline): ingest US Viewership and Company Website columns"
```

---

### Task 4: `_pct_rank` percentile helper

**Files:**
- Create: `pipeline/pumptank_pipeline/rank.py`
- Test: `pipeline/tests/test_rank.py` (create)

**Context:** Average-rank percentile in `[0,1]` matching pandas `rank(pct=True)` (ties share the averaged rank). `None` values score `0.0` and don't join the ranked population.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_rank.py
from pumptank_pipeline.rank import _pct_rank


def test_pct_rank_basic_with_ties():
    assert _pct_rank([10, 20, 20, 30]) == [0.25, 0.625, 0.625, 1.0]


def test_pct_rank_nulls_score_zero():
    assert _pct_rank([None, 5.0]) == [0.0, 1.0]


def test_pct_rank_empty_and_all_null():
    assert _pct_rank([]) == []
    assert _pct_rank([None, None]) == [0.0, 0.0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_rank.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'pumptank_pipeline.rank'`

- [ ] **Step 3: Implement the helper**

Create `pipeline/pumptank_pipeline/rank.py`:

```python
import warnings
from collections import defaultdict
from typing import Optional

from .models import Pitch, Selection


def _pct_rank(values: list[Optional[float]]) -> list[float]:
    """Average-rank percentile in [0,1] (pandas rank(pct=True) semantics).

    None values score 0.0 and are excluded from the ranked population.
    """
    out = [0.0] * len(values)
    present = [(i, v) for i, v in enumerate(values) if v is not None]
    n = len(present)
    if n == 0:
        return out
    present.sort(key=lambda iv: iv[1])
    i = 0
    while i < n:
        j = i
        while j < n and present[j][1] == present[i][1]:
            j += 1
        avg_rank = (i + 1 + j) / 2.0  # mean of 1-based ranks (i+1)..j
        for k in range(i, j):
            out[present[k][0]] = avg_rank / n
        i = j
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_rank.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/rank.py pipeline/tests/test_rank.py
git commit -m "feat(pipeline): add average-rank percentile helper"
```

---

### Task 5: `rank_and_select` — scoring, floor, season cap, selection

**Files:**
- Modify: `pipeline/pumptank_pipeline/rank.py`
- Test: `pipeline/tests/test_rank.py`

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_rank.py`:

```python
import pytest
from pumptank_pipeline.models import Pitch
from pumptank_pipeline.rank import rank_and_select

W = {"reach": 0.45, "ambition": 0.30, "findability": 0.25}


def _p(pid, season=5, viewership=5.0, valuation=1_000_000.0,
       founders=("A",), website="https://x"):
    return Pitch(id=pid, season=season, episode=1, pitch_number=1,
                 company_name=pid, founders=list(founders),
                 company_website=website, us_viewership=viewership,
                 valuation_requested=valuation, got_deal=False)


def test_season_above_max_excluded():
    [p] = rank_and_select([_p("a", season=17)], weights=W, n=10, max_season=16)
    assert p.include is False
    assert p.selection.selected is False
    assert p.selection.excluded_reason == "out_of_scope_season"
    assert p.selection.rank is None


def test_unfindable_excluded():
    [p] = rank_and_select([_p("a", founders=(), website=None)],
                          weights=W, n=10, max_season=16)
    assert p.selection.excluded_reason == "unfindable"
    assert p.include is False


def test_founder_only_and_site_only_survive_floor():
    out = rank_and_select(
        [_p("f", founders=("A",), website=None),
         _p("s", founders=(), website="https://y")],
        weights=W, n=10, max_season=16)
    assert all(p.selection.excluded_reason is None for p in out)
    assert all(p.selection.findability == 0.5 for p in out)


def test_top_n_selected_and_ranked():
    pitches = [_p(f"p{i}", viewership=float(i)) for i in range(5)]
    out = rank_and_select(pitches, weights=W, n=2, max_season=16)
    assert sum(1 for p in out if p.include) == 2
    assert [out[0].selection.rank, out[1].selection.rank] == [1, 2]
    assert out[0].selection.selected is True


def test_higher_viewership_ranks_higher():
    out = rank_and_select(
        [_p("low", viewership=1.0), _p("high", viewership=9.0)],
        weights=W, n=2, max_season=16)
    assert out[0].id == "high"
    assert out[0].selection.reach == 1.0


def test_pool_smaller_than_n_warns_and_selects_all():
    with pytest.warns(UserWarning, match="< N"):
        out = rank_and_select([_p("a")], weights=W, n=100, max_season=16)
    assert out[0].include is True


def test_deterministic_id_tiebreak():
    out = rank_and_select([_p("bbb"), _p("aaa")], weights=W, n=2, max_season=16)
    assert [p.id for p in out] == ["aaa", "bbb"]


def test_include_equals_selected_for_every_record():
    pitches = [_p(f"p{i}", viewership=float(i)) for i in range(5)]
    pitches.append(_p("old", season=17))
    pitches.append(_p("ghost", founders=(), website=None))
    out = rank_and_select(pitches, weights=W, n=2, max_season=16)
    for p in out:
        assert p.include == p.selection.selected


def test_bad_weights_raise():
    with pytest.raises(ValueError, match="sum to 1.0"):
        rank_and_select([_p("a")],
                        weights={"reach": 1, "ambition": 1, "findability": 1},
                        n=1, max_season=16)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_rank.py -q`
Expected: FAIL with `ImportError: cannot import name 'rank_and_select'`

- [ ] **Step 3: Implement `rank_and_select`**

Append to `pipeline/pumptank_pipeline/rank.py`:

```python
def rank_and_select(
    pitches: list[Pitch], *, weights: dict, n: int, max_season: int
) -> list[Pitch]:
    """Annotate every pitch with a Selection and set `include` for the top N.

    Returns all pitches: the ranked pool first (rank order), excluded pitches
    after (id order). Pure function aside from mutating the passed Pitches.
    """
    if abs(sum(weights.values()) - 1.0) > 1e-9:
        raise ValueError(f"weights must sum to 1.0, got {weights}")

    pool: list[Pitch] = []
    excluded: list[Pitch] = []
    for p in pitches:
        if p.season > max_season:
            p.selection = Selection(excluded_reason="out_of_scope_season")
            p.include = False
            excluded.append(p)
        elif not p.founders and not p.company_website:
            p.selection = Selection(excluded_reason="unfindable")
            p.include = False
            excluded.append(p)
        else:
            pool.append(p)

    # reach = viewership percentile WITHIN season
    by_season: dict[int, list[Pitch]] = defaultdict(list)
    for p in pool:
        by_season[p.season].append(p)
    reach: dict[str, float] = {}
    for members in by_season.values():
        for p, pct in zip(members, _pct_rank([m.us_viewership for m in members])):
            reach[p.id] = pct

    # ambition = valuation percentile across the whole pool
    ambition: dict[str, float] = {}
    for p, pct in zip(pool, _pct_rank([p.valuation_requested for p in pool])):
        ambition[p.id] = pct

    for p in pool:
        find = 0.5 * (1.0 if p.founders else 0.0) + \
               0.5 * (1.0 if p.company_website else 0.0)
        score = (weights["reach"] * reach[p.id]
                 + weights["ambition"] * ambition[p.id]
                 + weights["findability"] * find)
        p.selection = Selection(
            score=score, reach=reach[p.id], ambition=ambition[p.id],
            findability=find,
        )

    # deterministic: score/reach/ambition descending, id ascending
    pool.sort(key=lambda p: (-p.selection.score, -p.selection.reach,
                             -p.selection.ambition, p.id))
    for rank, p in enumerate(pool, start=1):
        p.selection.rank = rank
        p.selection.selected = rank <= n
        p.include = rank <= n

    if len(pool) < n:
        warnings.warn(f"candidate pool ({len(pool)}) < N ({n}); selecting all")

    excluded.sort(key=lambda p: p.id)
    return pool + excluded
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_rank.py -q`
Expected: PASS (all `_pct_rank` and `rank_and_select` tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/rank.py pipeline/tests/test_rank.py
git commit -m "feat(pipeline): add rank_and_select selection stage"
```

---

### Task 6: Wire `rank` into the CLI

**Files:**
- Modify: `pipeline/pumptank_pipeline/cli.py`
- Test: `pipeline/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Append to `pipeline/tests/test_cli.py`:

```python
def test_run_annotates_selection(csv_factory, base_row, tmp_path):
    rows = [
        dict(base_row),  # DoorBot S5 no-deal, findable -> selected
        dict(base_row, **{"Pitch Number": 2, "Startup Name": "OldCo",
                          "Season Number": 17}),                       # S17 -> excluded
        dict(base_row, **{"Pitch Number": 3, "Startup Name": "GhostCo",
                          "Entrepreneur Names": "", "Company Website": ""}),  # unfindable
        dict(base_row, **{"Pitch Number": 4, "Startup Name": "Acme",
                          "Got Deal": 1}),                             # deal -> filtered
    ]
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory(rows), out_path=out, schema_path=schema)
    data = {r["company_name"]: r for r in json.loads(out.read_text())}
    assert "Acme" not in data  # got a deal -> removed before ranking
    assert data["DoorBot"]["include"] is True
    assert data["DoorBot"]["selection"]["selected"] is True
    assert data["DoorBot"]["selection"]["rank"] == 1
    assert data["OldCo"]["selection"]["excluded_reason"] == "out_of_scope_season"
    assert data["GhostCo"]["selection"]["excluded_reason"] == "unfindable"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && PYTHONPATH=. pytest tests/test_cli.py::test_run_annotates_selection -q`
Expected: FAIL — `selection` key absent / `include` not toggled (rank not wired).

- [ ] **Step 3: Wire the stage**

In `pipeline/pumptank_pipeline/cli.py`, add the import (with the other stage imports):

```python
from .rank import rank_and_select
```

Replace the body of `run` with:

```python
def run(csv_path, out_path, schema_path) -> int:
    pitches = load_pitches(csv_path, config.MAX_NULL_GOT_DEAL)
    no_deal = filter_no_deal(pitches)
    ranked = rank_and_select(
        no_deal, weights=config.SELECTION_WEIGHTS,
        n=config.SELECT_TOP_N, max_season=config.MAX_SEASON,
    )
    write_products(ranked, out_path, schema_path)
    selected = sum(1 for p in ranked if p.include)
    print(f"{len(pitches)} pitches; {len(no_deal)} no-deal; "
          f"{selected} selected (top {config.SELECT_TOP_N}); wrote {out_path}")
    return selected
```

- [ ] **Step 4: Run the full suite to verify pass + no regression**

Run: `cd pipeline && PYTHONPATH=. pytest -q`
Expected: PASS — all tests. Note `test_run_end_to_end` still returns `1` (DoorBot is the sole findable S≤16 no-deal pitch → selected).

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/cli.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): wire rank stage into CLI (ingest->filter->rank->assemble)"
```

---

### Task 7: Run on the real dataset and commit the canonical output

**Files:**
- Generate: `data/products.json`, `data/products.schema.json`

**Context:** This produces the real selection-annotated output. The `config.DEFAULT_CSV` basename does not match the downloaded file, so pass `--input` explicitly.

- [ ] **Step 1: Run the pipeline on the real CSV**

Run:
```bash
cd pipeline && PYTHONPATH=. python -m pumptank_pipeline.cli \
  --input "../data/raw/Shark Tank US dataset.csv"
```
Expected output (numbers should match): `1481 pitches; 567 no-deal; 100 selected (top 100); wrote .../data/products.json`

- [ ] **Step 2: Verify the output integrity**

Run:
```bash
cd pipeline && PYTHONPATH=. python - <<'PY'
import json, collections
from pathlib import Path
import jsonschema
P = Path("../data")
prods = json.loads((P / "products.json").read_text())
sel = [r for r in prods if r["include"]]
assert len(sel) == 100, len(sel)
assert all(r["selection"]["selected"] for r in sel)
ranks = sorted(r["selection"]["rank"] for r in sel)
assert ranks == list(range(1, 101)), "selected ranks must be 1..100"
jsonschema.validate(prods, json.loads((P / "products.schema.json").read_text()))
reasons = collections.Counter(
    r["selection"]["excluded_reason"] for r in prods if not r["include"])
print("selected:", len(sel), "| excluded reasons:", dict(reasons))
print("OK: 100 selected, ranks 1..100 contiguous, schema valid")
PY
```
Expected: prints `OK: ...`; excluded reasons include `out_of_scope_season` (the 8 S17) and `unfindable` (the 84), plus `None` for scored-but-below-cut.

- [ ] **Step 3: Commit the regenerated output**

```bash
git add data/products.json data/products.schema.json
git commit -m "chore(data): regenerate products.json with top-100 selection"
```

(`data/raw/` stays git-ignored.)

---

## Self-Review

- **Spec coverage:** pool/floor/season-cap (Task 5) ✓; reach/ambition/findability + weights (Task 5, Task 1) ✓; 4-tuple deterministic sort incl. `id` (Task 5 `test_deterministic_id_tiebreak`) ✓; `selection` block + `us_viewership` schema additions (Task 2) ✓; `include == selected` invariant (Task 5 test) ✓; two new ingested columns + `former_website` wiring (Tasks 2, 3) ✓; CLI wiring `ingest→filter→rank→assemble` (Task 6) ✓; pool<N warns (Task 5) ✓; null viewership→0 (Task 4 `test_pct_rank_nulls_score_zero`) ✓; budget recorded in spec (no code) ✓; integration test uses explicit `--input` (Task 7) ✓.
- **Placeholder scan:** none — every code/test step shows complete code and exact commands.
- **Type consistency:** `rank_and_select(pitches, *, weights, n, max_season)` and `_pct_rank(values)` used identically in Tasks 4–6; `Selection` fields (`selected/rank/score/reach/ambition/findability/excluded_reason`) consistent across models, rank, and tests; `to_product_fields` kwargs match `Product` fields.
- **Known gap (intentional, per spec Non-goals):** manual-curation precedence on `include` is documented in the spec, not implemented here.
