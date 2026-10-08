import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { TELEGRAM } from './helpers';
import { classLog, effectiveOpacity, firstWith, htmlHas, htmlLacks, noIntro, recordClasses } from './motion-fixtures';

// The intro (DESIGN.md Motion «Вступление»): the customer's film plays on every opening of the
// page, a reload too, and dissolves into the ready first screen by 7.8 s; any key, tap or
// «Пропустить» gives the ready first screen in 240ms; the Telegram button works during it. No
// intro after Back, with data saver, on 2G or with reduced motion. Nothing is stored.
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SLACK = 150;

async function firstVisit(browser: Browser, viewport = DESKTOP, extra: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await recordClasses(ctx);
  await ctx.route('https://t.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Telegram</title><p>t.me</p>' }));
  const page = await ctx.newPage();
  return { ctx, page };
}

const telegramIn = (page: Page, where: 'scene' | 'bar') =>
  page.locator(`[data-telegram="${where}"] a[href="${TELEGRAM.url}"]`).first();

const VIDEO = '[data-opening-video]';
const VIDEO_FILE = /\.mp4(\?|$)/;
/** Every request for an intro video file the page makes from now on. */
function videoRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (VIDEO_FILE.test(r.url())) urls.push(r.url());
  });
  return urls;
}

/** Opacity of the hero column's scrim (its ::before). */
const scrimOpacity = (page: Page) =>
  page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-scene="hero"] .scene__column')!, '::before').opacity));
/** Waits until the film has played past `seconds`. */
const filmPast = (page: Page, seconds: number, timeout = 10_000) =>
  page.waitForFunction(([sel, s]) => (document.querySelector(sel as string) as HTMLVideoElement).currentTime > (s as number), [VIDEO, seconds], { timeout });

