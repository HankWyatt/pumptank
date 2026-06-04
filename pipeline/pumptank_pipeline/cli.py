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
    no_deal = filter_no_deal(pitches)
    ranked = rank_and_select(
        no_deal, weights=config.SELECTION_WEIGHTS,
        n=config.SELECT_TOP_N, max_season=config.MAX_SEASON,
        exclude_ids=config.EXCLUDE_IDS,
    )
    ranked = generate_assets(
        ranked, max_ticker_len=config.MAX_TICKER_LEN,
        max_description_len=config.MAX_DESCRIPTION_LEN,
        disclaimer=config.TOKEN_DISCLAIMER, name_overrides=config.NAME_OVERRIDES,
    )
    ranked = render_images(
        ranked, out_dir=config.IMAGE_DIR, font_dir=config.FONT_DIR,
        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE,
    )
    write_products(ranked, out_path, schema_path)
    selected = sum(1 for p in ranked if p.include)
    print(f"{len(pitches)} pitches; {len(no_deal)} no-deal; "
          f"{selected} selected (top {config.SELECT_TOP_N}); wrote {out_path}")
    return selected


def main():
    ap = argparse.ArgumentParser(description="PUMPTANK Shark Tank no-deal pipeline")
    ap.add_argument("--input", type=Path, default=config.DEFAULT_CSV)
    ap.add_argument("--output", type=Path, default=config.DEFAULT_OUTPUT)
    ap.add_argument("--schema", type=Path, default=config.DEFAULT_SCHEMA)
    args = ap.parse_args()
    run(args.input, args.output, args.schema)


if __name__ == "__main__":
    main()
