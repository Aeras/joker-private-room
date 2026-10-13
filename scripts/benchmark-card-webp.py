"""Read-only WebP benchmark: never overwrite shipping PNG or SVG assets."""
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "docs/card-png-derivatives.json").read_text())
OUT = ROOT / ".test-tmp/card-webp-benchmark"
groups = ("png-lossless", "png-quality95", "svg-lossless", "svg-quality95")
for group in groups:
    (OUT / group).mkdir(parents=True, exist_ok=True)

rows = []
for asset in MANIFEST:
    path = ROOT / "public" / asset["source"].lstrip("/")
    # source begins with /cards; the manifest path is relative to public.
    assert path.is_file(), path
    base = path.relative_to(ROOT / "public/cards/runtime-png").with_suffix(".webp")
    with Image.open(path) as img:
        rgba = img.convert("RGBA")
        lossless = OUT / "png-lossless" / base
        high = OUT / "png-quality95" / base
        lossless.parent.mkdir(parents=True, exist_ok=True)
        high.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(lossless, "WEBP", lossless=True, method=6, exact=True)
        rgba.save(high, "WEBP", quality=95, method=6, exact=True)
        with Image.open(lossless) as decoded:
            assert ImageChops.difference(rgba, decoded.convert("RGBA")).getbbox() is None, path
        rows.append({"file":str(base),"pngOriginalBytes":path.stat().st_size,
                     "pngOptimizedBytes":asset["derivativeBytes"],
                     "webpLosslessBytes":lossless.stat().st_size,
                     "webpQuality95Bytes":high.stat().st_size})

# SVG rasterization is a distinct baseline, potentially different from the existing PNG.
svg_error = None
try:
    import cairosvg
    from io import BytesIO
    for item in rows:
        face = Path(item["file"])
        svg_dir = ROOT / "public/cards/sources-svg" / face.parent
        candidate = face.stem.lower()
        suit, _, rank = candidate.partition("_")
        aliases = {"jack":"11","queen":"12","king":"13","ace":"1"}
        candidates = [candidate, f"{suit}-{aliases.get(rank,rank)}", f"{suit.upper()}-{aliases.get(rank,rank)}"]
        src = next((x for x in svg_dir.glob("*.svg") if x.stem.lower() in [v.lower() for v in candidates]), None)
        if src is None:
            item["svgError"] = "missing SVG"
            continue
        ref = next(x for x in MANIFEST if Path(x["source"]).stem == Path(item["file"]).stem and Path(x["source"]).parent.name == Path(item["file"]).parent.name)
        width, height = ref["dimensions"]
        rendered = cairosvg.svg2png(url=str(src), output_width=width, output_height=height)
        with Image.open(BytesIO(rendered)) as img:
            rgba = img.convert("RGBA")
            for group, options, field in (
                ("svg-lossless",{"lossless":True,"method":6,"exact":True},"svgWebpLosslessBytes"),
                ("svg-quality95",{"quality":95,"method":6,"exact":True},"svgWebpQuality95Bytes"),
            ):
                target = OUT / group / item["file"]
                target.parent.mkdir(parents=True, exist_ok=True)
                rgba.save(target, "WEBP", **options)
                item[field] = target.stat().st_size
except Exception as exc:
    svg_error = str(exc)

fields = ("pngOriginalBytes","pngOptimizedBytes","webpLosslessBytes","webpQuality95Bytes",
          "svgWebpLosslessBytes","svgWebpQuality95Bytes")
total = {field:sum(row.get(field,0) for row in rows) for field in fields}
report = {"assetCount":len(rows),"pngLosslessPixelExact":True,"svgWarning":svg_error,
          "note":"SVG outputs independently rasterized; visual parity with existing PNG is NOT asserted.",
          "totalsBytes":total,
          "savingsVersusOptimizedPNGPercent":{
            name:round(100*(1-total[name]/total["pngOptimizedBytes"]),2)
            for name in fields[2:]
          },
          "files":rows}
(OUT / "report.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({k:v for k,v in report.items() if k!="files"},indent=2))
