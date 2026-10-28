"""Generate PWA icons into public/ (run: npm run icons)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
BG = (67, 56, 202)  # indigo-700
FG = (255, 255, 255)
SUPERSAMPLE = 4

# Three rising bars and an upward trend line, in a unit box (x right, y down).
BARS = [(0.08, 0.62), (0.38, 0.44), (0.68, 0.24)]  # (left, top); every bar ends at the bottom
BAR_W = 0.24
TREND = [(0.06, 0.40), (0.40, 0.20), (0.56, 0.30), (0.94, 0.02)]
LINE_W = 0.07


def draw_icon(size: int, maskable: bool) -> Image.Image:
    big = size * SUPERSAMPLE
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)
    # maskable icons need content inside the central 80% safe zone
    s = big * (0.56 if maskable else 0.70)
    ox = oy = (big - s) / 2

    def pt(p):
        return (ox + p[0] * s, oy + p[1] * s)

    for left, top in BARS:
        x0, y0 = pt((left, top))
        x1, y1 = pt((left + BAR_W, 1.0))
        d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.03, fill=(165, 180, 252))
    w = LINE_W * s
    pts = [pt(p) for p in TREND]
    d.line(pts, fill=FG, width=round(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=FG)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw_icon(192, False).save(OUT / "pwa-192x192.png")
draw_icon(512, False).save(OUT / "pwa-512x512.png")
draw_icon(512, True).save(OUT / "maskable-512x512.png")
draw_icon(180, False).save(OUT / "apple-touch-icon.png")
