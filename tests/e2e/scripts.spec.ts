// With scripts and motion on (the intro already seen): every scene's text ends visible once its
// cue has played, and image groups whose images fail stay on ink under their texts
// (Brief «Состояния», plan «Отказы»).
import { expect, test } from '@playwright/test';
import { SCENES, SCENE_TEXTS, inPageProbeText, open } from './helpers';
import { SEEN_KEY } from './motion-fixtures';

const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

for (const { name, viewport, ...device } of SIZES) {
  test.describe(`scripts on, ${name}`, () => {
    test.use({ viewport, ...device });
    test.beforeEach(async ({ context }) => {
      await context.addInitScript((k) => localStorage.setItem(k, '1'), SEEN_KEY);
    });

    test('every scene text ends visible after its cue', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      for (const scene of SCENES) {
        for (const text of SCENE_TEXTS[scene]) {
          const first = await page.evaluate(inPageProbeText, { scene, text, scroll: true });
          expect.soft(first.matches, `${scene} «${text}»: elements with this text`).toBe(1);
          await expect
            .poll(async () => (await page.evaluate(inPageProbeText, { scene, text, scroll: false })).opacity, {
              message: `${scene} «${text}»: effective opacity after its cue`,
              timeout: 5000,
            })
            .toBe(1);
        }
      }
    });

    test('images fail: image groups stay on ink, texts stay', async ({ page }) => {
      await page.route('**/*', (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()));
      await open(page);
      await page.waitForTimeout(1000);
      const stacks = await page.$$eval('[data-stack]', (els) =>
        els
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => ({ stack: `${e.closest('[data-scene]')?.getAttribute('data-scene')}/${e.getAttribute('data-stack')}`, loading: e.hasAttribute('data-loading'), opacity: getComputedStyle(e).opacity })),
      );
      expect(stacks.length).toBeGreaterThan(0);
      for (const s of stacks) expect(s).toEqual({ stack: s.stack, loading: true, opacity: '0' });
      for (const text of SCENE_TEXTS.hero) {
        expect((await page.evaluate(inPageProbeText, { scene: 'hero', text, scroll: false })).opacity, `hero «${text}»`).toBe(1);
      }
    });
  });
}
