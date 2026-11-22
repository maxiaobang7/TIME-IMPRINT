"""Rebuild lossless font packaging.
The sample scenes live directly in scripts/assets/sample-scenes.webp (five across, two down,
1536 × 1024 each); replace that file to change the template example photos.
Requires fonttools and brotli; only needed when changing source assets.
"""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
font = TTFont(root / "scripts/assets/MaShanZheng-Regular.ttf")
font.flavor = "woff2"
font.save(root / "public/fonts/MaShanZheng-Regular.woff2")
