"""The Brief's colour grade (section «Цветокоррекция») and its checks.

Ported from the design-stage probe that produced the Brief's numbers.
Hues in HSV degrees, saturation in HSV. Black point `ink` #0B0908, white
point `text` #EDE5D8.
"""
import numpy as np

INK = np.array([0x0B, 0x09, 0x08], np.float32) / 255
IVORY = np.array([0xED, 0xE5, 0xD8], np.float32) / 255


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
    """kind: 'composite' (the two AI frames) or 'photo' (the real photos)."""
    a = a.astype(np.float32)
    h, s, v = rgb2hsv(a)
    if kind == "composite":
        ob = band(h, 8, 40, 8); h = h + ob * 6; s = s * (1 - 0.30 * ob) * 0.92
    else:
        s = s * (1 - 0.65 * band(h, 50, 200, 15)) * (1 + 0.10 * band(h, 10, 40, 8))
    a = hsv2rgb(h, np.clip(s, 0, 1), np.clip(v, 0, 1))
    if kind == "photo":
        a = np.clip(a, 0, 1) ** 0.9
    L = np.clip(lum(a)[..., None], 1e-4, 1)
    Ln = np.clip(0.35 + (L - 0.35) * 1.12, 0, 1) if kind == "composite" else np.clip(0.30 + (L - 0.30) * 1.08, 0, 1)
    a = a * (Ln / L); L = Ln
    sh = np.clip(L / 0.06, 0, 1) * np.clip(1 - L / 0.30, 0, 1); hi = np.clip((L - 0.55) / 0.45, 0, 1)
    a = a + sh * np.array([0.030, 0.010, -0.015]) * (0.5 if kind == "photo" else 0.2) \
          + hi * np.array([0.02, 0.005, -0.035]) * (1.0 if kind == "photo" else 0.5)
    return np.clip(INK + np.clip(a, 0, 1) * (IVORY - INK), 0, 1).astype(np.float32)


def checks(a):
    """The Brief's checks on a graded image: list of (ok, description).

    Brightness is luminance 0.2126 R + 0.7152 G + 0.0722 B on 8-bit values.
    """
    q = np.round(a * 255) / 255
    L = lum(q); h, s, _ = rgb2hsv(q)
    out = []
    deep = q[L < 0.08].mean(0) * 255
    lo, hi = np.array([0x0D, 0x0A, 0x09]), np.array([0x10, 0x0C, 0x0A])
    # One level of 255 per channel: the Brief's range is itself 1-3 levels wide.
    out.append((bool(np.all(deep >= lo - 1.5) and np.all(deep <= hi + 1.5)), "deep shadows #%02X%02X%02X in #0D0A09..#100C0A (±1)" % tuple(np.round(deep).astype(int))))
    sat = float(s[L > 0.25].mean())
    out.append((0.24 <= sat <= 0.44, f"midtone saturation {sat:.3f} in 0.24..0.44"))
    hue = float(h[(L > 0.6) & (s > 0.02)].mean()) if ((L > 0.6) & (s > 0.02)).any() else float("nan")
    out.append((29 <= hue <= 39, f"highlight hue {hue:.1f} in 29..39"))
    mx = q.reshape(-1, 3).max(0) * 255
    out.append((bool(np.all(mx <= np.array([0xED, 0xE5, 0xD8]) + 0.5)), "brightest point within #EDE5D8"))
    return out
