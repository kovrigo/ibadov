import { expect, test, type Page } from '@playwright/test';
import { effectiveOpacity, firstWith, htmlHas, recordClasses, SEEN_KEY } from './motion-fixtures';

// The calm version (Brief «Спокойная версия», DESIGN.md Motion): with reduced motion nothing moves
// or scales, there is no intro, no smoke, no glint; the freeze frame is muted with its caption,
// the cigar is drawn, all content is there. Turned on mid-intro: the ready first screen at once.

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

const IDENTITY = new Set(['none', 'matrix(1, 0, 0, 1, 0, 0)']);

/** Every element motion could move, with its computed transform when it is not the identity. */
function movedElements(page: Page) {
  return page.evaluate(() => {
    const sel = [
      '[data-scene] [data-media]',
      '[data-scene] [data-stack]',
      '[data-scene] [data-stack] > picture',
      '[data-scene] [data-layer]',
      '[data-scene] [data-text]',
      '[data-scene] [data-text] *',
      '[data-scene] [data-accent]',
      '[data-scene] [data-accent] *',
      '[data-opening]',
      '[data-opening] *',
      '[data-grain]',
    ].join(',');
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .map((el) => ({ el, t: getComputedStyle(el).transform }))
      .filter(({ t }) => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)')
      .map(({ el, t }) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} ${t}`);
  });
}

for (const viewport of SIZES) {
  test(`reduced motion at ${viewport.width}×${viewport.height}: nothing moves, everything is there`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await recordClasses(ctx);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'load' });

    // No intro.
    await page.waitForTimeout(500);
    expect(await firstWith(page, 'intro-wait')).toBeUndefined();
    expect(await firstWith(page, 'intro-on')).toBeUndefined();
    await expect(page.locator('[data-opening]')).toBeHidden();

    // Scroll the whole page: no transform anywhere, at every step.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const moved: string[] = [];
    for (let y = 0; y <= total; y += Math.round(viewport.height / 3)) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(120);
      moved.push(...(await movedElements(page)).map((m) => `@${y} ${m}`));
    }
    expect(moved).toEqual([]);

    // All content visible: every text and link inside the scenes at full opacity.
    const faint = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[data-scene] [data-text] *, [data-scene] [data-accent] [data-cigar]')) {
        if (!el.getClientRects().length || el.closest('.visually-hidden')) continue;
        let o = 1;
        for (let e: HTMLElement | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
        if (o < 1 || getComputedStyle(el).visibility !== 'visible') out.push(`${el.tagName} ${el.textContent?.trim().slice(0, 30)} ${o}`);
      }
      return out;
    });
    expect(faint).toEqual([]);

    // Freeze frame: the muted portrait on top, with the caption.
    const freeze = await page.evaluate(() => {
      const muted = document.querySelector<HTMLElement>('[data-scene="freeze"] [data-layer="close-muted"]')!;
      const close = document.querySelector<HTMLElement>('[data-scene="freeze"] [data-layer="close"]')!;
      const above = close.compareDocumentPosition(muted) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { muted: getComputedStyle(muted).opacity, above: !!above, caption: document.querySelector('[data-scene="freeze"] h2')!.textContent };
    });
    expect(freeze).toEqual({ muted: '1', above: true, caption: '№1 риелтор Петербурга' });
    expect(await effectiveOpacity(page, '[data-scene="freeze"] h2')).toBe(1);
    const flash = page.locator('[data-flash]');
    expect(await flash.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    // Cigar drawn and still; no smoke and no glint on show.
    const cigar = page.locator('[data-cigar] svg');
    await cigar.scrollIntoViewIfNeeded();
    await expect(cigar).toBeVisible();
    expect(await effectiveOpacity(page, '[data-cigar] svg')).toBe(1);
    const lit = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-smoke], [data-glint-band]')].filter((el) => Number(getComputedStyle(el).opacity) > 0).length,
    );
    expect(lit).toBe(0);

    // Grain stands still.
    expect(await page.locator('[data-grain]').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await ctx.close();
  });
}

test('reduced motion switched on mid-intro: the ready first screen at once', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await recordClasses(ctx);
  const page = await ctx.newPage();
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.waitForTimeout(1000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // At once: the very next frames.
  await page.waitForFunction(() => !document.documentElement.classList.contains('intro-on'), null, { timeout: 200 });
  await expect(page.locator('[data-opening]')).toBeHidden();
  for (const part of ['credit', 'headline', 'lead']) {
    expect(await effectiveOpacity(page, `[data-scene="hero"] [data-part="${part}"]`)).toBe(1);
  }
  const transforms = await page.$$eval('[data-scene="hero"] [data-stack], [data-scene="hero"] [data-stack] > picture, [data-scene="hero"] [data-layer]', (els) =>
    els.map((e) => getComputedStyle(e).transform),
  );
  for (const t of transforms) expect(IDENTITY.has(t)).toBe(true);
  // And the page stays calm while scrolling on.
  await page.evaluate(() => window.scrollTo(0, innerHeight * 1.5));
  await page.waitForTimeout(300);
  expect(await movedElements(page)).toEqual([]);
  await ctx.close();
});

test('reduced motion turned on and off again later: the headline does not fade in again', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((k) => localStorage.setItem(k, '1'), SEEN_KEY);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const lowest = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel)!;
    let min = 1;
    const end = performance.now() + 600;
    while (performance.now() < end) {
      min = Math.min(min, Number(getComputedStyle(el).opacity));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return min;
  }, '[data-scene="hero"] [data-part="headline"]');
  expect(lowest).toBe(1);
  await ctx.close();
});
