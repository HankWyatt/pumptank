#!/usr/bin/env python3
"""Download + validate the logo candidate URLs the agents found.

Reads data/logo-work/out/found-*.json, tries each product's candidate URLs in
order until one downloads as a valid image (raster via Pillow, SVG via
ImageMagick), trims transparent/blank borders, and saves a normalized RGBA PNG to
data/logos/{id}.png. Writes data/logo-work/results.json with per-product outcome.

Run with network (this curls external hosts):
  python3 scripts/logo-download.py
"""
import json, glob, subprocess, tempfile, os, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "logo-work" / "out"
LOGOS = ROOT / "data" / "logos"
RESULTS = ROOT / "data" / "logo-work" / "results.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MIN_DIM = 100      # max(w,h) must be at least this
ONLY = set(sys.argv[1:])  # optional: restrict to these ids


def curl(url, dst):
    r = subprocess.run(["curl", "-sSL", "-m", "25", "-A", UA, "-o", dst,
                        "-w", "%{http_code}|%{content_type}", url],
                       capture_output=True, text=True)
    code, _, ctype = r.stdout.partition("|")
    return code.strip(), ctype.strip()


def to_rgba(tmp):
    """Load a downloaded file (raster or svg) into a trimmed RGBA image, or None."""
    head = open(tmp, "rb").read(400).lstrip()
    is_svg = head[:5].lower().startswith(b"<?xml") or b"<svg" in head[:400].lower()
    if is_svg:
        png = tmp + ".png"
        subprocess.run(["magick", "-background", "none", "-density", "384",
                        tmp, "-resize", "1024x1024>", png],
                       check=True, capture_output=True, timeout=40)
        im = Image.open(png)
    else:
        im = Image.open(tmp)
    im.load()
    im = im.convert("RGBA")
    # trim fully-transparent border
    bbox = im.split()[3].getbbox()
    if bbox:
        im = im.crop(bbox)
    return im


def valid(im):
    if im is None:
        return False
    w, h = im.size
    if max(w, h) < MIN_DIM:
        return False
    # reject near-empty (almost all transparent) images
    alpha = im.split()[3]
    nonzero = sum(1 for p in alpha.getdata() if p > 16)
    return nonzero >= 0.01 * w * h


def main():
    LOGOS.mkdir(parents=True, exist_ok=True)
    records = {}
    for f in sorted(glob.glob(str(OUT / "found-*.json"))):
        for e in json.load(open(f)):
            records[e["id"]] = e

    results = {}
    for rid, e in records.items():
        if ONLY and rid not in ONLY:
            continue
        cands = e.get("candidates") or []
        saved = None
        for url in cands:
            try:
                with tempfile.NamedTemporaryFile(delete=False) as tf:
                    tmp = tf.name
                code, ctype = curl(url, tmp)
                if code != "200":
                    continue
                im = to_rgba(tmp)
                if valid(im):
                    im.save(LOGOS / f"{rid}.png")
                    saved = {"url": url, "w": im.size[0], "h": im.size[1],
                             "confidence": e.get("confidence")}
                    break
            except Exception as ex:
                results.setdefault("_errors", []).append(f"{rid}: {type(ex).__name__}")
            finally:
                for p in (tmp, tmp + ".png"):
                    try: os.unlink(p)
                    except OSError: pass
        results[rid] = saved  # None if nothing worked

    RESULTS.write_text(json.dumps(results, indent=2))
    ok = [k for k, v in results.items() if isinstance(v, dict) and v]
    print(f"saved {len(ok)} logos / {len([k for k in results if not k.startswith('_')])} products")
    for k in list(records)[:40]:
        v = results.get(k)
        tag = f"{v['w']}x{v['h']}" if v else "—"
        print(f"  {tag:>10}  {records[k]['company'][:24]}")


if __name__ == "__main__":
    main()
