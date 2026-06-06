# Symbol review vs. 8-char display cap — 2026-06-05

Trigger: many third-party sites that display token symbols (screeners/wallets) cap at **8 characters**. pump.fun's own hard cap is 10 (Metaplex), which all 1,481 symbols already satisfy. This review is about *display legibility* on the 8-char sites.

## The numbers

Current symbol length distribution (all ASCII, so chars == bytes):

| len | count |  | len | count |
|----:|------:|--|----:|------:|
| 2 | 2 | | 7 | 140 |
| 3 | 8 | | **8** | **164** |
| 4 | 40 | | **9** | **186** |
| 5 | 77 | | **10** | **767** |
| 6 | 97 | | | |

- **≤8 chars (display fully): 528 (36%)**
- **>8 chars (get truncated on the 8-char sites): 953 (64%)**

## Key finding: naively capping the derivation at 8 is pointless

`_derive_symbol` builds a symbol by jamming a name's words together and slicing to the cap. Dropping the cap 10→8 just chops the last 1–2 chars:

```
HAVENLOCK  -> HAVENLOC      WILDEARTH  -> WILDEART
JOLLYROGER -> JOLLYROG      FINALSTRAW -> FINALSTR
SMARTTIRE  -> SMARTTIR      ADVENTUREH -> ADVENTUR
```

A site that caps at 8 already shows `HAVENLOC` / `SMARTTIR` regardless of whether the on-chain symbol is 8 or 9+ chars. So mechanical truncation **buys zero readability** — it just produces strings that look as cut-off as the display already is, while forcing a full metadata + card-image + re-stage redo. Not worth doing.

The only way to actually *win* on an 8-char display is a **smarter short form** whose 8 chars read as intended: `Smart Tire Company → SMART`, `Press Waffle → WAFFLE`, `Wild Earth → WILD`.

## The 953 break down into 3 shortening difficulties

| Bucket | Count | What it needs |
|---|---:|---|
| (b) multi-word, a word already fits ≤8 | 801 | pick the *distinctive* word (often NOT the first) |
| (a) single long word | 89 | a real abbreviation / clip |
| (c) multi-word, no word fits | 63 | per-name judgment |

**No deterministic rule does (b) well** — "first word" gives good results (`SMART`, `BELLO`, `BUZZY`, `HEATHER`, `WAFFLE`) but also garbage (`Fat Ass Fudge→FAT`, `Eco Nuts Soap→ECO`, `Sub Zero Ice Cream→SUB`) where the meaningful word is the 2nd/3rd. So ~953 symbols genuinely need per-name judgment (LLM-proposed + human spot-check), captured as a `SYMBOL_OVERRIDES` map (additive, like `NAME_OVERRIDES`).

## Blast radius of changing symbols (why timing matters now)

A symbol is embedded in **3 places** + the on-chain arg:
1. `data/products.json` `token.symbol` (read at launch → on-chain symbol)
2. card PNG `data/token_images/*.png` (renders `$SYMBOL`)
3. metadata JSON `data/metadata/m/*.json` (embeds symbol) → must be re-staged to the DO Space

Since you're staging metadata **right now**, settle symbols *before* finalizing the upload, or the staged JSON goes stale.

## Options

- **A — Leave as-is.** All symbols are pump.fun-valid (≤10). Accept that 64% show truncated on 8-char third-party sites (pump.fun shows them in full). Zero work, zero metadata churn.
- **B — Smart-shorten all 953 to clean ≤8 tickers.** LLM proposes a recognizable ≤8 ticker per product (using name + pitch/industry), dedup, human spot-check, write `SYMBOL_OVERRIDES`, regen symbols + cards + metadata. Best display result; largest effort; redo metadata/cards.
- **C — Hybrid.** Only fix a curated subset (e.g. the dev-buy/index + highest-viewership tokens), leave the long tail truncated.
