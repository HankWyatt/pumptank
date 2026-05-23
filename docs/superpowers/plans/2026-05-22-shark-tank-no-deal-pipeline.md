# Shark Tank No-Deal Data Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python pipeline that turns the Kaggle Shark Tank US dataset into `data/products.json` — every pitch that got no deal (S1–S16), with show/pitch facts and a media stub.

**Architecture:** Three pure stages — `ingest` (CSV → normalized `Pitch[]`), `filter` (`Got Deal == 0`), `assemble` (`Pitch[]` → `Product[]` → JSON + JSON-Schema) — wired by a thin `cli`. All file I/O lives at the edges; the stage functions are pure and unit-tested with synthetic CSV fixtures (no live web, no real dataset needed for tests).

**Tech Stack:** Python 3.11+, pandas (CSV), pydantic v2 (models + JSON-Schema), pytest.

**Spec:** `docs/superpowers/specs/2026-05-22-shark-tank-no-deal-pipeline-design.md`

---

## File structure

| Path | Responsibility |
|---|---|
| `pipeline/pyproject.toml` | Package + deps + pytest config |
| `pipeline/pumptank_pipeline/config.py` | Repo-relative paths, the null threshold |
| `pipeline/pumptank_pipeline/models.py` | `Pitch` (internal) and `Product` (output) pydantic models |
| `pipeline/pumptank_pipeline/ingest.py` | `COLUMN_MAP`, CSV → `Pitch[]`, Got-Deal parsing + null guard |
| `pipeline/pumptank_pipeline/filter.py` | `filter_no_deal` — keeps `Got Deal == 0` only |
| `pipeline/pumptank_pipeline/assemble.py` | `Pitch → Product`, write `products.json` + `products.schema.json` |
| `pipeline/pumptank_pipeline/cli.py` | argparse entrypoint; runs the three stages |
| `pipeline/tests/conftest.py` | Synthetic CSV fixture |
| `pipeline/tests/test_*.py` | One test module per stage |
| `docs/dataset-license.md` | Recorded license decision (Task 1) |
| `data/raw/shark_tank_us.csv` | Source dataset (git-ignored) |
| `data/products.json` | Pipeline output |

Run all tests from `pipeline/` with `pytest -q`.

---

## Task 1: Scaffold + license gate

**Files:**
- Create: `pipeline/pyproject.toml`, `pipeline/pumptank_pipeline/__init__.py`, `pipeline/pumptank_pipeline/config.py`, `.gitignore`, `docs/dataset-license.md`
- Test: `pipeline/tests/test_smoke.py`

- [ ] **Step 1: Resolve the dataset license (gating prerequisite)**

Open the Kaggle dataset page <https://www.kaggle.com/datasets/thirumani/shark-tank-us-dataset> and record its stated license. Write `docs/dataset-license.md` with: the license string (or "unstated"), the date checked, and the decision. If the license is unstated/non-redistributable, note that **publishing** `data/products.json` relies on the "facts aren't copyrightable" posture (per the spec) and needs legal review — building privately is still fine.

```markdown
# Dataset license

- Source: https://www.kaggle.com/datasets/thirumani/shark-tank-us-dataset
- License (checked 2026-05-22): <record exactly what the page shows — e.g. "CC0: Public Domain", "Other (see description)", or "unstated">
- Decision: build the pipeline privately against the CSV. Publishing products.json
  is gated on the above; if unstated, publish facts only (no verbatim `description`
  text) and get legal review before launch.
```

- [ ] **Step 2: Download the CSV to `data/raw/shark_tank_us.csv`**

Download from the dataset page (or `kagglehub.dataset_download("thirumani/shark-tank-us-dataset")` if you have Kaggle creds) and place the CSV at `data/raw/shark_tank_us.csv`.

- [ ] **Step 3: Add `.gitignore`** (do not commit the source dataset)

```gitignore
# Source dataset (license-gated — do not redistribute)
data/raw/

# Python
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
.venv/
```

