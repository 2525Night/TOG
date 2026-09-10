"""Apply logo-B (M + mint path) to Android launcher icons only."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Designs_Ideas" / "MoneTail" / "logo-options" / "assets" / "logo-b-tail-path.png"
RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"
ASSETS = ROOT / "Designs_Ideas" / "MoneTail" / "logo-options" / "assets"


def load_logo() -> Image.Image:
    img = Image.open(SRC).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r > 240 and g > 240 and b > 240:
                pixels[x, y] = (r, g, b, 0)
            elif r > 220 and g > 220 and b > 220:
                fade = int(a * (1 - (min(r, g, b) - 220) / 35))
                pixels[x, y] = (r, g, b, max(0, fade))
    bbox = img.getbbox()
    if not bbox:
        raise SystemExit("logo content not found")
    return img.crop(bbox)


def lighten_m(logo: Image.Image) -> Image.Image:
    """Navy M → off-white for dark adaptive/launcher background."""
    out = logo.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if r < 80 and g < 100 and b < 140 and a > 200:
                px[x, y] = (243, 247, 250, a)
    return out


def fit_logo(logo: Image.Image, size: int, pad_ratio: float) -> tuple[Image.Image, int, int]:
    max_w = int(size * (1 - 2 * pad_ratio))
    max_h = int(size * (1 - 2 * pad_ratio))
    lw, lh = logo.size
    scale = min(max_w / lw, max_h / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    return resized, x, y


def make_launcher(logo: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0x12, 0x18, 0x20, 255))
    resized, x, y = fit_logo(logo, size, 0.18)
    canvas.paste(resized, (x, y), resized)
    return canvas.convert("RGB")


def make_foreground(logo: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    resized, x, y = fit_logo(logo, size, 0.22)
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    logo = lighten_m(load_logo())
    sizes = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }
    for folder, (launch, fg) in sizes.items():
        d = RES / folder
        make_launcher(logo, launch).save(d / "ic_launcher.png", optimize=True)
        make_launcher(logo, launch).save(d / "ic_launcher_round.png", optimize=True)
        make_foreground(logo, fg).save(d / "ic_launcher_foreground.png", optimize=True)
        print(f"{folder}: launcher={launch} fg={fg}")

    master = make_launcher(logo, 1024)
    master.save(ASSETS / "app-icon-logo-b-applied.png", optimize=True)
    print("saved", ASSETS / "app-icon-logo-b-applied.png")


if __name__ == "__main__":
    main()