test('every opening plays the whole film, then the ready first screen; nothing is stored', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  const start = (await firstWith(page, 'intro-on'))!;
  expect(start).toBeLessThanOrEqual(1500 + SLACK);

  // During the intro: the overlay is up and hidden from screen readers. The film plays clear: the
  // first screen's button waits with its text, unseen and not pressable.
  const overlay = page.locator('[data-opening]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  expect(await effectiveOpacity(page, `[data-telegram="scene"] a`)).toBe(0);
  expect(await page.$eval('[data-telegram="scene"] a', (a) => getComputedStyle(a).pointerEvents)).toBe('none');
  await expect(page.locator('[data-opening-skip]')).toBeVisible();
  // The film plays, muted, once.
  await filmPast(page, 0, 2000);
  const video = await page.$eval(VIDEO, (v) => {
    const el = v as HTMLVideoElement;
    return { src: el.currentSrc, muted: el.muted, loop: el.loop, controls: el.controls };
  });
  expect(video).toEqual({ src: expect.stringContaining('intro-cut'), muted: true, loop: false, controls: false });

  // Mid-film (its title is up from 4.3 s): nothing of the first screen over it, the scrim off.
  await filmPast(page, 4.5);
  expect(await effectiveOpacity(page, VIDEO)).toBe(1);
  for (const part of ['credit', 'headline', 'lead', 'nav', 'cue']) {
    expect(await effectiveOpacity(page, `[data-scene="hero"] [data-part="${part}"]`), part).toBe(0);
  }
  expect(await scrimOpacity(page)).toBe(0);

  await htmlLacks(page, 'intro-on', 8000);
  const log = await classLog(page);
  const end = log.find(([t, c]) => t > start && !c.includes('intro-on'))![0];
  expect(end - start).toBeGreaterThanOrEqual(7800 - 300 - SLACK);
  expect(end - start).toBeLessThanOrEqual(8400);
  expect(await scrimOpacity(page)).toBe(1);
  expect(await effectiveOpacity(page, `[data-telegram="scene"] a`)).toBe(1);
  expect(await page.$eval('[data-telegram="scene"] a', (a) => getComputedStyle(a).pointerEvents)).toBe('auto');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);

  await expect(overlay).toBeHidden();
  // The video is let go.
  expect(await page.$eval(VIDEO, (v) => v.getAttribute('src'))).toBeNull();
  for (const part of ['credit', 'headline', 'lead', 'nav', 'cue']) {
    expect(await effectiveOpacity(page, `[data-scene="hero"] [data-part="${part}"]`)).toBe(1);
  }
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
  expect(top).toBe(TELEGRAM.url);
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

test('during the intro: the phone bar opens Telegram; on a computer a click gives the first screen, then the button', async ({ browser }) => {
  {
    const { ctx, page } = await firstVisit(browser, PHONE, { isMobile: true, hasTouch: true });
    await page.goto('/');
    await htmlHas(page, 'intro-on', 3000);
    await telegramIn(page, 'bar').tap();
    await page.waitForURL(TELEGRAM.url, { timeout: 3000 });
    expect(page.url()).toBe(TELEGRAM.url);
    await ctx.close();
  }
  {
    const { ctx, page } = await firstVisit(browser);
    await page.goto('/');
    await htmlHas(page, 'intro-on', 3000);
    await filmPast(page, 1);
    // A real click where the button stands: it is not pressable yet, the click skips the intro.
    const box = (await telegramIn(page, 'scene').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await htmlLacks(page, 'intro-on', 1000);
    expect(page.url()).not.toBe(TELEGRAM.url);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForURL(TELEGRAM.url, { timeout: 3000 });
    await ctx.close();
  }
});

test('«Пропустить» gives the ready first screen within 240ms', async ({ browser }) => {
  for (const [viewport, extra] of [
    [DESKTOP, {}],
    [PHONE, { isMobile: true, hasTouch: true }],
  ] as const) {
    const { ctx, page } = await firstVisit(browser, viewport, extra);
    await page.goto('/');
    await htmlHas(page, 'intro-on', 3000);
    await filmPast(page, 1);
    const skip = page.locator('[data-opening-skip]');
    await expect(skip).toHaveText(/Пропустить/i);
    // Clear of the phone bar and of the Telegram button: what is under its centre is itself.
    const box = (await skip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-opening-skip]'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(true);
    await page.evaluate(() => {
      addEventListener('pointerdown', () => ((window as unknown as { __tap: number }).__tap = performance.now()), { once: true, capture: true });
    });
    if (extra.hasTouch) await skip.tap();
    else await skip.click();
    await htmlLacks(page, 'intro-on', 2000);
    const tap = await page.evaluate(() => (window as unknown as { __tap: number }).__tap);
    const ready = (await classLog(page)).find(([t, c]) => t >= tap && !c.includes('intro-on'))![0];
    expect(ready - tap).toBeLessThanOrEqual(240 + SLACK);
    expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
    await ctx.close();
  }
});

test('a reload and a new visit play the film again; Back from Telegram does not', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.keyboard.press('Escape');
  await htmlLacks(page, 'intro-on', 2000);

  // A reload.
  await page.reload();
  await htmlHas(page, 'intro-on', 3000);
  await filmPast(page, 0.5);
  await page.keyboard.press('Escape');
  await htmlLacks(page, 'intro-on', 2000);

  // A new visit in the same browser.
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.keyboard.press('Escape');
  await htmlLacks(page, 'intro-on', 2000);

  // Back from Telegram.
  await telegramIn(page, 'scene').click();
  await page.waitForURL(TELEGRAM.url);
  await page.goBack();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  const cls = await page.evaluate(() => document.documentElement.className);
  expect(cls).not.toContain('intro-on');
  expect(cls).not.toContain('intro-wait');
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-part="headline"]')).toBe(1);
  await ctx.close();
});

