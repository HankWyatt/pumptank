import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { LedgerEntry } from "./types.js";

export interface BackfillResult {
  products: any[]; // updated records
  backfilled: string[]; // ids whose token.mint was newly set
  alreadySet: string[]; // ids already at the same mint (idempotent re-run)
  conflicts: string[]; // ids whose token.mint was set to a DIFFERENT value (left unchanged, flagged)
  notFound: string[]; // success ledger ids with no matching product record
}

/**
 * Copy launched mints from the launch ledger into the product records, matched by id.
 *
 * For each ledger entry with status === "success" AND a non-empty mint:
 *   - no matching record         -> notFound (cannot place the mint anywhere)
 *   - record.token.mint == null  -> set it to the ledger mint (backfilled)
 *   - record.token.mint === mint -> alreadySet (idempotent re-run, no change)
 *   - record.token.mint !== mint -> conflict (left UNCHANGED; a different mint is already
 *                                   recorded, which is a data-integrity red flag we surface
 *                                   rather than silently clobber)
 *
 * Pure: returns a NEW products array with fresh token objects for the records it changes,
 * and never mutates the caller's input (so dry-runs and re-runs are safe).
 */
export function backfillMints(ledger: Record<string, LedgerEntry>, products: any[]): BackfillResult {
  const backfilled: string[] = [];
  const alreadySet: string[] = [];
  const conflicts: string[] = [];
  const notFound: string[] = [];

  // The mint each product id should end up at, per the ledger (success + mint only).
  const wanted = new Map<string, string>();
  for (const entry of Object.values(ledger)) {
    if (entry.status === "success" && entry.mint) wanted.set(entry.id, entry.mint);
  }

  const seen = new Set<string>();
  const out = products.map((record) => {
    const mint = wanted.get(record.id);
    if (mint == null) return record; // no successful launch for this record -> untouched
    seen.add(record.id);

    const current = record.token?.mint ?? null;
    if (current == null) {
      backfilled.push(record.id);
      return { ...record, token: { ...record.token, mint } };
    }
    if (current === mint) {
      alreadySet.push(record.id);
      return record;
    }
    conflicts.push(record.id); // different mint already present -> leave unchanged, flag it
    return record;
  });

  // Any successful ledger mint that never matched a product record.
  for (const id of wanted.keys()) {
    if (!seen.has(id)) notFound.push(id);
  }

  return { products: out, backfilled, alreadySet, conflicts, notFound };
}

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "..", "data");
const LEDGER_PATH = join(DATA_DIR, "launch-ledger.json");
const PRODUCTS_PATH = join(DATA_DIR, "products.json");

function writeJsonAtomic(path: string, value: unknown): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export interface BackfillDeps {
  readLedger: () => Record<string, LedgerEntry>;
  readProducts: () => any[];
  writeProducts: (products: any[]) => void;
  log: (msg: string) => void;
}

export function defaultDeps(): BackfillDeps {
  return {
    readLedger: () => {
      if (!existsSync(LEDGER_PATH)) throw new Error("no launch ledger yet — nothing to backfill");
      return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<string, LedgerEntry>;
    },
    readProducts: () => JSON.parse(readFileSync(PRODUCTS_PATH, "utf8")) as any[],
    writeProducts: (products) => writeJsonAtomic(PRODUCTS_PATH, products),
    log: (msg) => console.log(msg),
  };
}

export function main(argv: string[], _env: Record<string, string | undefined>, deps: BackfillDeps = defaultDeps()): void {
  const confirm = argv.includes("--confirm");
  const force = argv.includes("--force");
  const log = deps.log;

  const ledger = deps.readLedger();
  const products = deps.readProducts();
  const r = backfillMints(ledger, products);

  log(
    `${r.backfilled.length} backfilled, ${r.alreadySet.length} already set, ${r.conflicts.length} conflicts, ${r.notFound.length} not-found`,
  );
  if (r.conflicts.length) log(`  conflicts (different mint already set, left unchanged): ${r.conflicts.join(", ")}`);
  if (r.notFound.length) log(`  not-found (successful launch, no matching product id): ${r.notFound.join(", ")}`);

  if (!confirm) {
    log("DRY RUN -- pass --confirm to write data/products.json");
    return;
  }

  if (r.conflicts.length && !force) {
    throw new Error(
      `refusing to write: ${r.conflicts.length} conflict(s) — a record already has a different mint. Pass --force to write anyway (conflicts stay unchanged).`,
    );
  }

  if (r.backfilled.length === 0) {
    log("nothing to write (no records changed).");
    return;
  }

  deps.writeProducts(r.products);
  log(`wrote ${r.backfilled.length} mint(s) to data/products.json`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2), process.env);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
