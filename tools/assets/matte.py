# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["rembg[cpu]==2.0.67", "pymatting==1.1.14", "numpy<2.3", "pillow"]
# ///
"""Sergey's alpha matte on a composite.

1. ISNet mask for the whole figure (BiRefNet needs over 4 GB on this host).
2. Closed-form matting only in the hair box, so hair keeps its strands.
   On the whole frame it needs several GB.
3. Solid core: the inside of the figure is fully opaque (ISNet leaves ears
   and cheeks half transparent).
4. Everything outside the frame's outline of Sergey is cleared (ISNet also
   picks up the baked interface lines).

Usage: uv run tools/assets/matte.py <balcony|aerial>
Writes src/blocks/images/assets/prep/<frame>-matte.png. Free and local.
Run by the coordinator; the page build never runs it.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import new_session, remove
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol

ASSETS = Path(__file__).resolve().parents[2] / "src/blocks/images/assets"
FRAMES = {
    # hair box (x0, y0, x1, y1) and an outline around Sergey, source pixels
    "balcony": ((860, 40, 1200, 340), [(620, 30), (1230, 30), (1230, 470), (1320, 941), (620, 941)]),
    "aerial": ((1200, 110, 1470, 300), [(1190, 110), (1488, 110), (1488, 440), (1610, 520), (1630, 941), (990, 941), (1000, 560), (1190, 440)]),
}


def binary(m: np.ndarray, op, size: int) -> np.ndarray:
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(op(size)), dtype=np.float64) / 255


def fill_holes(m: np.ndarray) -> np.ndarray:
    """Flood the background from the border; whatever it cannot reach is inside."""
    img = Image.fromarray(((m > 0.5) * 255).astype(np.uint8)).convert("L")
    pad = Image.new("L", (img.width + 2, img.height + 2), 0)
    pad.paste(img, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return (np.asarray(pad, dtype=np.uint8)[1:-1, 1:-1] != 128).astype(np.float64)


frame = sys.argv[1]
box, outline = FRAMES[frame]
img = Image.open(ASSETS / "source" / f"{frame}.png").convert("RGB")
coarse = np.asarray(remove(img, session=new_session("isnet-general-use"), only_mask=True), dtype=np.float64) / 255
alpha = coarse.copy()

x0, y0, x1, y1 = box
m = coarse[y0:y1, x0:x1]
fg = binary((m > 0.95).astype(np.float64), ImageFilter.MinFilter, 9) > 0.5
bg = binary((m > 0.05).astype(np.float64), ImageFilter.MaxFilter, 21) < 0.5
trimap = np.full(m.shape, 0.5)
trimap[fg] = 1.0
trimap[bg] = 0.0
crop = np.asarray(img.crop(box), dtype=np.float64) / 255
alpha[y0:y1, x0:x1] = np.clip(estimate_alpha_cf(crop, trimap, preconditioner=lambda A: ichol(A, max_nnz=20_000_000)), 0, 1)

core = binary(fill_holes(coarse > 0.25), ImageFilter.MinFilter, 7)
alpha = np.maximum(alpha, core)
keep = Image.new("L", img.size, 0)
ImageDraw.Draw(keep).polygon(outline, fill=255)
alpha *= np.asarray(keep.filter(ImageFilter.GaussianBlur(1)), dtype=np.float64) / 255

out = ASSETS / "prep" / f"{frame}-matte.png"
Image.fromarray((np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out)
print(out)
