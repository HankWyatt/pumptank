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
