from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DEFAULT_CSV = RAW_DIR / "shark_tank_us.csv"
DEFAULT_OUTPUT = DATA_DIR / "products.json"
DEFAULT_SCHEMA = DATA_DIR / "products.schema.json"

# Fail the run if more rows than this have a null/unparseable Got Deal flag.
MAX_NULL_GOT_DEAL = 10

# --- Selection stage (sub-project 1b) ---
# Blended-score weights; must sum to 1.0.
SELECTION_WEIGHTS = {"reach": 0.45, "ambition": 0.30, "findability": 0.25}
SELECT_TOP_N = 100          # how many pitches to mark for minting
MAX_SEASON = 16             # exclude the partial Season 17 this round

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
