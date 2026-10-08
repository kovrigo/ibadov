# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["numpy<2.3", "pillow", "pymatting==1.1.14"]
# ///
"""Builds every image master the page uses, from the four sources and the
committed prep files (AI fills, Sergey mattes). Free and local; the page build
never runs it. See the plan, section «Подготовка изображений».

Usage: uv run tools/assets/prepare.py
Writes src/blocks/images/assets/*.webp (lossless) and manifest.json.
Exits non-zero when a check fails. Coordinates are source pixels (1672x941
frames), as in the Brief.

    source + fills (inside masks) ─► clean frame ─► grade ─► layers, windows,
    plates, card, muted portrait ─► checks ─► manifest
"""
import hashlib, json, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pymatting import estimate_foreground_ml

from grade import grade, lum, checks as grade_checks

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src/blocks/images/assets"
SRC, PREP = ASSETS / "source", ASSETS / "prep"
W, H = 1672, 941
TILE_W, RIGHT_X0 = 1255, 1672 - 1255
problems: list[str] = []


# ---------- helpers ----------

def load(p: Path) -> np.ndarray:
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255


def gray(p: Path) -> np.ndarray:
    return np.asarray(Image.open(p).convert("L"), dtype=np.float32) / 255


def _box(m: np.ndarray, r: int, axis: int) -> np.ndarray:
    pad = [(0, 0)] * m.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(m, pad, mode="edge"), axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(m: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur approximated by three box blurs (works on any float array)."""
    if sigma <= 0:
        return m
    r = max(1, int(round((np.sqrt(12 * sigma * sigma / 3 + 1) - 1) / 2)))
    out = m.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def grow(m: np.ndarray, px: int) -> np.ndarray:
    """Binary dilation (px > 0) or erosion (px < 0) of a 0..1 mask."""
    if px == 0:
        return (m > 0.5).astype(np.float32)
    img = Image.fromarray(((m > 0.5) * 255).astype(np.uint8))
    size = abs(px) * 2 + 1
    img = img.filter(ImageFilter.MaxFilter(size) if px > 0 else ImageFilter.MinFilter(size))
    return np.asarray(img, dtype=np.float32) / 255


def poly(polys, shape=(H, W)) -> np.ndarray:
    img = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    for p in polys:
        d.polygon(p, fill=255)
    return np.asarray(img, dtype=np.float32) / 255


def rects(rs, pad=0, shape=(H, W)) -> np.ndarray:
    return poly([[(x0 - pad, y0 - pad), (x1 + pad, y0 - pad), (x1 + pad, y1 + pad), (x0 - pad, y1 + pad)] for x0, y0, x1, y1 in rs], shape)


def lines(paths, width, shape=(H, W)) -> np.ndarray:
    img = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    for p in paths:
        d.line(p, fill=255, width=width, joint="curve")
    return np.asarray(img, dtype=np.float32) / 255


def mix(a, b, m):
    m = m[..., None] if m.ndim == 2 else m
    return a * (1 - m) + b * m


def place_fill(name: str, x0: int, base: np.ndarray, trust: np.ndarray) -> np.ndarray:
    """Resize an AI fill back to its tile, align it to the base by an integer
    shift and match its colour per channel on `trust` (pixels that should be
    unchanged). Returns a full frame; pixels outside the tile are the base."""
    tile = np.asarray(Image.open(PREP / name).convert("RGB").resize((TILE_W, H), Image.LANCZOS), dtype=np.float32) / 255
    ref = base[:, x0:x0 + TILE_W]
    t = trust[:, x0:x0 + TILE_W] > 0.5
    best = (1e9, 0, 0)
    tt, rr, mm = tile[8:-8:2, 8:-8:2], ref[8:-8:2, 8:-8:2], t[8:-8:2, 8:-8:2]
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            sh = np.roll(np.roll(tile, dy, 0), dx, 1)[8:-8:2, 8:-8:2]
            err = np.abs(sh - rr).mean(-1)[mm].mean()
            if err < best[0]:
                best = (err, dx, dy)
    _, dx, dy = best
    tile = np.roll(np.roll(tile, dy, 0), dx, 1)
    for c in range(3):
        a, b = tile[..., c][t], ref[..., c][t]
        gain = (np.std(b) + 1e-6) / (np.std(a) + 1e-6)
        tile[..., c] = (tile[..., c] - a.mean()) * gain + b.mean()
    err = np.abs(tile - ref).mean(-1)[t].mean()
    print(f"  {name}: shift ({dx},{dy}), mean error on trusted pixels {err * 255:.1f}/255")
    out = base.copy()
    out[:, x0:x0 + TILE_W] = np.clip(tile, 0, 1)
    return out


def erase_lines(a, h=(), v=(), half=3, gap=2):
    """Thin straight lines out: each pixel within `half` of the line becomes the
    mean of the rows (columns) just beyond it on both sides."""
    out = a.copy()
    for y, x0, x1 in h:
        above = a[y - half - gap - 2:y - half - gap + 1, x0:x1].mean(0)
        below = a[y + half + gap:y + half + gap + 3, x0:x1].mean(0)
        for i, yy in enumerate(range(y - half, y + half + 1)):
            f = i / (2 * half)
            out[yy, x0:x1] = above * (1 - f) + below * f
    for x, y0, y1 in v:
        left = a[y0:y1, x - half - gap - 2:x - half - gap + 1].mean(1)
        right = a[y0:y1, x + half + gap:x + half + gap + 3].mean(1)
        for i, xx in enumerate(range(x - half, x + half + 1)):
            f = i / (2 * half)
            out[y0:y1, xx] = left * (1 - f) + right * f
    return out


def local_match(fill, base, w, sigma=24.0):
    """Bring the fill's low frequencies to the base where the base is trusted
    (w = 1), so a pasted region has no halo of different brightness."""
    bw = blur(w, sigma)
    d = blur((base - fill) * w[..., None], sigma) / np.maximum(bw, 1e-4)[..., None]
    reach = np.clip(bw / 0.05, 0, 1)[..., None]
    return np.clip(fill + d * reach, 0, 1)


def diff_mask(a, b, region, thr=0.06, grow_px=4, feather=2.5):
    """Where a and b differ inside region: the strokes of baked UI."""
    d = blur(np.abs(a - b).max(-1), 1.0) * region
    m = grow(d > thr, grow_px) * grow(region, 2)
    return blur(m, feather)


def save(name: str, rgb: np.ndarray, alpha: np.ndarray | None = None) -> None:
    a8 = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    if alpha is not None:
        a8 = np.dstack([a8, (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)])
    Image.fromarray(a8).save(ASSETS / f"{name}.webp", lossless=True, quality=100, method=6, exact=True)


def need(cond: bool, what: str) -> None:
    print(("  ok    " if cond else "  FAIL  ") + what)
    if not cond:
        problems.append(what)


# ---------- aerial: one layer, overlay removed ----------

def aerial() -> np.ndarray:
    print("aerial")
    src = load(SRC / "aerial.png")
    sergey = gray(PREP / "aerial-matte.png")
    # Left: almost everything left of the cathedral is overlay (panel, arcs,
    # strip, streaks, counter); take the fill there, with a soft seam.
    left = poly([[(0, 0), (790, 0), (790, 560), (1010, 560), (1010, 760), (1160, 941), (0, 941)]])
    left = np.maximum(left, lines([[(0, 600), (400, 735), (800, 860), (1150, 941)]], 40))
    trust_l = 1 - grow(left, 30)
    trust_l[:, :700] = 0
    fl = place_fill("aerial-fill-left.png", 0, src, trust_l * (1 - grow(sergey, 10)))
    out = mix(src, fl, blur(left, 6) * (1 - grow(sergey, 3)))
    # Right: panel behind Sergey, lines, dots, streaks on the suit.
    over = rects([(1095, 85, 1495, 580), (1565, 0, 1572, 800), (1618, 510, 1624, 775), (1612, 825, 1628, 862)], pad=8)
    over = np.maximum(over, lines([[(1095, 135), (1490, 85)]], 12))
    trust_r = 1 - grow(np.maximum(np.maximum(over, left), poly([[(1082, 0), (1672, 0), (1672, 941), (1082, 941)]])), 25)
    trust_r[:, :RIGHT_X0] = 0
    fr = place_fill("aerial-fill-right.png", RIGHT_X0, out, trust_r * (1 - grow(sergey, 10)))
    # Right of the cathedral the whole background sat under the glass panel,
    # lines and glows: take the fill there, around Sergey.
    right_bg = np.maximum(poly([[(1082, 0), (1672, 0), (1672, 941), (1082, 941)]]), over)
    right_bg = np.maximum(right_bg, rects([(1040, 100, 1095, 215)]))  # glass glow above the dome's right shoulder
    around = blur(right_bg, 4) * (1 - sergey)
    # Streaks drawn over the suit: where the fill differs from the source on Sergey's body below the face.
    body = sergey * poly([[(980, 560), (1672, 560), (1672, 941), (980, 941)]])
    streaks = diff_mask(out, fr, grow(body, -2), thr=0.05, grow_px=6, feather=4)
    out = mix(out, fr, np.maximum(around, streaks))
    # One streak on the left sleeve survives in the fill too: replace its soft
    # glow with the suit's own tone around it, keep the fabric's fine texture.
    sleeve = blur(poly([[(995, 688), (1090, 698), (1228, 756), (1228, 818), (1080, 788), (995, 762)]]), 6) * grow(sergey, 2)
    out = remove_glow(out, sleeve, sergey, keep_texture=0.3)
    # The overlay's glass dulled the city; the fills bring it back brighter
    # and more saturated. Keep the frame's own midtone saturation.
    replaced = np.maximum(blur(left, 6) * (1 - grow(sergey, 3)), np.maximum(around, streaks))
    return match_saturation(out, src, replaced)


def remove_glow(a, m, inside, sigma=10.0, keep_texture=0.5):
    low = blur(a, sigma)
    w = inside * (1 - grow(m > 0.05, 6))
    around = blur(low * w[..., None], 2 * sigma) / np.maximum(blur(w, 2 * sigma), 1e-4)[..., None]
    return mix(a, around + (a - low) * keep_texture, m)


def saturation(a):
    mx = a.max(-1)
    return np.where(mx > 0, (mx - a.min(-1)) / np.maximum(mx, 1e-6), 0)


def match_saturation(out, ref, m):
    """Scale saturation inside m so out's midtone (L > 0.25) mean equals ref's."""
    target = saturation(ref)[lum(ref) > 0.25].mean()
    k = 1.0
    for _ in range(4):
        mx = out.max(-1, keepdims=True)
        trial = mix(out, mx - (mx - out) * k, m)
        now = saturation(trial)[lum(trial) > 0.25].mean()
        k *= 1 + (target - now) / max(now, 1e-6) * 2.2
    mx = out.max(-1, keepdims=True)
    res = mix(out, mx - (mx - out) * k, m)
    print(f"  saturation inside fills x{k:.3f}: midtones {saturation(res)[lum(res) > 0.25].mean():.3f}, source {target:.3f}")
    return res


# ---------- balcony: UI removed; plate without Sergey and the cathedral ----------

def balcony():
    print("balcony")
    src = load(SRC / "balcony.png")
    sergey = gray(PREP / "balcony-matte.png")
    ui_left = rects([(65, 55, 410, 108), (65, 265, 770, 430), (65, 455, 595, 505), (68, 558, 445, 636), (70, 750, 200, 870)], pad=10)
    menu = rects([(1185, 55, 1612, 78)], pad=8)
    keep = 1 - grow(sergey, 8)
    trust_l = (1 - grow(ui_left, 20)) * keep
    trust_l[:, 700:] = 0  # the fill tile's right part is not trusted far from the seam
    fl = place_fill("balcony-fill-left.png", 0, src, trust_l)
    # Whole boxes, not letter strokes: a stroke-shaped paste leaves ghost
    # letters wherever the fill's stone differs a little in tone.
    fl = local_match(fl, src, (1 - grow(ui_left, 4)) * keep, sigma=16)
    clean = mix(src, fl, blur(ui_left, 6) * keep)
    # The fill keeps faint ghosts of two thin lines: the button frame and the
    # short line under the name. Interpolate across each line from both sides.
    clean = erase_lines(clean, h=[(104, 60, 148), (559, 62, 451), (635, 62, 451)], v=[(69, 552, 642), (444, 552, 642)])
    # Right fill: no Sergey, no cathedral, no menu. Trust only the sky and
    # skyline away from both (the fill redrew the bottom).
    cath_box = poly([[(1170, 90), (1672, 90), (1672, 941), (1170, 941)]])
    trust_r = (1 - grow(np.maximum(cath_box, menu), 20)) * (1 - grow(sergey, 25))
    trust_r[480:] = 0
    trust_r[:, :RIGHT_X0] = 0
    fr = place_fill("balcony-fill-right.png", RIGHT_X0, clean, trust_r)
    clean = mix(clean, fr, diff_mask(clean, fr, menu, thr=0.05))

    # Cathedral silhouette above the embankment: where the fill lost it.
    upper = poly([[(1170, 90), (1672, 90), (1672, 640), (1170, 640)]]) * (1 - grow(sergey, 3))
    d = blur(np.abs(clean - fr).max(-1), 1.5) * upper
    cath = grow(grow(d > 0.10, 6), -6)  # close small gaps

    # Band: cathedral + everything below it right of a seam hidden behind Sergey.
    ys = np.arange(H)
    right_edge = np.array([np.nonzero(sergey[y] > 0.5)[0].max() if (sergey[y] > 0.5).any() else 0 for y in ys])
    band = grow(cath, 6)
    for y in range(480, H):
        seam = max(right_edge[y] - 30, 1180) if right_edge[y] > 1180 else 1180
        band[y, seam:] = 1
    band = blur(band, 1.5)

    # Plate: clean frame without Sergey and without the cathedral. The fill is
    # pasted just under the cutouts and matched to the sky around them.
    hole = np.maximum(grow((sergey > 0.02).astype(np.float32), 3), grow(cath, 2))
    fr = local_match(fr, clean, 1 - grow(hole, 6))
    plate = mix(clean, fr, blur(hole, 2))

    # Near layer: Sergey + left columns + ledge.
    cols = poly([[(0, 0), (605, 0), (605, 175), (668, 178), (668, 232), (652, 236), (652, 600), (646, 828), (0, 828)]])
    ledge = poly([[(0, 828), (700, 828), (700, 941), (0, 941)]])
    near = np.maximum(sergey, blur(np.maximum(cols, ledge), 1.2) * (1 - grow(sergey, -2)))
    return clean, plate, band, near, sergey


def decontaminate(img: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Foreground colours without the old background in Sergey's soft edges (hair)."""
    f = estimate_foreground_ml(img.astype(np.float64), alpha.astype(np.float64))
    soft = ((alpha > 0.02) & (alpha < 0.98))[..., None]
    return np.where(soft, f, img).astype(np.float32)


def stairs_fix(a: np.ndarray) -> np.ndarray:
    """Brief: the white object top right (x730-1033, y200-420) down to the wall's tone.

    One smooth gain over the whole object, not a per-pixel clamp: a clamp
    flattens it into a patch and leaves light rims around its dark strokes.
    The strokes are softened too, so they no longer read as a logo."""
    L = lum(a)
    box = rects([(730, 200, 1033, 420)], shape=a.shape[:2])
    wall = float(np.median(L[440:600, 760:1000]))
    obj = grow(grow((blur(L, 2) > 0.33) * box, 12), -12)  # strokes closed into the object
    m = blur(grow(obj, 4), 4) * blur(box, 6)
    obj_l = blur(L * obj, 10) / np.maximum(blur(obj, 10), 1e-4)
    gain = np.clip(wall / np.maximum(obj_l, 1e-4), 0, 1)
    low = blur(a, 6)
    soft = (low + (a - low) * 0.2) * gain[..., None]
    return mix(a, soft, m)


def hsv_scale(a: np.ndarray, s: float, v: float) -> np.ndarray:
    mx = a.max(-1, keepdims=True)
    mn = a.min(-1, keepdims=True)
    # Scale saturation around the value channel, then the value.
    return np.clip((mx - (mx - a) * s) * v, 0, 1) if s != 1 else np.clip(a * v, 0, 1)


def plate_scene(a: np.ndarray, box) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = a[y0:y1, x0:x1]
    r = 0.02 * (x1 - x0)
    img = Image.fromarray((crop * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(img, dtype=np.float32) / 255 * 0.35


def textures():
    rng = np.random.default_rng(19)
    n = rng.normal(0, 1, (256, 256))
    rgba = np.zeros((256, 256, 4), np.uint8)
    rgba[..., :3] = np.where(n[..., None] > 0, 255, 0)
    rgba[..., 3] = (np.clip(np.abs(n) / 2.5, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba).save(ASSETS / "grain.webp", lossless=True, method=6, exact=True)
    smoke = np.array([0xCF, 0xC6, 0xB8], np.float32) / 255
    for i, name in enumerate(["smoke-a", "smoke-b"]):
        w, h = 512, 1024
        rng = np.random.default_rng(100 + i)
        field = np.zeros((h, w), np.float32)
        for octave in range(6):  # value-noise fBm
            s = 2 ** octave
            g = rng.random((h // 64 * s + 2, w // 64 * s + 2)).astype(np.float32)
            up = np.asarray(Image.fromarray(g, "F").resize((w, h), Image.BICUBIC))
            field += up / s
        field /= field.max()
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        # A rising plume: centre drifts with the noise, narrow at the bottom.
        drift = (blur(field, 60) - 0.5) * 260
        cx = w / 2 + drift
        width = 30 + 150 * (1 - yy / h)
        env = np.exp(-((xx - cx) / width) ** 2) * np.clip(yy / 120, 0, 1) * np.clip((h - yy) / 300, 0, 1) ** 0.5
        alpha = np.clip((field - 0.35) / 0.5, 0, 1) ** 1.6 * env
        alpha = blur(alpha, 3)
        rgba = np.dstack([np.broadcast_to(smoke, (h, w, 3)), alpha])
        Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)).save(ASSETS / f"{name}.webp", lossless=True, method=6, exact=True)


def main() -> None:
    a_clean = aerial()
    b_clean, b_plate, band, near, sergey = balcony()

    print("grade")
    ga = grade(a_clean, "composite")
    gb = grade(b_clean, "composite")
    gp = grade(b_plate, "composite")
    close = grade(load(SRC / "close.jpg"), "photo")
    stairs = grade(stairs_fix(load(SRC / "stairs.jpg")), "photo")

    print("layers")
    near_rgb = mix(gb, decontaminate(gb, sergey), (sergey > 0.02).astype(np.float32) * (near - sergey < 0.02))
    band_rgb = mix(gb, gp, sergey)  # behind Sergey the band shows the plate
    far = gp
    back = mix(far, band_rgb, band)  # far + band at rest
    save("balcony-far", far)
    save("balcony-band", band_rgb, band)
    save("balcony-near", near_rgb, near)
    save("balcony-phone-back", back[:, 1026:1583])
    save("balcony-phone-near", near_rgb[:, 785:1342], near[:, 785:1342])
    save("aerial", ga)
    save("aerial-vertical", ga[:, 635:1341])
    save("close", close)
    save("close-muted", hsv_scale(close, 0.4, 0.85))
    save("stairs", stairs)
    save("plate-services", plate_scene(back, (1150, 560, 1672, 941)))
    save("plate-numbers", plate_scene(ga, (560, 520, 1100, 941)))
    card = Image.fromarray((gb[30:614, 560:1672] * 255 + 0.5).astype(np.uint8)).resize((1200, 630), Image.LANCZOS)
    card.save(ASSETS / "card.webp", lossless=True, method=6, exact=True)
    textures()

    dbg = ROOT / "tmp/prep-debug"
    dbg.mkdir(parents=True, exist_ok=True)
    for name, img in [("balcony-clean", gb), ("aerial-clean", ga), ("balcony-plate", gp)]:
        Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(dbg / f"{name}.png")

    print("checks")
    for name, img in [("balcony", gb), ("aerial", ga), ("close", close), ("stairs", stairs)]:
        for ok, what in grade_checks(img):
            need(ok, f"{name}: {what}")
    rest = mix(mix(far, band_rgb, band), near_rgb, near)
    err = np.abs(rest - gb).max(-1)
    Image.fromarray((np.clip(err * 4, 0, 1) * 255).astype(np.uint8)).save(dbg / "balcony-layer-error.png")
    need(err.mean() < 1.5 / 255, f"balcony layers at rest = clean frame: mean {err.mean() * 255:.2f}/255")
    # Inside Sergey's soft hair edge the plate's sky shows through the strands
    # instead of the original sky: checked by eye at 200%, not by number.
    hair = grow(((sergey > 0.02) & (sergey < 0.98)).astype(np.float32), 4) > 0.5
    p995 = np.percentile(err[~hair], 99.5) * 255
    need(p995 < 6, f"balcony layers at rest = clean frame outside hair edges: 99.5% {p995:.1f}/255")
    sizes = {"balcony-far": (1672, 941), "balcony-band": (1672, 941), "balcony-near": (1672, 941),
             "balcony-phone-back": (557, 941), "balcony-phone-near": (557, 941), "aerial": (1672, 941),
             "aerial-vertical": (706, 941), "close": (1035, 1280), "close-muted": (1035, 1280),
             "stairs": (1033, 1280), "plate-services": (522, 381), "plate-numbers": (540, 421), "card": (1200, 630)}
    for name, size in sizes.items():
        need(Image.open(ASSETS / f"{name}.webp").size == size, f"{name} is {size[0]}x{size[1]}")

    files = sorted(ASSETS.glob("*.webp")) + sorted((SRC).glob("*")) + sorted(PREP.glob("*.png"))
    manifest = {
        "checks": "pass" if not problems else "fail",
        "problems": problems,
        "files": {str(p.relative_to(ASSETS)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
    }
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    if problems:
        sys.exit(f"{len(problems)} check(s) failed")
    print("all checks passed")


if __name__ == "__main__":
    main()