test('portrait: the film fills the screen, then pulls back to its whole width, title inside', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser, PHONE, { isMobile: true, hasTouch: true });
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  const box = () =>
    page.$eval(VIDEO, (v) => {
      const r = v.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
    });
  await filmPast(page, 2);
  const full = await box();
  // It covers the screen.
  expect(full.left).toBeLessThanOrEqual(0);
  expect(full.right).toBeGreaterThanOrEqual(full.vw);
  expect(full.top).toBeLessThanOrEqual(0.5);
  expect(full.bottom).toBeGreaterThanOrEqual(full.vh - 0.5);
  await filmPast(page, 4.8);
  const whole = await box();
  // The frame is 1280 wide; its title spans x 240–1010 at its widest. Both ends are on screen.
  const w = whole.right - whole.left;
  expect(whole.left + (240 / 1280) * w).toBeGreaterThanOrEqual(0);
  expect(whole.left + (1010 / 1280) * w).toBeLessThanOrEqual(whole.vw);
  expect(whole.bottom - whole.top).toBeLessThan(whole.vh);
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
  await ctx.close();
});

const HEADLINE = '[data-scene="hero"] [data-part="headline"]';
const SCRIPT = '**/_astro/*.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Records the headline's opacity on every frame from the first paint (window.__headline). */
async function recordHeadline(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript((sel) => {
    const w = window as unknown as { __headline: [number, number][] };
    w.__headline = [];
    const tick = () => {
      const el = document.querySelector(sel);
      if (el) w.__headline.push([performance.now(), Number(getComputedStyle(el).opacity)]);
      if (performance.now() < 6000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, HEADLINE);
}
const headlineLog = (page: Page) => page.evaluate(() => (window as unknown as { __headline: [number, number][] }).__headline);

test('motion script blocked: the first screen shows itself at 2.5 s', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await ctx.route(SCRIPT, (route) => route.abort());
  await page.goto('/');
  // The head script still chose the intro: the hero waits under ink.
  expect(await page.evaluate(() => document.documentElement.className)).toContain('intro-wait');
  expect(await effectiveOpacity(page, HEADLINE)).toBe(0);
  const pressable = () => page.$eval('[data-telegram="scene"] a', (a) => getComputedStyle(a).pointerEvents);
  expect(await pressable()).toBe('none');
  // CSS alone: 2.5 s, then 480ms of fade.
  await page.waitForFunction(() => performance.now() > 3700, null, { timeout: 10_000, polling: 100 });
  for (const part of ['credit', 'headline', 'lead', 'action', 'nav', 'cue']) {
    expect(await effectiveOpacity(page, `[data-scene="hero"] [data-part="${part}"]`)).toBe(1);
  }
  expect(await pressable()).toBe('auto');
  expect(await effectiveOpacity(page, '[data-opening]')).toBe(0);
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  await ctx.close();
});

test('hero images slow: the film still plays, the images are in when it dissolves', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await ctx.route(/\.(avif|webp)$/, async (route) => {
    await sleep(2500);
    await route.continue().catch(() => undefined);
  });
  await page.goto('/', { waitUntil: 'commit' });
  await htmlHas(page, 'intro-on', 3000);
  await htmlLacks(page, 'intro-on', 9000);
  expect(await effectiveOpacity(page, HEADLINE)).toBe(1);
  expect(await effectiveOpacity(page, '[data-scene="hero"] [data-stack="wide"]')).toBe(1);
  await ctx.close();
});

test('a key press while the intro waits for the film: the first screen, and the film next opening', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await ctx.route(VIDEO_FILE, async (route) => {
    await sleep(2500);
    await route.continue().catch(() => undefined);
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.className)).toContain('intro-wait');
  await page.keyboard.press('Shift');
  await htmlLacks(page, 'intro-wait', 1000);
  await htmlLacks(page, 'intro-on', 1000);
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.className)).toContain('intro-wait');
  await ctx.close();
});

test('video not ready in 1.5 s: no intro, the headline fades in, the download stops', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await recordHeadline(ctx);
  await ctx.route(VIDEO_FILE, async (route) => {
    await sleep(2500);
    await route.continue().catch(() => undefined);
  });
  await page.goto('/', { waitUntil: 'commit' });
  await htmlHas(page, 'intro-fade', 2500);
  await page.waitForTimeout(600);
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  expect(await effectiveOpacity(page, HEADLINE)).toBe(1);
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await page.$eval(VIDEO, (v) => v.getAttribute('src'))).toBeNull();
  // A fade over 480ms, not a cut: the headline is seen part way.
  const fading = (await headlineLog(page)).filter(([, o]) => o > 0.05 && o < 0.95);
  expect(fading.length).toBeGreaterThan(0);
  await ctx.close();
});

