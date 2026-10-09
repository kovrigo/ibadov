import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { noIntro } from './motion-fixtures';

// The seam from the first screen into «Купить / Продать» (DESIGN.md Motion): with the camera the
// desk lies under the first screen, held at the top of the screen while the first screen leaves,
// and the two pictures cross by scroll; reduced motion: nothing overlaps, both melt into ink.
// Either way no line shows where the two scenes meet.
const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

const HERO = '[data-scene="hero"]';
const SERVICES = '[data-scene="services"]';

/** Scrolls to a share of the hero's height; returns where the hero's bottom edge is on screen. */
async function scrollHero(page: Page, share: number): Promise<number> {
  const h = await page.$eval(HERO, (el) => (el as HTMLElement).offsetHeight);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), Math.round(share * h));
  await page.waitForTimeout(300);
  return page.$eval(HERO, (el) => el.getBoundingClientRect().bottom);
}

const mediaOpacity = (page: Page, scene: string) => page.$eval(`${scene} [data-media]`, (el) => Number(getComputedStyle(el).opacity));

/**
 * Mean brightness step across the row at y (rows y−2 and y+2), and the largest such step on rows
 * 12–40px above and below it. A hard seam is a step far above its neighbours.
 */
async function edge(page: Page, y: number): Promise<{ across: number; near: number }> {
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
  const row = (r: number) => {
    const out: number[] = [];
    for (let x = 0; x < info.width; x += 1) {
      const o = (r * info.width + x) * info.channels;
      out.push(0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!);
    }
    return out;
  };
  const step = (r: number) => {
    const [a, b] = [row(r - 2), row(r + 2)];
    return a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length;
  };
  return { across: step(y), near: Math.max(...[-40, -30, -20, -12, 12, 20, 30, 40].map((d) => step(y + d))) };
}

for (const { name, viewport, ...device } of SIZES) {
  test.describe(`seam into services, ${name}`, () => {
    test.use({ viewport, ...device });

    test('the desk is held under the first screen and the pictures cross by scroll, without an edge', async ({ page, context }) => {
      await noIntro(context);
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      // At rest: the desk is there but not seen; the balcony whole.
      expect(await page.$eval(SERVICES, (el) => (el as HTMLElement).dataset.seam)).toBe('');
      await scrollHero(page, 0);
      expect(await mediaOpacity(page, SERVICES)).toBe(0);
      expect(await mediaOpacity(page, HERO)).toBe(1);

      // Where the desk stands: its centre against the screen's (the camera's slow push-in scales it
      // about its centre).
      const deskOffset = () =>
        page.$eval(`${SERVICES} [data-stack]`, (el) => {
          const r = el.getBoundingClientRect();
          return r.top + r.height / 2 - innerHeight / 2;
        });
      for (const share of [0.25, 0.5]) {
        const bottom = await scrollHero(page, share);
        // The desk stands still at the top of the screen while the first screen leaves over it.
        expect(Math.abs(await deskOffset())).toBeLessThanOrEqual(1);
        const e = await edge(page, Math.round(bottom));
        expect(e.across, `share ${share}: step across the hero's bottom edge vs. its neighbours (${e.near.toFixed(1)})`).toBeLessThanOrEqual(e.near * 1.3);
      }
      // Half way the desk is fully in and the balcony part gone: they cross, no dip to ink.
      await scrollHero(page, 0.5);
      expect(await mediaOpacity(page, SERVICES)).toBe(1);
      const half = await mediaOpacity(page, HERO);
      expect(half).toBeGreaterThan(0.3);
      expect(half).toBeLessThan(1);
      // The first screen gone: only the desk, where its scene stands.
      await scrollHero(page, 1);
      expect(await mediaOpacity(page, HERO)).toBe(0);
      expect(await mediaOpacity(page, SERVICES)).toBe(1);
      expect(Math.abs(await deskOffset())).toBeLessThanOrEqual(1);
      // The menu still lands on the scene itself, not on the desk's reach under the hero.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      if (name === 'desktop') {
        await page.locator('[data-part="nav"] a[href="#services"]').click();
        await page.waitForTimeout(800);
        expect(Math.abs(await page.$eval(SERVICES, (el) => el.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
      }
    });

    test('reduced motion: nothing overlaps or holds, both pictures melt into ink, no edge', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport, ...device, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      expect(await page.$eval(SERVICES, (el) => (el as HTMLElement).dataset.seam)).toBeUndefined();
      const bottom = await scrollHero(page, 0.4);
      // The desk's box starts where its scene starts.
      const [media, scene] = await page.$eval(SERVICES, (el) => [el.querySelector('[data-media]')!.getBoundingClientRect().top, el.getBoundingClientRect().top]);
      expect(Math.abs(media! - scene!)).toBeLessThanOrEqual(1);
      const e = await edge(page, Math.round(bottom));
      expect(e.across).toBeLessThanOrEqual(e.near * 1.3);
      await ctx.close();
    });
  });
}
