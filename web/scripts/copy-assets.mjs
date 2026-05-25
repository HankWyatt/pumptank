import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "data", "token_images");
const dst = join(here, "..", "public", "token_images");
mkdirSync(dirname(dst), { recursive: true });
if (existsSync(src)) { cpSync(src, dst, { recursive: true }); console.log(`copied token_images -> ${dst}`); }
else console.warn(`no token_images at ${src} (skipping)`);
