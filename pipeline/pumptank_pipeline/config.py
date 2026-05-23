from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DEFAULT_CSV = RAW_DIR / "shark_tank_us.csv"
DEFAULT_OUTPUT = DATA_DIR / "products.json"
DEFAULT_SCHEMA = DATA_DIR / "products.schema.json"

# Fail the run if more rows than this have a null/unparseable Got Deal flag.
MAX_NULL_GOT_DEAL = 10
