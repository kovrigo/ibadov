"""The colour grade and its checks.

The customer's frames are the reference (8 October 2026: "here is the right
colour grade"). Hues in HSV degrees, saturation in HSV.
"""
import numpy as np

AMBER_HUE = 28.0


def rgb2hsv(a):
    mx = a.max(-1); mn = a.min(-1); d = mx - mn; h = np.zeros_like(mx)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; m = d > 1e-6
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6; h[gm] = ((b - r)[gm] / d[gm]) + 2; h[bm] = ((r - g)[bm] / d[bm]) + 4
    return h * 60, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def hsv2rgb(h, s, v):
    c = v * s; hp = (h % 360) / 60; x = c * (1 - np.abs(hp % 2 - 1)); z = np.zeros_like(h)
    conds = [hp < 1, hp < 2, hp < 3, hp < 4, hp < 5, hp <= 6]
    t = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]
    return np.stack([np.select(conds, [q[i] for q in t]) for i in range(3)], -1) + (v - c)[..., None]


def band(h, lo, hi, f):
    return np.clip((h - (lo - f)) / f, 0, 1) * np.clip(((hi + f) - h) / f, 0, 1)


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def grade(a, kind):
    """kind: 'composite' (the customer's frames) or 'photo' (the real photos).

    The customer's frames carry the grade the customer chose (8 October 2026):
    they stay as they are. The photos are brought to the same look: warm amber
    mids, gold highlights, deep warm blacks, no green or blue casts.
    """
    a = a.astype(np.float32)
    if kind == "composite":
        return a
    h, s, v = rgb2hsv(a)
    L0 = lum(a)
    s = s * (1 - 0.70 * band(h, 62, 200, 15))
    h = h - (h - 34) * 0.6 * band(h, 38, 80, 8)  # yellowish highlights (hair) to gold
    # Near-neutral tones take the amber hue: most in the mids, little in deep
    # shadows and in the white shirt.
    w = np.clip(1 - s / 0.35, 0, 1) * np.clip(L0 / 0.05, 0, 1) * np.clip((0.85 - L0) / 0.35, 0, 1)
    h = h + (((AMBER_HUE - h + 180) % 360) - 180) * w
    gain = 1.5 + (1.22 - 1.5) * np.clip(s / 0.35, 0, 1)  # skin gains less than greys
    s = np.maximum(s * gain, 0.26 * w * np.clip(L0 / 0.15, 0, 1))
    a = hsv2rgb(h, np.clip(s, 0, 1), v)
    L = np.clip(lum(a)[..., None], 1e-4, 1)
    Ln = np.clip(L ** 0.88 * 1.14, 0, 1)
    return np.clip(a * (Ln / L), 0, 1).astype(np.float32)


def checks(a):
    """The grade's checks on an image: list of (ok, description). Limits come
    from the customer's three frames (balcony, aerial, desk), with some room.

    Brightness is luminance 0.2126 R + 0.7152 G + 0.0722 B on 8-bit values.
    """
    q = np.round(a * 255) / 255
    L = lum(q); h, s, _ = rgb2hsv(q)
    out = []
    deep = q[L < 0.08].mean(0) * 255
    lo, hi = np.array([0x09, 0x06, 0x03]), np.array([0x10, 0x0C, 0x0A])
    warm = deep[0] >= deep[1] >= deep[2]
    out.append((bool(np.all(deep >= lo) and np.all(deep <= hi) and warm), "deep shadows #%02X%02X%02X warm, in #090603..#100C0A" % tuple(np.round(deep).astype(int))))
    sat = float(s[L > 0.25].mean())
    out.append((0.38 <= sat <= 0.65, f"midtone saturation {sat:.3f} in 0.38..0.65"))
    hl = np.radians(h[(L > 0.6) & (s > 0.02)])  # circular mean: reds sit on both sides of 0
    hue = float(np.degrees(np.arctan2(np.sin(hl).mean(), np.cos(hl).mean()))) if hl.size else float("nan")
    out.append((15 <= hue <= 40, f"highlight hue {hue:.1f} in 15..40"))
    return out
