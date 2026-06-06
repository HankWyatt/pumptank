#!/usr/bin/env bash
# PUMPTANK fee auto-collect — sweeps BOTH creator-fee buckets (creator-vault +
# coin-creator "reward coins") to the house wallet. Installed via crontab.
# Run under `flock` so overlapping cron ticks can't double-fire. Most ticks are
# no-ops (the MIN_COLLECT_SOL dust gate skips trivial amounts, no tx sent).
set -eo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin"

LAUNCHER="/home/hank/Documents/git/st/launcher"
LOG="$LAUNCHER/fee-collect.log"

exec >> "$LOG" 2>&1   # all output (incl. errors) to the log
ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

echo "[$(ts)] collect start"
cd "$LAUNCHER"
set -a; . ./.env; set +a   # RPC_URL, WALLET (house key), MIN_COLLECT_SOL, ...
npm run --silent fees -- collect --confirm || echo "[$(ts)] collect exited non-zero"
echo "[$(ts)] collect end"
