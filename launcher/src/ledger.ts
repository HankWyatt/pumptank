import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import type { LaunchStatus, LedgerEntry } from "./types.js";

export class Ledger {
  private data: Record<string, LedgerEntry> = {};
  constructor(private path: string) {
    if (existsSync(path)) this.data = JSON.parse(readFileSync(path, "utf8"));
  }
  statusOf(id: string): LaunchStatus | undefined {
    return this.data[id]?.status;
  }
  get(id: string): LedgerEntry | undefined {
    return this.data[id];
  }
  record(entry: LedgerEntry): void {
    this.data[entry.id] = entry;
    const fd = openSync(this.path, "w");
    try {
      writeSync(fd, JSON.stringify(this.data, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
