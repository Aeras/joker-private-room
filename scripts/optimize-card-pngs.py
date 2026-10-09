"""Lossless, same-size PNG derivatives; keep every original PNG and SVG.
Run with Pillow. Pixel equivalence implies identical appearance at any DPR.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source_root = ROOT / "public/cards/runtime-png"
target_root = ROOT / "public/cards/optimized-png"
manifest = []
for source in sorted(source_root.rglob("*.png")):
    destination = target_root / source.relative_to(source_root)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        pixels = original.convert("RGBA")
        # Drop a redundant alpha channel only when every pixel is opaque.
        encoded = pixels.convert("RGB") if pixels.getchannel("A").getextrema() == (255, 255) else pixels
        encoded.save(destination, "PNG", optimize=True, compress_level=9,
                     **({"icc_profile": original.info["icc_profile"]} if "icc_profile" in original.info else {}))
        if destination.stat().st_size > source.stat().st_size:
            destination.write_bytes(source.read_bytes())
        with Image.open(destination) as result:
            if result.size != pixels.size or result.convert("RGBA").tobytes() != pixels.tobytes():
                raise RuntimeError(f"Pixel verification failed: {source}")
        manifest.append({
            "source": "/" + source.relative_to(ROOT / "public").as_posix(),
            "derivative": "/" + destination.relative_to(ROOT / "public").as_posix(),
            "dimensions": list(pixels.size), "pixelExact": True,
            "sourceBytes": source.stat().st_size, "derivativeBytes": destination.stat().st_size,
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "derivativeSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        })
(ROOT / "docs/card-png-derivatives.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
print(json.dumps({"count": len(manifest), "sourceBytes": sum(x["sourceBytes"] for x in manifest),
                  "derivativeBytes": sum(x["derivativeBytes"] for x in manifest)}))
