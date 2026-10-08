import { describe, expect, test } from 'bun:test';
import { catalog, crops, screens } from '../catalog';
import {
  type Box,
  cover,
  coverExclude,
  coverFocus,
  coverXCss,
  excludeWidthCss,
  fitHeightRight,
  fitWidthTop,
  focusPositionCss,
  mapBox,
  mapPoint,
  rightXCss,
} from '../geometry';

/** Evaluates the CSS expressions the geometry module emits, for a container of W×H. */
function evalCss(expr: string, W: number, H: number): number {
  const js = expr
    .replace(/(-?\d+(?:\.\d+)?)cqw/g, `($1*${W}/100)`)
    .replace(/(-?\d+(?:\.\d+)?)cqh/g, `($1*${H}/100)`)
    .replace(/(\d)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/clamp\(/g, 'clampFn(')
    .replace(/max\(/g, 'Math.max(')
    .replace(/min\(/g, 'Math.min(');
  return new Function('clampFn', `return ${js};`)((a: number, b: number, c: number) => Math.min(Math.max(a, b), c));
}

const inside = (b: Box, W: number, H: number) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H;
const outside = (b: Box, W: number, H: number) => b.x1 <= 0 || b.x0 >= W || b.y1 <= 0 || b.y0 >= H;

describe('cover helper', () => {
  test('maps marks under object-fit cover with an anchor', () => {
    const fit = cover({ width: 1672, height: 941 }, { width: 1440, height: 900 }, { x: 0.62, y: 0.1 });
    expect(fit.scale).toBeCloseTo(900 / 941, 6);
    expect(fit.offsetY).toBeCloseTo(0, 6);
    expect(fit.offsetX).toBeCloseTo(0.62 * (1440 - 1672 * (900 / 941)), 6);
    const watch = mapPoint(fit, { x: 980, y: 688 });
    expect(watch.x).toBeCloseTo(fit.offsetX + 980 * fit.scale, 6);
    expect(watch.y).toBeCloseTo(688 * fit.scale, 6);
  });
  test('focus cover never shows past the image edge', () => {
    const fit = coverFocus({ width: 1035, height: 1280 }, { width: 900, height: 1000 }, 1000, 0.3);
    expect(fit.offsetX).toBeGreaterThanOrEqual(900 - fit.width - 1e-9);
    expect(fit.offsetX).toBeLessThanOrEqual(0);
  });
});

describe('hero, wide scheme (Brief «Кадрирование»)', () => {
  const img = catalog['balcony-far'];
  const m = img.marks as Required<typeof img.marks>;
  const anchorFor = (W: number, H: number) => (W / H >= crops.heroWide.narrowBelowAspect ? crops.heroWide.anchor : crops.heroWide.narrowAnchor);
  for (const [W, H] of screens.wide) {
    test(`${W}×${H}: face and dome whole, dome ≥ 40px from the right edge, hair ≥ 5% from the top`, () => {
      const fit = cover(img, { width: W, height: H }, anchorFor(W, H));
      expect(inside(mapBox(fit, m.face), W, H)).toBe(true);
      const dome = mapBox(fit, m.dome);
      expect(inside(dome, W, H)).toBe(true);
      if (W !== 740) expect(W - dome.x1).toBeGreaterThanOrEqual(40);
      expect(mapPoint(fit, { x: 0, y: m.hairTop }).y).toBeGreaterThanOrEqual(0.05 * H);
    });
    test(`${W}×${H}: CSS face edge equals the numbers`, () => {
      const a = anchorFor(W, H);
      const fit = cover(img, { width: W, height: H }, a);
      expect(evalCss(coverXCss(img, m.face.x0, a.x), W, H)).toBeCloseTo(mapPoint(fit, { x: m.face.x0, y: 0 }).x, 1);
    });
  }
});

describe('hero, vertical scheme: phone windows', () => {
  const back = catalog['balcony-phone-back'];
  const near = catalog['balcony-phone-near'];
  for (const [W, H] of screens.vertical) {
    test(`${W}×${H}: dome right edge at 95%, face left edge at 17%, both whole`, () => {
      const fit = fitWidthTop(back, { width: W, height: H });
      const dome = mapBox(fit, back.marks.dome);
      const face = mapBox(fitWidthTop(near, { width: W, height: H }), near.marks.face);
      expect(dome.x1 / W).toBeCloseTo(0.95, 2);
      expect(face.x0 / W).toBeCloseTo(0.17, 2);
      expect(inside(dome, W, H)).toBe(true);
      expect(inside(face, W, H)).toBe(true);
      expect(dome.x0 - face.x1).toBeGreaterThan(0);
    });
  }
  test('390×844: frame 1170×658 equivalent, about 30px between face and dome', () => {
    const fit = fitWidthTop(back, { width: 390, height: 844 });
    expect(Math.abs(1672 * fit.scale - 1170)).toBeLessThan(2);
    expect(Math.abs(fit.height - 658)).toBeLessThan(2);
    const gap = mapBox(fit, back.marks.dome).x0 - mapBox(fitWidthTop(near, { width: 390, height: 844 }), near.marks.face).x1;
    expect(Math.abs(gap - 30)).toBeLessThan(3);
  });
});

describe('portrait scenes', () => {
  const cases = [
    ['close-muted', crops.freezeVertical],
    ['stairs', crops.partnersVertical],
  ] as const;
  for (const [name, crop] of cases) {
    const img = catalog[name];
    for (const [W, H] of screens.vertical) {
      test(`${name} vertical ${W}×${H}: face whole and centred; CSS position equals the numbers`, () => {
        const fit = coverFocus(img, { width: W, height: H }, crop.focusX, crop.anchorY);
        const face = mapBox(fit, img.marks.face);
        expect(inside(face, W, H)).toBe(true);
        // Centred, unless the image edge stops it (then the image touches that edge).
        const centred = Math.abs(mapPoint(fit, { x: crop.focusX, y: 0 }).x - W / 2) < 1;
        const atEdge = Math.abs(fit.offsetX) < 1e-6 || Math.abs(fit.offsetX - (W - fit.width)) < 1e-6;
        expect(centred || atEdge).toBe(true);
        expect(evalCss(focusPositionCss(img, crop.focusX), W, H)).toBeCloseTo(fit.offsetX, 1);
      });
    }
    for (const [W, H] of screens.wide) {
      test(`${name} wide ${W}×${H}: full height on the right, face whole; CSS face edge equals the numbers`, () => {
        const fit = fitHeightRight(img, { width: W, height: H });
        expect(inside(mapBox(fit, img.marks.face), W, H)).toBe(true);
        expect(evalCss(rightXCss(img, img.marks.face.x0), W, H)).toBeCloseTo(mapPoint(fit, { x: img.marks.face.x0, y: 0 }).x, 1);
      });
    }
  }
});

describe('final scene', () => {
  const wide = catalog.aerial as typeof catalog.aerial & { marks: Required<typeof catalog.aerial.marks> };
  for (const [W, H] of screens.wide) {
    test(`wide ${W}×${H}: dome and face whole; CSS dome edge equals the numbers`, () => {
      const fit = cover(wide, { width: W, height: H }, crops.finalWide.anchor);
      const dome = mapBox(fit, wide.marks.dome);
      expect(inside(dome, W, H)).toBe(true);
      expect(inside(mapBox(fit, wide.marks.face), W, H)).toBe(true);
      expect(evalCss(coverXCss(wide, wide.marks.dome.x0, 1), W, H)).toBeCloseTo(dome.x0, 1);
    });
  }
  const tall = catalog['aerial-vertical'];
  const c = crops.finalVertical;
  for (const [W, H] of screens.vertical) {
    test(`vertical ${W}×${H}: dome whole and centred, face out of frame`, () => {
      const fit = coverExclude(tall, { width: W, height: H }, c.centreX, c.keepOutX, c.anchorY);
      expect(fit.height).toBeGreaterThanOrEqual(H - 1e-6);
      const dome = mapBox(fit, tall.marks.dome);
      expect(inside(dome, W, H)).toBe(true);
      expect(Math.abs(mapPoint(fit, tall.marks.domeCentre).x - W / 2)).toBeLessThan(1);
      expect(outside(mapBox(fit, tall.marks.face), W, H)).toBe(true);
      expect(evalCss(excludeWidthCss(tall, c.centreX, c.keepOutX), W, H)).toBeCloseTo(fit.width, 1);
    });
  }
});
