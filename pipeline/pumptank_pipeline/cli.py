import argparse
from pathlib import Path

from . import config
from .assemble import write_products
from .assets import generate_assets
from .filter import filter_no_deal
from .images import render_images
from .ingest import load_pitches
from .rank import rank_and_select


def run(csv_path, out_path, schema_path) -> int:
    pitches = load_pitches(csv_path, config.MAX_NULL_GOT_DEAL)
    for p in pitches:                       # correct verified bad CSV got_deal values
        if p.id in config.GOT_DEAL_OVERRIDES:
            p.got_deal = config.GOT_DEAL_OVERRIDES[p.id]

    # All-products: every product launches as CREATE-ONLY (no dev-buy). The
    # ranking below only annotates an editorial selection for the website's sort;
    # the dev-buy is reserved for the index token (set elsewhere), not products.
    for p in pitches:
        p.include = True
        p.dev_buy = False

    no_deal = filter_no_deal(pitches)
    ranked = rank_and_select(           # editorial rank/selection only — no dev_buy
        no_deal, weights=config.SELECTION_WEIGHTS,
        n=config.SELECT_TOP_N, max_season=config.MAX_SEASON,
        exclude_ids=config.EXCLUDE_IDS,
    )

    # Deterministic write order: ranked/dev-buy no-deal first (rank order, then
    # excluded by id — as rank_and_select returns), then the rest by id.
    ranked_ids = {p.id for p in ranked}
    rest = sorted((p for p in pitches if p.id not in ranked_ids), key=lambda p: p.id)
    ordered = ranked + rest

    # Generate token text + card images for the full launched set, then write all.
    ordered = generate_assets(
        ordered, max_ticker_len=config.MAX_TICKER_LEN,
        max_description_len=config.MAX_DESCRIPTION_LEN, max_name_len=config.MAX_NAME_LEN,
        disclaimer=config.TOKEN_DISCLAIMER, name_overrides=config.NAME_OVERRIDES,
    )
    ordered = render_images(
        ordered, out_dir=config.IMAGE_DIR, font_dir=config.FONT_DIR,
        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE, logo_dir=config.LOGO_DIR,
    )
    write_products(ordered, out_path, schema_path)

    launched = sum(1 for p in ordered if p.include)
    got_deal = sum(1 for p in ordered if p.got_deal)
    print(f"{len(pitches)} pitches; {launched} launched (create-only); "
          f"{got_deal} got-deal / {len(no_deal)} no-deal; wrote {out_path}")
    return launched


def main():
    ap = argparse.ArgumentParser(description="PUMPTANK Shark Tank no-deal pipeline")
    ap.add_argument("--input", type=Path, default=config.DEFAULT_CSV)
    ap.add_argument("--output", type=Path, default=config.DEFAULT_OUTPUT)
    ap.add_argument("--schema", type=Path, default=config.DEFAULT_SCHEMA)
    args = ap.parse_args()
    run(args.input, args.output, args.schema)


if __name__ == "__main__":
    main()