test('the video loads only when the intro plays, one file for every screen', async ({ browser }) => {
  for (const [viewport, extra, file] of [
    [DESKTOP, {}, 'intro-cut'],
    [PHONE, { isMobile: true, hasTouch: true }, 'intro-cut'],
  ] as const) {
    const { ctx, page } = await firstVisit(browser, viewport, extra);
    const urls = videoRequests(page);
    await page.goto('/');
    await htmlHas(page, 'intro-on', 3000);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toContain(file);
    await ctx.close();
  }
  // No intro: data saver, reduced motion, an anchor in the address.
  const cases: [string, Parameters<Browser['newContext']>[0], string][] = [
    ['data saver', {}, '/'],
    ['reduced motion', { reducedMotion: 'reduce' }, '/'],
    ['anchor', {}, '/#final'],
  ];
  for (const [name, extra, url] of cases) {
    const { ctx, page } = await firstVisit(browser, DESKTOP, extra);
    if (name === 'data saver') await noIntro(ctx);
    const urls = videoRequests(page);
    await page.goto(url);
    await page.waitForTimeout(2000);
    expect(await firstWith(page, 'intro-on'), name).toBeUndefined();
    expect(urls, name).toEqual([]);
    await ctx.close();
  }
});

test('a motion script later than the 2.5 s reveal: the headline does not fade in twice', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await recordHeadline(ctx);
  await ctx.route(SCRIPT, async (route) => {
    await sleep(3200);
    await route.continue().catch(() => undefined);
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => performance.now() > 5000, null, { timeout: 10_000, polling: 200 });
  const log = await headlineLog(page);
  const shown = log.findIndex(([, o]) => o >= 0.999);
  expect(shown).toBeGreaterThanOrEqual(0);
  const after = log.slice(shown).map(([, o]) => o);
  expect(Math.min(...after)).toBeGreaterThanOrEqual(0.999);
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  await ctx.close();
});

test('leaving through Telegram before the intro played: Back shows no intro', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await ctx.route(VIDEO_FILE, async (route) => {
    await sleep(2500);
    await route.continue().catch(() => undefined);
  });
  await page.goto('/', { waitUntil: 'commit' });
  await htmlHas(page, 'intro-fade', 2500);
  expect(await firstWith(page, 'intro-on')).toBeUndefined();
  await telegramIn(page, 'scene').click();
  await page.waitForURL(TELEGRAM.url);
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForSelector(HEADLINE, { state: 'attached' });
  expect(await firstWith(page, 'intro-wait')).toBeUndefined();
  await ctx.close();
});

test('leaving mid-intro: the page comes back with the first screen ready', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  // What the browser sends as the page goes into the back-forward cache.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const cls = await page.evaluate(() => document.documentElement.className);
  expect(cls).not.toContain('intro-on');
  expect(cls).not.toContain('intro-wait');
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, HEADLINE)).toBe(1);
  await ctx.close();
});

test('turning the screen mid-intro: the ready first screen', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser, PHONE, { isMobile: true, hasTouch: true });
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.setViewportSize({ width: PHONE.height, height: PHONE.width });
  await htmlLacks(page, 'intro-on', 1000);
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, HEADLINE)).toBe(1);
  await ctx.close();
});

test('hiding the page mid-intro (the Telegram app opens): it comes back ready', async ({ browser }) => {
  const { ctx, page } = await firstVisit(browser);
  await page.goto('/');
  await htmlHas(page, 'intro-on', 3000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const cls = await page.evaluate(() => document.documentElement.className);
  expect(cls).not.toContain('intro-on');
  await expect(page.locator('[data-opening]')).toBeHidden();
  expect(await effectiveOpacity(page, HEADLINE)).toBe(1);
  await ctx.close();
});
