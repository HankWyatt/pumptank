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

# --- Hand-curated corrections layered on the raw CSV (2026-06-04) ---
# The third-party dataset's "Got Deal" column is unreliable: it records some
# companies that closed an on-air deal as no-deal. Correct verified errors here
# so a pipeline re-run stays consistent with the hand-verified launch set.
GOT_DEAL_OVERRIDES: dict[str, bool] = {
    "s5e21p344-packbackbooks": True,  # closed Mark Cuban's deal on air; CSV wrongly says 0
}
# No-deal companies excluded for editorial reasons (too big / exited / unlikely
# to engage with an unofficial parody tribute). id -> excluded_reason.
# Verified by the 2026-06-04 web sweep (docs/too-big-sweep-2026-06-04.md).
EXCLUDE_IDS: dict[str, str] = {
    "s8e14p667-getaway": "out_of_scope_scale",        # ~$1B acquisition
    "s5e22p351-kodiakcakes": "out_of_scope_scale",    # ~$200M; L Catterton PE majority (2021)
    "s2e1p68-copadivino": "out_of_scope_scale",       # acquired by public co Splash Beverage (SBEV)
    "s6e7p406-singtrix": "out_of_scope_scale",        # acquired by Embracer Group (public)
    "s3e1p104-businessghost": "out_of_scope_scale",   # acquired by Advantage Media / Forbes Books
    "s6e26p482-buckmason": "out_of_scope_scale",      # ~$100M/yr national retailer
    "s6e13p431-coffeemeetsbagel": "out_of_scope_scale",  # acquired by Match Group (~$100M)
    "s5e27p370-thebouqscompany": "out_of_scope_scale",   # ~$100M raised
    "s6e18p451-himalayandogchew": "out_of_scope_scale",  # PE-acquired (Kinderhook/Prairie Dog)
    "s9e1p711-simplehabit": "out_of_scope_scale",     # acquired by Ingenio
    "s5e15p322-fitdeck": "out_of_scope_scale",        # acquired by Implus Footcare
    "s6e19p455-lumi": "out_of_scope_scale",           # acquired by Narvar, then shut down
    "s6e23p469-brandyourself": "out_of_scope_scale",  # acquired by Array
    "s4e14p215-xeroshoes": "out_of_scope_scale",      # ~$64M rev, PE-backed (TZP), SEC filer
    "s6e19p454-ssekodesigns": "out_of_scope_scale",   # merged into Noonday Collection
    "s5e11p307-virtuixomni": "out_of_scope_scale",    # IPO'd (Nasdaq: VTIX, Jan 2026)
}

# --- Token text metadata (sub-project 2a) ---
MAX_TICKER_LEN = 10            # conservative; confirm pump.fun's symbol limit in #3
MAX_DESCRIPTION_LEN = 480      # conservative; confirm pump.fun's limit in #3
TOKEN_DISCLAIMER = (
    "Unofficial fan tribute & parody token. Not affiliated with or endorsed by "
    "the company, its founders, or Shark Tank / ABC / Sony. Not financial advice; "
    "no promise of value."
)
# Description tails appended after the product blurb. No-deal keeps the "— no
# deal" hook; deal products get a neutral tail (on the show, no claim about
# terms). "{disclaimer}" is filled at compose time.
NO_DEAL_DESCRIPTION_TAIL = " Pitched on Shark Tank S{season}E{episode} — no deal. {disclaimer}"
DEAL_DESCRIPTION_TAIL = " Pitched on Shark Tank S{season}E{episode}. {disclaimer}"
# product id -> hand-fixed display name, for names the de-smoosh regex mangles
# (letter<->digit boundaries it doesn't split).
NAME_OVERRIDES: dict[str, str] = {
    "s5e18p333-buzzy4shots": "Buzzy 4 Shots",
    "s1e3p14-50statecapitalsin50minutes": "50 State Capitals in 50 Minutes",
    # 2026-06-04 curation backfills (replaced Packback/Getaway + too-big sweep)
    "s3e7p127-scottevest": "ScotteVest",
    "s13e19p1166-busybox": "BusyBox",
    "s4e9p194-revestor": "ReVestor",
    "s5e11p305-spirithoods": "SpiritHoods",
    "s5e21p347-morninghead": "MorningHead",
    "s2e3p76-pureayre": "PureAyre",
    "s16e16p1422-airtulip": "AirTulip",
    "s14e19p1262-burlap-barrel": "Burlap & Barrel",
    "s13e7p1118-love-pebble": "Love & Pebble",
}

# --- Token images (sub-project 2b) ---
IMAGE_DIR = DATA_DIR / "token_images"
IMAGE_SIZE = 1000
FONT_DIR = Path(__file__).parent / "fonts"
IMAGE_PALETTE = {
    "bg": (11, 32, 39), "accent": (51, 214, 177), "fin": (16, 46, 54),
    "text": (240, 245, 246), "muted": (140, 161, 166),
}
