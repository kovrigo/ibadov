// The first screen in windows nearly as wide as tall, and on short phones. Lying down, the headline
// shrinks with the room before the face, never under 1.5rem, still 1.4 times the lead or more.
// Standing up, the phone picture narrows until the face ends above the text, and the text still
// fits the screen. Browser zoom of 200% and more leaves no room beside the face: the text stands
// under it. Narrow low windows put the hair under the menu: the menu keeps 7:1 there.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { textToFace } from '../../src/blocks/images/catalog';
import { fmt, gap, inPageImages, layout, open, sceneMarks, type Box } from './helpers';

const LYING = [
  [768, 560],
  [768, 600],
  [768, 700],
  [768, 760],
  [800, 700],
  [900, 800],
  [1000, 900],
  [1024, 900],
  [1024, 1000],
] as const;
const STANDING = [
  [320, 568],
  [360, 600],
  [412, 500],
  [600, 700],
  [768, 900],
  [800, 900],
  [900, 1000],
  [1000, 1000],
  [1300, 1400],
] as const;
// Window at zoom: 800×700 and 1024×1000 at 200%, 1040×800 at 200%, 800×700 and 1024×900 at 300%.
const ZOOMED = [
  [400, 350],
  [512, 500],
  [520, 400],
  [266, 233],
  [341, 300],
] as const;
const MENU = [
  [768, 520],
  [800, 600],
  [800, 700],
  [880, 600],
  [1000, 680],
  [1024, 768],
] as const;

/** Letter boxes of the first screen's name, headline and lead, line by line. */
const letters = (page: Page) =>
  page.evaluate(() =>
    ['credit', 'headline', 'lead'].flatMap((part) => {
      // Text nodes only: a block line's own box runs the column's full width.
      const walk = document.createTreeWalker(document.querySelector(`[data-scene="hero"] [data-part="${part}"]`)!, NodeFilter.SHOW_TEXT);
      const out: { part: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent!.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const q of r.getClientRects()) if (q.width > 1) out.push({ part, x0: q.left, y0: q.top, x1: q.right, y1: q.bottom });
      }
      return out;
    }),
  );

const clearOfFace = async (page: Page) => {
  const l = await layout(page);
  const marks = sceneMarks('hero', l.portrait, await page.evaluate(inPageImages, 'hero'));
  const boxes = await letters(page);
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect.soft(gap(b, marks.face!), `${b.part} (${fmt(b)}) to the face (${fmt(marks.face!)}), px`).toBeGreaterThanOrEqual(textToFace.anywhere - 0.01);
  }
  return { l, marks };
};

for (const [w, h] of LYING) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    test('lying down: the text clear of the face, the headline still the largest', async ({ page }) => {
      await open(page);
      const { l } = await clearOfFace(page);
      expect(l.portrait).toBe(false);
      const [headline, lead] = await page.evaluate(() =>
        ['headline', 'lead'].map((p) => Number.parseFloat(getComputedStyle(document.querySelector(`[data-scene="hero"] [data-part="${p}"]`)!).fontSize)),
      );
      expect.soft(headline, 'headline size, px (never under 1.5rem)').toBeGreaterThanOrEqual(24 - 0.01);
      expect.soft(headline / lead!, 'headline to lead size').toBeGreaterThanOrEqual(1.4);
    });
  });
}

for (const [w, h] of STANDING) {
  const phone = w < 768;
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce', isMobile: phone, hasTouch: phone });
    test('standing: the text clear of the face, the picture centred, the first screen one screen tall', async ({ page }) => {
      await open(page);
      const { l, marks } = await clearOfFace(page);
      expect(l.portrait).toBe(true);
      const hero = l.scenes.find((s) => s.name === 'hero')!;
      expect.soft(hero.bottom - hero.top, 'first screen height, px').toBeCloseTo(h, 0);
      for (const f of marks.frames) {
        expect.soft(f.x0 + f.x1, `phone window (${fmt(f)}) centred: left + right, px`).toBeCloseTo(l.vw, 0);
        expect.soft(f.y0, 'phone window top, px (pinned to the top)').toBeCloseTo(0, 0);
      }
      const inside = (name: string, b: Box) => {
        const f = marks.frames[1]!;
        expect.soft(Math.min(b.x0 - f.x0, f.x1 - b.x1, b.y0 - f.y0), `${name} (${fmt(b)}) inside the picture (${fmt(f)}), px`).toBeGreaterThanOrEqual(0);
      };
      inside('face', marks.face!);
      inside('dome', marks.dome!);
    });
  });
}

for (const [w, h] of ZOOMED) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    test('browser zoom: the text under the face, clear of it', async ({ page }) => {
      await open(page);
      await clearOfFace(page);
    });
  });
}

// WCAG relative luminance; the 99th percentile under each link with its letters hidden.
const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const TEXT = luminance(0xed, 0xe5, 0xd8);

for (const [w, h] of MENU) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    test('narrow low window: the menu reads at 7:1 over the hair', async ({ page }) => {
      await open(page);
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('[data-scene="hero"] [data-part="nav"] a')].map((a) => {
          const r = document.createRange();
          r.selectNodeContents(a);
          const q = r.getBoundingClientRect();
          return { text: a.textContent!.trim(), x: q.x, y: q.y, width: q.width, height: q.height };
        }),
      );
      expect(links.length).toBe(3);
      await page.addStyleTag({ content: '[data-part="nav"] a { color: transparent !important; transition: none !important }' });
      for (const { text, ...clip } of links) {
        const { data, info } = await sharp(await page.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true });
        const n = info.width * info.height;
        const l = new Float64Array(n);
        for (let i = 0; i < n; i++) l[i] = luminance(data[i * info.channels]!, data[i * info.channels + 1]!, data[i * info.channels + 2]!);
        l.sort();
        expect.soft((TEXT + 0.05) / (l[Math.floor(0.99 * (n - 1))]! + 0.05), `«${text}» contrast`).toBeGreaterThanOrEqual(7);
      }
    });
  });
}
