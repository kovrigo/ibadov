// The phone bar's Telegram button keeps its label and arrow inside the gold frame on every phone
// width. Narrower than 375px it takes the narrow screens' tracking; narrower than 349px the arrow
// would still cross the frame, so the label stands alone, centred.
// Regression: ISSUE-001 — on phones under 360px the arrow crossed the frame, at 360px it touched it.
// Found in the Test stage on 2026-10-08. Report: docs/designs/hero/test.md
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const PHONES = [
  [320, 568],
  [340, 720],
  [348, 720],
  [349, 720],
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [568, 320],
  [844, 390],
] as const;
// The frame's side padding, px (DESIGN.md: the bar button, `lg`).
const PAD = 24;

for (const [w, h] of PHONES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    test('the bar button: label and arrow inside the frame', async ({ page }) => {
      await open(page);
      const { frame, label, arrow } = await page.evaluate(() => {
        const a = document.querySelector('[data-phone-bar] a')!;
        const box = (e: Element) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 ? { x0: r.left, x1: r.right } : null;
        };
        return { frame: box(a)!, label: box(a.querySelector('span')!)!, arrow: box(a.querySelector('svg')!) };
      });
      expect.soft(label.x0 - frame.x0, 'label to the frame, left, px').toBeGreaterThanOrEqual(PAD - 0.5);
      if (w < 349) {
        expect.soft(arrow, 'arrow drawn').toBeNull();
        expect.soft(Math.abs(label.x0 - frame.x0 - (frame.x1 - label.x1)), 'label centred: left and right gaps differ by, px').toBeLessThanOrEqual(1);
        expect.soft(frame.x1 - label.x1, 'label to the frame, right, px').toBeGreaterThanOrEqual(PAD - 0.5);
      } else {
        expect.soft(arrow, 'arrow drawn').not.toBeNull();
        expect.soft(arrow!.x0 - label.x1, 'label to the arrow, px').toBeGreaterThanOrEqual(16 - 0.5);
        expect.soft(frame.x1 - arrow!.x1, 'arrow to the frame, right, px').toBeGreaterThanOrEqual(PAD - 0.5);
      }
    });
  });
}
