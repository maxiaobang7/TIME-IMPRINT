"""Rebuild lossless font packaging and the compressed synthetic source image.
Requires Pillow, fonttools and brotli; only needed when changing source assets.
"""
from pathlib import Path
from PIL import Image
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
Image.open(root / "scripts/assets/sample-scenes.png").save(
    root / "public/studio/sample-scenes.webp", "WEBP", quality=86, method=6
)
font = TTFont(root / "scripts/assets/MaShanZheng-Regular.ttf")
font.flavor = "woff2"
font.save(root / "public/fonts/MaShanZheng-Regular.woff2")
