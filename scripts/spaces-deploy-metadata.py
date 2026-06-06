#!/usr/bin/env python3
"""Stage token metadata + images to a DigitalOcean Space (S3-compatible) so the
on-chain `uri` (meta.thepumptank.fun/m/<id>.json) resolves.

Uploads, per token id:
  - m/<id>.json   from data/metadata/m/<id>.json   (Content-Type application/json)
  - img/<id>.png  from the path in data/metadata/images.json (Content-Type image/png)
all public-read, plus a permissive GET CORS rule on the bucket (wallets/pump.fun fetch
these client-side). Idempotent; skips objects whose size+content already match.

Run `scripts/build-token-metadata.py` first. Then:

  # credentials (generate via: doctl spaces keys create pumptank-meta)
  export SPACES_KEY=...        SPACES_SECRET=...
  export SPACES_REGION=nyc3    SPACES_BUCKET=pumptank-meta

  python3 scripts/spaces-deploy-metadata.py                 # DRY RUN (default)
  python3 scripts/spaces-deploy-metadata.py --confirm       # create bucket + CORS + upload
  python3 scripts/spaces-deploy-metadata.py --confirm --verify   # + HEAD a few objects

Nothing here touches the chain or spends SOL; it only writes to object storage.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parent.parent
META = ROOT / "data" / "metadata"

REGION = os.environ.get("SPACES_REGION", "nyc3")
BUCKET = os.environ.get("SPACES_BUCKET", "pumptankmeta")
KEY = os.environ.get("SPACES_KEY") or os.environ.get("AWS_ACCESS_KEY_ID")
SECRET = os.environ.get("SPACES_SECRET") or os.environ.get("AWS_SECRET_ACCESS_KEY")
ENDPOINT = f"https://{REGION}.digitaloceanspaces.com"

CONFIRM = "--confirm" in sys.argv
VERIFY = "--verify" in sys.argv

CORS = {
    "CORSRules": [{
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["*"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3600,
    }]
}


def client():
    if not (KEY and SECRET):
        sys.exit("ERROR: set SPACES_KEY and SPACES_SECRET (doctl spaces keys create <name>)")
    return boto3.client(
        "s3", region_name=REGION, endpoint_url=ENDPOINT,
        aws_access_key_id=KEY, aws_secret_access_key=SECRET,
        config=BotoConfig(s3={"addressing_style": "virtual"}),
    )


def etag_of(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def needs_upload(s3, key: str, local: Path) -> bool:
    try:
        head = s3.head_object(Bucket=BUCKET, Key=key)
    except ClientError:
        return True
    # ETag for a single-part PUT is the md5 hex in quotes
    return head.get("ETag", "").strip('"') != etag_of(local)


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=BUCKET)
        print(f"bucket exists: {BUCKET}")
    except ClientError:
        if CONFIRM:
            s3.create_bucket(Bucket=BUCKET)
            print(f"created bucket: {BUCKET}")
        else:
            print(f"[dry-run] would create bucket: {BUCKET}")
    if CONFIRM:
        s3.put_bucket_cors(Bucket=BUCKET, CORSConfiguration=CORS)
        print("set bucket CORS (GET/HEAD, origin *)")
    else:
        print("[dry-run] would set bucket CORS (GET/HEAD, origin *)")


def put(s3, key, local: Path, content_type, cache):
    if not local.exists():
        return ("missing", key)
    if not needs_upload(s3, key, local):
        return ("skip", key)
    if CONFIRM:
        s3.put_object(
            Bucket=BUCKET, Key=key, Body=local.read_bytes(),
            ContentType=content_type, ACL="public-read", CacheControl=cache,
        )
        return ("put", key)
    return ("would-put", key)


def main():
    uris = json.loads((META / "uris.json").read_text())
    images = json.loads((META / "images.json").read_text())
    ids = sorted(uris)
    print(f"endpoint={ENDPOINT} bucket={BUCKET} ids={len(ids)} confirm={CONFIRM}")

    # Local preflight (no credentials needed): every object must have a source file.
    src_missing = []
    for tid in ids:
        if not (META / "m" / f"{tid}.json").exists():
            src_missing.append(f"m/{tid}.json")
        if not (ROOT / images.get(tid, "")).exists():
            src_missing.append(f"img/{tid}.png <- {images.get(tid)}")
    print(f"objects to upload: {len(ids)} json + {len(ids)} png = {2 * len(ids)}")
    print("all source files present" if not src_missing
          else f"MISSING {len(src_missing)} source files (first 10): {src_missing[:10]}")

    if not CONFIRM:
        print("\nDRY RUN -- nothing uploaded (no credentials needed). "
              "Re-run with --confirm and SPACES_KEY/SPACES_SECRET set to upload.")
        return
    if src_missing:
        sys.exit(f"refusing to upload: {len(src_missing)} source files missing -- fix and re-run")

    s3 = client()
    ensure_bucket(s3)

    tally = {"put": 0, "skip": 0, "would-put": 0, "missing": 0}
    missing = []
    for i, tid in enumerate(ids):
        st, _ = put(s3, f"m/{tid}.json", META / "m" / f"{tid}.json",
                    "application/json", "public, max-age=3600")
        tally[st] += 1
        if st == "missing":
            missing.append(f"m/{tid}.json")
        img_local = ROOT / images.get(tid, "")
        st2, _ = put(s3, f"img/{tid}.png", img_local, "image/png", "public, max-age=86400")
        tally[st2] += 1
        if st2 == "missing":
            missing.append(f"img/{tid}.png ({images.get(tid)})")
        if (i + 1) % 200 == 0:
            print(f"  ...{i + 1}/{len(ids)}")

    print(json.dumps(tally, indent=2))
    if missing:
        print(f"MISSING {len(missing)} source files (first 10): {missing[:10]}")

    if VERIFY and CONFIRM:
        sample = ids[0]
        for key, ct in ((f"m/{sample}.json", "application/json"), (f"img/{sample}.png", "image/png")):
            h = s3.head_object(Bucket=BUCKET, Key=key)
            print(f"verify {key}: {h['ContentType']} (want {ct}), {h['ContentLength']}B, ACL set")
        print(f"origin URL sample: {ENDPOINT.replace('https://', f'https://{BUCKET}.')}/m/{sample}.json")
        print("note: the on-chain uri uses https://meta.thepumptank.fun/... -> point that CNAME at this bucket/CDN.")

    if not CONFIRM:
        print("\nDRY RUN -- nothing uploaded. Re-run with --confirm.")


if __name__ == "__main__":
    main()
