"""Generate non-personal images for local import and print checks."""
from pathlib import Path
from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

target = Path(__file__).parent / "fixtures"
target.mkdir(exist_ok=True)
for name, size in [("landscape", (1600, 1000)), ("portrait", (1000, 1600))]:
    image = Image.new("RGB", size, "#92b6b0")
    draw = ImageDraw.Draw(image)
    w, h = size
    draw.rectangle((0, h * .6, w, h), fill="#e3c28f")
    draw.ellipse((w * .1, h * .1, w * .35, h * .1 + w * .25), fill="#fff5cf")
    draw.rectangle((w * .55, h * .25, w * .85, h * .8), fill="#eb7865")
    draw.rectangle((10, 10, w - 10, h - 10), outline="#ffffff", width=8)
    draw.text((40, 40), f"LOCAL TEST - {w} x {h}", fill="black", font_size=32)
    exif = Image.Exif()
    exif[34665] = {36867: "2026:09:21 10:30:00"}
    exif[34853] = {1: "N", 2: (IFDRational(30), IFDRational(16), IFDRational(27)), 3: "E", 4: (IFDRational(120), IFDRational(9), IFDRational(18))}
    image.save(target / f"{name}.jpg", quality=92, exif=exif)
