"""Reproducible table derivatives. Originals remain the source of truth.
Requires Pillow with WebP support. Never rewrites source PNGs.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
manifest = []
for source in sorted((PUBLIC / "cards").glob("*.png")) + [PUBLIC / "table/table_background.png"] + sorted((PUBLIC / "avatars").glob("*.png")):
    original = Image.open(source)
    pixels = original.convert("RGBA")
    avatar = source.parent.name == "avatars"
    output = source.parent / ("table" if avatar else "optimized") / (source.stem + ".webp")
    output.parent.mkdir(exist_ok=True)
    encoded = pixels.resize((256, 256), Image.Resampling.LANCZOS) if avatar else pixels
    encoded.save(output, "WEBP", lossless=not avatar, quality=92 if avatar else 100, method=6, exact=True, icc_profile=original.info.get("icc_profile", b""))
    decoded = Image.open(output).convert("RGBA")
    exact = encoded.tobytes() == decoded.tobytes()
    if not avatar and (not exact or pixels.size != decoded.size):
        raise RuntimeError(f"Lossless pixel verification failed: {source}")
    manifest.append({"source": "/" + source.relative_to(PUBLIC).as_posix(), "derivative": "/" + output.relative_to(PUBLIC).as_posix(), "sourceBytes": source.stat().st_size, "derivativeBytes": output.stat().st_size, "sourceDimensions": original.size, "derivativeDimensions": decoded.size, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "derivativeSha256": hashlib.sha256(output.read_bytes()).hexdigest(), "sameDimensionsPixelExact": exact and not avatar})
(ROOT / "docs/table-asset-derivatives.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
print(json.dumps({"count": len(manifest), "sourceBytes": sum(item["sourceBytes"] for item in manifest), "derivativeBytes": sum(item["derivativeBytes"] for item in manifest)}))
