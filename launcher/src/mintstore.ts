import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

// Persists per-id mint secret keys to a git-ignored dir so a retry reuses the
// SAME mint (a duplicate create is rejected on-chain -> never a second token).
export class MintStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  getOrCreate(id: string): Keypair {
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
    }
    const kp = Keypair.generate();
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  }
}