- [ ] **Step 4: Inspect the real CSV headers** (you'll reconcile `COLUMN_MAP` in Task 3)

Run: `python -c "import pandas as pd; print(list(pd.read_csv('data/raw/shark_tank_us.csv').columns))"`
Expected: a list of ~52 column names. Save it; Task 3 maps our field names onto these.

- [ ] **Step 5: Create `pipeline/pyproject.toml`**

```toml
[project]
name = "pumptank-pipeline"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["pandas>=2.0", "pydantic>=2.0"]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["."]
include = ["pumptank_pipeline*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 6: Create `pipeline/pumptank_pipeline/__init__.py`** (empty) and `config.py`

```python
# pipeline/pumptank_pipeline/config.py
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DEFAULT_CSV = RAW_DIR / "shark_tank_us.csv"
DEFAULT_OUTPUT = DATA_DIR / "products.json"
DEFAULT_SCHEMA = DATA_DIR / "products.schema.json"

# Fail the run if more rows than this have a null/unparseable Got Deal flag.
MAX_NULL_GOT_DEAL = 10
```

- [ ] **Step 7: Write the smoke test** `pipeline/tests/test_smoke.py`

```python
def test_package_imports():
    import pumptank_pipeline  # noqa: F401
    from pumptank_pipeline import config
    assert config.MAX_NULL_GOT_DEAL == 10
```

- [ ] **Step 8: Install + run the smoke test**

Run: `cd pipeline && pip install -e ".[dev]" && pytest -q tests/test_smoke.py`
Expected: 1 passed.

- [ ] **Step 9: Commit**

```bash
git add pipeline/pyproject.toml pipeline/pumptank_pipeline/__init__.py \
        pipeline/pumptank_pipeline/config.py pipeline/tests/test_smoke.py \
        .gitignore docs/dataset-license.md
git commit -m "feat(pipeline): scaffold package + record dataset license decision"
```

---

## Task 2: Data models

**Files:**
- Create: `pipeline/pumptank_pipeline/models.py`
- Test: `pipeline/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_models.py
from pumptank_pipeline.models import Pitch, Product, to_product_fields

def test_pitch_minimal():
    p = Pitch(id="s5e9p1-doorbot", season=5, episode=9, pitch_number=1,
              company_name="DoorBot", got_deal=False)
    assert p.founders == []
    assert p.got_deal is False

def test_product_is_nested_and_defaults():
    prod = Product(id="s5e9p1-doorbot", season=5, episode=9, pitch_number=1,
                   company_name="DoorBot", pitch={"ask_amount": 700000})
    assert prod.outcome.got_deal is False
    assert prod.media.image_source == "none"
    assert prod.include is True
    assert prod.token is None

def test_product_json_schema_generates():
    schema = Product.model_json_schema()
    assert schema["type"] == "object"
    assert "media" in schema["properties"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/test_models.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.models`.

- [ ] **Step 3: Write `models.py`**

```python
# pipeline/pumptank_pipeline/models.py
from typing import Literal, Optional
from pydantic import BaseModel, Field


class Pitch(BaseModel):
    """Normalized internal representation of one pitch (one CSV row)."""
    id: str
    season: int
    episode: int
    pitch_number: int
    air_date: Optional[str] = None
    company_name: str
    product_name: Optional[str] = None
    founders: list[str] = Field(default_factory=list)
    industry: Optional[str] = None
    ask_amount: Optional[float] = None
    ask_equity: Optional[float] = None
    valuation_requested: Optional[float] = None
    description: Optional[str] = None
    got_deal: bool


class PitchDetail(BaseModel):
    ask_amount: Optional[float] = None
    ask_equity: Optional[float] = None
    valuation_requested: Optional[float] = None
    description: Optional[str] = None


class Outcome(BaseModel):
    got_deal: bool = False  # always False by construction; kept for schema stability


class Media(BaseModel):
    image_url: Optional[str] = None
    image_source: Literal["dataset", "wayback", "none"] = "none"
    former_website: Optional[str] = None
    youtube_url: Optional[str] = None


class Product(BaseModel):
    id: str
    season: int
    episode: int
    pitch_number: int
    air_date: Optional[str] = None
    company_name: str
    product_name: Optional[str] = None
    founders: list[str] = Field(default_factory=list)
    industry: Optional[str] = None
    pitch: PitchDetail = Field(default_factory=PitchDetail)
    outcome: Outcome = Field(default_factory=Outcome)
    media: Media = Field(default_factory=Media)
    include: bool = True
    token: Optional[dict] = None


def to_product_fields(pitch: Pitch) -> dict:
    """Map a Pitch onto Product constructor kwargs (used by assemble.py)."""
    return dict(
        id=pitch.id, season=pitch.season, episode=pitch.episode,
        pitch_number=pitch.pitch_number, air_date=pitch.air_date,
        company_name=pitch.company_name, product_name=pitch.product_name,
        founders=pitch.founders, industry=pitch.industry,
        pitch=PitchDetail(
            ask_amount=pitch.ask_amount, ask_equity=pitch.ask_equity,
            valuation_requested=pitch.valuation_requested,
            description=pitch.description,
        ),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/test_models.py`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/models.py pipeline/tests/test_models.py
git commit -m "feat(pipeline): add Pitch and Product models"
```

---

## Task 3: Ingest (CSV → Pitch[], with Got-Deal parsing + null guard)

**Files:**
- Create: `pipeline/pumptank_pipeline/ingest.py`, `pipeline/tests/conftest.py`
- Test: `pipeline/tests/test_ingest.py`

- [ ] **Step 1: Write the fixture** `pipeline/tests/conftest.py`

```python
import pandas as pd
import pytest

# Column names mirror COLUMN_MAP values in ingest.py. If you reconcile COLUMN_MAP
# against the real CSV, update these keys to match.
_BASE_ROW = {
    "Season Number": 5, "Episode Number": 9, "Pitch Number": 1,
    "Startup Name": "DoorBot", "Industry": "Tech",
    "Original Ask Amount": 700000, "Original Offered Equity": 10,
    "Valuation Requested": 7000000, "Business Description": "Video doorbell",
    "Entrepreneur Names": "Jamie Siminoff", "Original Air Date": "2013-11-15",
    "Got Deal": 0,
}


def _write_csv(tmp_path, rows):
    path = tmp_path / "sample.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


@pytest.fixture
def sample_csv(tmp_path):
    no_deal = dict(_BASE_ROW)
    got_deal = dict(_BASE_ROW, **{
        "Pitch Number": 2, "Startup Name": "Acme Co", "Got Deal": 1})
    return _write_csv(tmp_path, [no_deal, got_deal])


@pytest.fixture
def csv_factory(tmp_path):
    def make(rows):
        return _write_csv(tmp_path, rows)
    return make


@pytest.fixture
def base_row():
    """A fresh copy of the canonical row, for tests that tweak one field."""
    return dict(_BASE_ROW)
```

- [ ] **Step 2: Write the failing test** `pipeline/tests/test_ingest.py`

```python
import pytest
from pumptank_pipeline.ingest import load_pitches, IngestError, COLUMN_MAP


def test_loads_and_normalizes(sample_csv):
    pitches = load_pitches(sample_csv)
    assert len(pitches) == 2
    doorbot = next(p for p in pitches if p.company_name == "DoorBot")
    assert doorbot.got_deal is False
    assert doorbot.founders == ["Jamie Siminoff"]
    assert doorbot.id == "s5e9p1-doorbot"
    assert doorbot.ask_amount == 700000.0


def test_splits_multiple_founders(csv_factory, base_row):
    row = dict(base_row, **{"Entrepreneur Names": "Alice & Bob, Carol"})
    pitches = load_pitches(csv_factory([row]))
    assert pitches[0].founders == ["Alice", "Bob", "Carol"]


def test_missing_column_raises(csv_factory, base_row):
    bad = {k: v for k, v in base_row.items() if k != "Got Deal"}
    with pytest.raises(IngestError, match="missing expected columns"):
        load_pitches(csv_factory([bad]))


def test_null_got_deal_skipped_below_threshold(csv_factory, base_row):
    good = dict(base_row)
    blank = dict(base_row, **{"Pitch Number": 2, "Got Deal": ""})
    pitches = load_pitches(csv_factory([good, blank]), max_null_got_deal=10)
    assert len(pitches) == 1  # blank skipped, not included


def test_too_many_null_got_deal_raises(csv_factory, base_row):
    rows = [dict(base_row, **{"Pitch Number": i, "Got Deal": ""}) for i in range(5)]
    with pytest.raises(IngestError, match="null/unparseable Got Deal"):
        load_pitches(csv_factory(rows), max_null_got_deal=2)


def test_ids_unique_within_episode(sample_csv):
    ids = [p.id for p in load_pitches(sample_csv)]
    assert len(ids) == len(set(ids))
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest -q tests/test_ingest.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.ingest`.

- [ ] **Step 4: Write `ingest.py`**

> After downloading the real CSV (Task 1, Step 4), reconcile the **values** in `COLUMN_MAP` with the actual headers. The keys (our field names) are fixed; only the values (CSV column names) may need editing.

```python
# pipeline/pumptank_pipeline/ingest.py
import math
import re

import pandas as pd

from .models import Pitch

# field name -> actual CSV column name. Reconcile values against the real header.
COLUMN_MAP = {
    "season": "Season Number",
    "episode": "Episode Number",
    "pitch_number": "Pitch Number",
    "company_name": "Startup Name",
    "industry": "Industry",
    "ask_amount": "Original Ask Amount",
    "ask_equity": "Original Offered Equity",
    "valuation_requested": "Valuation Requested",
    "description": "Business Description",
    "founders": "Entrepreneur Names",
    "air_date": "Original Air Date",
    "got_deal": "Got Deal",
}


class IngestError(Exception):
    pass


def _is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip() == ""


def _opt_str(value):
    return None if _is_blank(value) else str(value).strip()


def _opt_float(value):
    s = _opt_str(value)
    if s is None:
        return None
    try:
        return float(s.replace("$", "").replace(",", ""))
    except ValueError:
        return None


def _parse_got_deal(value):
    """1/0 -> True/False; blanks or anything else -> None (unknown)."""
    if _is_blank(value):
        return None
    s = str(value).strip().lower()
    if s in {"1", "1.0", "true", "yes"}:
        return True
    if s in {"0", "0.0", "false", "no"}:
        return False
    return None


def _parse_founders(value):
    s = _opt_str(value)
    if s is None:
        return []
    parts = re.split(r"\s*(?:,|;|&| and )\s*", s)
    return [p for p in (x.strip() for x in parts) if p]


def _slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s or "unknown"


def load_pitches(csv_path, max_null_got_deal: int = 10) -> list[Pitch]:
    df = pd.read_csv(csv_path)
    missing = [c for c in COLUMN_MAP.values() if c not in df.columns]
    if missing:
        raise IngestError(
            f"CSV missing expected columns: {missing}. "
            f"Reconcile COLUMN_MAP against actual headers: {list(df.columns)}"
        )

    pitches: list[Pitch] = []
    skipped = 0
    for _, row in df.iterrows():
        got = _parse_got_deal(row[COLUMN_MAP["got_deal"]])
        if got is None:
            skipped += 1
            continue
        season = int(row[COLUMN_MAP["season"]])
        episode = int(row[COLUMN_MAP["episode"]])
        pitch_number = int(row[COLUMN_MAP["pitch_number"]])
        company = _opt_str(row[COLUMN_MAP["company_name"]]) or "unknown"
        pitches.append(Pitch(
            id=f"s{season}e{episode}p{pitch_number}-{_slug(company)}",
            season=season, episode=episode, pitch_number=pitch_number,
            air_date=_opt_str(row[COLUMN_MAP["air_date"]]),
            company_name=company,
            founders=_parse_founders(row[COLUMN_MAP["founders"]]),
            industry=_opt_str(row[COLUMN_MAP["industry"]]),
            ask_amount=_opt_float(row[COLUMN_MAP["ask_amount"]]),
            ask_equity=_opt_float(row[COLUMN_MAP["ask_equity"]]),
            valuation_requested=_opt_float(row[COLUMN_MAP["valuation_requested"]]),
            description=_opt_str(row[COLUMN_MAP["description"]]),
            got_deal=got,
        ))

    if skipped > max_null_got_deal:
        raise IngestError(
            f"{skipped} rows with null/unparseable Got Deal "
            f"(threshold {max_null_got_deal}) — likely a column rename or parse error."
        )
    return pitches
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest -q tests/test_ingest.py`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add pipeline/pumptank_pipeline/ingest.py pipeline/tests/conftest.py pipeline/tests/test_ingest.py
git commit -m "feat(pipeline): ingest CSV to normalized Pitch[] with null guard"
```

---

## Task 4: Filter (Got Deal == 0 only)

**Files:**
- Create: `pipeline/pumptank_pipeline/filter.py`
- Test: `pipeline/tests/test_filter.py`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_filter.py
from pumptank_pipeline.filter import filter_no_deal
from pumptank_pipeline.models import Pitch


def _pitch(pid, got_deal):
    return Pitch(id=pid, season=1, episode=1, pitch_number=1,
                 company_name=pid, got_deal=got_deal)


def test_keeps_only_no_deal():
    kept = filter_no_deal([_pitch("a", False), _pitch("b", True)])
    assert [p.id for p in kept] == ["a"]


def test_a_deal_is_excluded_regardless_of_type():
    # got_deal True means the sharks did NOT pass -> excluded, even if it was
    # royalty-only / a loan / conditional. The filter only looks at got_deal.
    kept = filter_no_deal([_pitch("royalty-deal", True)])
    assert kept == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/test_filter.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.filter`.

- [ ] **Step 3: Write `filter.py`**

```python
# pipeline/pumptank_pipeline/filter.py
from .models import Pitch


def filter_no_deal(pitches: list[Pitch]) -> list[Pitch]:
    """Keep only pitches the sharks passed on (Got Deal == 0).

    The dataset's Royalty Deal / Loan / Deal-has-conditions columns are NOT
    inputs here — they only ever describe a row where got_deal is True, which is
    excluded anyway. Selection keys solely on got_deal.
    """
    return [p for p in pitches if not p.got_deal]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/test_filter.py`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/filter.py pipeline/tests/test_filter.py
git commit -m "feat(pipeline): add no-deal filter"
```

---

## Task 5: Assemble (Pitch[] → products.json + schema)

**Files:**
- Create: `pipeline/pumptank_pipeline/assemble.py`
- Test: `pipeline/tests/test_assemble.py`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_assemble.py
import json

from pumptank_pipeline.assemble import write_products
from pumptank_pipeline.models import Pitch


def _pitch(pid):
    return Pitch(id=pid, season=5, episode=9, pitch_number=1,
                 company_name="DoorBot", founders=["Jamie Siminoff"],
                 ask_amount=700000, ask_equity=10, valuation_requested=7000000,
                 description="Video doorbell", got_deal=False)


def test_writes_products_and_schema(tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    products = write_products([_pitch("s5e9p1-doorbot")], out, schema)

    assert len(products) == 1
    data = json.loads(out.read_text())
    rec = data[0]
    assert rec["id"] == "s5e9p1-doorbot"
    assert rec["pitch"]["ask_amount"] == 700000
    assert rec["outcome"]["got_deal"] is False
    assert rec["media"]["image_source"] == "none"
    assert rec["include"] is True
    assert json.loads(schema.read_text())["type"] == "object"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/test_assemble.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.assemble`.

- [ ] **Step 3: Write `assemble.py`**

```python
# pipeline/pumptank_pipeline/assemble.py
import json
from pathlib import Path
from typing import Optional

from .models import Pitch, Product, to_product_fields


def to_product(pitch: Pitch) -> Product:
    return Product(**to_product_fields(pitch))


def write_products(
    pitches: list[Pitch], out_path: Path, schema_path: Optional[Path] = None
) -> list[Product]:
    products = [to_product(p) for p in pitches]
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps([p.model_dump() for p in products], indent=2, ensure_ascii=False)
    )
    if schema_path is not None:
        schema_path = Path(schema_path)
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema_path.write_text(json.dumps(Product.model_json_schema(), indent=2))
    return products
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/test_assemble.py`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/assemble.py pipeline/tests/test_assemble.py
git commit -m "feat(pipeline): assemble products.json + JSON schema"
```

---

## Task 6: CLI (wire the three stages)

**Files:**
- Create: `pipeline/pumptank_pipeline/cli.py`
- Test: `pipeline/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_cli.py
import json

from pumptank_pipeline.cli import run


def test_run_end_to_end(sample_csv, tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    n = run(csv_path=sample_csv, out_path=out, schema_path=schema)

    assert n == 1  # only DoorBot (no deal); Acme Co got a deal -> excluded
    data = json.loads(out.read_text())
    assert [r["company_name"] for r in data] == ["DoorBot"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/test_cli.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.cli`.

- [ ] **Step 3: Write `cli.py`**

```python
# pipeline/pumptank_pipeline/cli.py
import argparse
from pathlib import Path

from . import config
from .assemble import write_products
from .filter import filter_no_deal
from .ingest import load_pitches


def run(csv_path, out_path, schema_path) -> int:
    pitches = load_pitches(csv_path, config.MAX_NULL_GOT_DEAL)
    no_deal = filter_no_deal(pitches)
    write_products(no_deal, out_path, schema_path)
    print(f"Loaded {len(pitches)} pitches; {len(no_deal)} no-deal; wrote {out_path}")
    return len(no_deal)


def main():
    ap = argparse.ArgumentParser(description="PUMPTANK Shark Tank no-deal pipeline")
    ap.add_argument("--input", type=Path, default=config.DEFAULT_CSV)
    ap.add_argument("--output", type=Path, default=config.DEFAULT_OUTPUT)
    ap.add_argument("--schema", type=Path, default=config.DEFAULT_SCHEMA)
    args = ap.parse_args()
    run(args.input, args.output, args.schema)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest -q tests/test_cli.py`
Expected: 1 passed.

- [ ] **Step 5: Run the full suite + the real pipeline**

Run: `pytest -q` (expected: all pass)
Run: `python -m pumptank_pipeline.cli` (uses the real CSV at `data/raw/shark_tank_us.csv`)
Expected: prints e.g. `Loaded ~1300 pitches; ~500 no-deal; wrote .../data/products.json`. Eyeball `data/products.json`: a known no-deal pitch present, a known on-air deal absent.

- [ ] **Step 6: Commit**

```bash
git add pipeline/pumptank_pipeline/cli.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): CLI wiring ingest->filter->assemble"
```

---

## Task 7 (OPTIONAL): Wayback image enrichment

Best-effort, non-blocking, deferred per the spec — implement only if a quick image link per pitch is wanted now (final art is sub-project #2). Skip without consequence.

**Files:**
- Create: `pipeline/pumptank_pipeline/media.py`
- Test: `pipeline/tests/test_media.py`

- [ ] **Step 1: Write the failing test** (network mocked — never hit the live API in tests)

```python
# pipeline/tests/test_media.py
from pumptank_pipeline.media import wayback_snapshot


def test_returns_none_on_no_snapshot(monkeypatch):
    monkeypatch.setattr("pumptank_pipeline.media._get_json",
                        lambda url, timeout=10: {"archived_snapshots": {}})
    assert wayback_snapshot("http://defunct.example") is None


def test_returns_url_when_available(monkeypatch):
    monkeypatch.setattr(
        "pumptank_pipeline.media._get_json",
        lambda url, timeout=10: {"archived_snapshots":
            {"closest": {"available": True, "url": "http://web.archive.org/x"}}})
    assert wayback_snapshot("http://defunct.example") == "http://web.archive.org/x"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/test_media.py`
Expected: FAIL — `ModuleNotFoundError: pumptank_pipeline.media`.

- [ ] **Step 3: Write `media.py`**

```python
# pipeline/pumptank_pipeline/media.py
import json
import urllib.parse
import urllib.request
from typing import Optional

_API = "https://archive.org/wayback/available?url="


def _get_json(url, timeout=10) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def wayback_snapshot(site_url: str) -> Optional[str]:
    """Return the closest Wayback snapshot URL, or None. Never raises."""
    if not site_url:
        return None
    try:
        data = _get_json(_API + urllib.parse.quote(site_url, safe=""))
    except Exception:
        return None
    closest = data.get("archived_snapshots", {}).get("closest")
    if closest and closest.get("available"):
        return closest.get("url")
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/test_media.py`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/pumptank_pipeline/media.py pipeline/tests/test_media.py
git commit -m "feat(pipeline): optional best-effort Wayback image lookup"
```

---

## Notes / deviations from the spec
- **Resumability / `--resume`:** omitted (YAGNI) — the CSV path runs in seconds with no
  network. Add interim caching only alongside Task 7 if Wayback lookups become slow.
- **`data/products.json` publishing** is gated on the Task 1 license decision; building
  and committing the *code* is unaffected.
- **`COLUMN_MAP`** is the single reconciliation point with the real dataset header
  (Task 1 Step 4 → Task 3 Step 4). Tests never touch the real file.
