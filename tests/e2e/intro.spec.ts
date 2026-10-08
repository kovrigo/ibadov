import { expect, test, type Browser, type Page } from '@playwright/test';
import { cacheImages, classLog, effectiveOpacity, firstWith, hideDevToolbar, htmlHas, htmlLacks, recordClasses, TELEGRAM, warmImages } from './motion-fixtures';

// The intro (Brief «Вступление», plan decision 6): plays on the first visit, ends by 5 s, any key
// gives the ready first screen in 240ms, the Telegram button works during it, and it does not
// come back on a second visit, after Back, on 2G or with reduced motion.
test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SLACK = 150;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await warmImages(browser, baseURL!, [
    [DESKTOP.width, DESKTOP.height],
    [PHONE.width, PHONE.height],
  ]);
});

async function firstVisit(browser: Browser, viewport = DESKTOP, extra: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await cacheImages(ctx);
  await recordClasses(ctx);
  await hideDevToolbar(ctx);
  await ctx.route('https://t.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Telegram</title><p>t.me</p>' }));
  const page = await ctx.newPage();
  return { ctx, page };
}

const telegramIn = (page: Page, where: 'scene' | 'bar') =>
  page.locator(`[data-telegram="${where}"] a[href="${TELEGRAM}"]`).first();

test('first visit plays the intro, ends by 5 s, leaves the ready first screen', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  const start = (await firstWith(page, 'intro-on'))!;
  expect(start).toBeLessThanOrEqual(1500 + SLACK);

  // During the intro: the overlay is up and hidden from screen readers; the button is there.
  const overlay = page.locator('[data-opening]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(telegramIn(page, 'scene')).toBeVisible();
  expect(await effectiveOpacity(page, `[data-telegram="scene"] a`)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('ibadow:intro-seen'))).toBe('1');

  await htmlLacks(page, 'intro-on', 6000);
  const log = await classLog(page);
  const end = log.find(([t, c]) => t > start && !c.includes('intro-on'))![0];
  expect(end - start).toBeGreaterThanOrEqual(4700 - SLACK);
  expect(end - start).toBeLessThanOrEqual(5000);

  await expect(overlay).toBeHidden();
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="credit"]')).toBe(1);
  const pictures = await page.$$eval('[data-scene="hero"] [data-stack] > picture', (els) => els.map((e) => getComputedStyle(e).transform));
  for (const t of pictures) expect(t).toBe('none');
  await ctx.close();
});

test('the phone bar stays visible during the intro', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser, PHONE, { isMobile: true, hasTouch: true });
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  const bar = telegramIn(page, 'bar');
  await expect(bar).toBeVisible();
  expect(await effectiveOpacity(page, '[data-telegram="bar"] a')).toBe(1);
  // Nothing of the intro sits above the bar.
  const box = (await bar.boundingBox())!;
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('a')?.getAttribute('href'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(top).toBe(TELEGRAM);
  await ctx.close();
});

test('a key press gives the ready first screen within 240ms', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    addEventListener('keydown', () => ((window as unknown as { __key: number }).__key = performance.now()), { once: true, capture: true });
  });
  await page.keyboard.press('Shift');
  await htmlLacks(page, 'intro-on', 2000);
  const key = await page.evaluate(() => (window as unknown as { __key: number }).__key);
  const ready = (await classLog(page)).find(([t, c]) => t >= key && !c.includes('intro-on'))![0];
  expect(ready - key).toBeLessThanOrEqual(240 + SLACK);
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  await ctx.close();
});

test('the Telegram button works during the intro (desktop click, phone tap)', async ({ browser }) => {
  for (const [viewport, where, extra] of [
    [DESKTOP, 'scene', {}],
    [PHONE, 'bar', { isMobile: true, hasTouch: true }],
  ] as const) {
    const { ctx, page } = await firstVisit(browser, viewport, extra);
    await page.goto('/');
    await htmlHas(page, 'intro-on', 3000);
    const button = telegramIn(page, where);
    if (where === 'bar') await button.tap();
    else await button.click();
    await page.waitForURL(TELEGRAM, { timeout: 3000 });
    expect(page.url()).toBe(TELEGRAM);
    await ctx.close();
  }
});

test('second visit and Back from Telegram: no intro', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.keyboard.press('Escape');
  await htmlLacks(page, 'intro-on', 2000);

  // Back from Telegram.
  await telegramIn(page, 'scene').click();
  await page.waitForURL(TELEGRAM);
  await page.goBack();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  let cls = await page.evaluate(() => document.documentElement.className);
  expect(cls).not.toContain('intro-on');
  expect(cls).not.toContain('intro-wait');
  await expect(page.locator('[data-opening]')).toBeHidden();

  // A second visit in the same browser.
  await page.goto('/');
  await page.waitForTimeout(2000);
  expect(await firstWith(page, 'intro-wait')).toBeUndefined();
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  cls = await page.evaluate(() => document.documentElement.className);
  expect(cls).toContain('intro-fade');
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  await ctx.close();
});

test('2G: no intro, the first screen at once', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1500,
    downloadThroughput: (256 * 1024) / 8,
    uploadThroughput: (64 * 1024) / 8,
    connectionType: 'cellular2g',
  });
  // The head script decides while the HTML parses: no need to wait for the (throttled) scripts.
  await page.goto('/', { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('[data-scene="hero"] [data-part="headline"]', { state: 'attached', timeout: 30_000 });
  expect(await page.evaluate(() => (navigator as unknown as { connection: { effectiveType: string } }).connection.effectiveType)).toMatch(/2g$/);
  expect(await page.evaluate(() => document.documentElement.className)).not.toContain('intro-wait');
  expect(await firstWith(page, 'intro-wait')).toBeUndefined();
  await page.waitForTimeout(600);
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  await expect(page.locator('[data-opening]')).toBeHidden();
  await ctx.close();
});

test('reduced motion: no intro', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser, DESKTOP, { reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => document.documentElement.className)).toBe('');
  expect(await firstWith(page, 'intro-wait')).toBeUndefined();
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('ibadow:intro-seen'))).toBeNull();
  await ctx.close();
});
