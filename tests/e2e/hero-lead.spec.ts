// The first screen's lead never splits «Санкт-Петербурге» at its hyphen: where its first line must
// wrap, it wraps before «в Санкт-Петербурге.». Phones lying down and landscape windows narrower
// than 768px have the narrowest column; the lead's letters still keep clear of the face.
import { expect, test } from '@playwright/test';
import { textToFace } from '../../src/blocks/images/catalog';
import { fmt, gap, inPageImages, layout, open, sceneMarks } from './helpers';

const SCREENS = [
  [568, 320],
  [640, 360],
  [667, 375],
  [600, 520],
  [700, 600],
  [767, 600],
  [1100, 1000],
  [360, 780],
] as const;

for (const [w, h] of SCREENS) {
  const phone = w < 768 || h <= 500;
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce', isMobile: phone, hasTouch: phone });

    test('«Санкт-Петербурге.» on one line, the lead clear of the face', async ({ page }) => {
      await open(page);
      const lines = await page.evaluate(() => {
        const lead = document.querySelector('[data-scene="hero"] [data-part="lead"]')!;
        const walk = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const at = n.textContent!.indexOf('Санкт-Петербурге.');
          if (at < 0) continue;
          const r = document.createRange();
          r.setStart(n, at);
          r.setEnd(n, at + 'Санкт-Петербурге.'.length);
          return new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))).size;
        }
        return 0;
      });
      expect(lines, 'lines «Санкт-Петербурге.» takes').toBe(1);

      // The lead's letters, line by line, against the face.
      const l = await layout(page);
      const marks = sceneMarks('hero', l.portrait, await page.evaluate(inPageImages, 'hero'));
      const rects = await page.evaluate(() => {
        const r = document.createRange();
        r.selectNodeContents(document.querySelector('[data-scene="hero"] [data-part="lead"]')!);
        return [...r.getClientRects()].filter((q) => q.width > 1).map((q) => ({ x0: q.left, y0: q.top, x1: q.right, y1: q.bottom }));
      });
      expect(rects.length).toBeGreaterThan(0);
      for (const b of rects) {
        expect.soft(gap(b, marks.face!), `lead line (${fmt(b)}) to the face (${fmt(marks.face!)}), px`).toBeGreaterThanOrEqual(textToFace.anywhere - 0.01);
      }
    });
  });
}
