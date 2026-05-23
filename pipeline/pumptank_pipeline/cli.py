import argparse
from pathlib import Path

from . import config
from .assemble import write_products
from .filter import filter_no_deal
from .ingest import load_pitches
from .rank import rank_and_select


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


def main():
    ap = argparse.ArgumentParser(description="PUMPTANK Shark Tank no-deal pipeline")
    ap.add_argument("--input", type=Path, default=config.DEFAULT_CSV)
    ap.add_argument("--output", type=Path, default=config.DEFAULT_OUTPUT)
    ap.add_argument("--schema", type=Path, default=config.DEFAULT_SCHEMA)
    args = ap.parse_args()
    run(args.input, args.output, args.schema)


if __name__ == "__main__":
    main()
