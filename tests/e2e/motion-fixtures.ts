// Shared parts of the motion checks (intro, calm, smooth).
//
// The dev server transforms every image on request (seconds per file). On the real site files
// come from a static host, so the intro's 1.5 s window is about the network, not about encoding.
// cacheImages() keeps each image the dev server made once in this worker's memory and serves it
// again at once; warmImages() fills that memory before the timed checks.
import type { Browser, BrowserContext, Page } from '@playwright/test';

type Cached = { status: number; headers: Record<string, string>; body: Buffer };
const images = new Map<string, Cached>();
const IMAGE = /\/_image\?|\.(avif|webp|png|jpe?g)(\?|$)/;

export async function cacheImages(target: BrowserContext | Page): Promise<void> {
  await target.route(IMAGE, async (route) => {
    const url = route.request().url();
    const hit = images.get(url);
    if (hit) return route.fulfill(hit);
    const res = await route.fetch();
    const entry = { status: res.status(), headers: res.headers(), body: await res.body() };
    if (res.ok()) images.set(url, entry);
    return route.fulfill(entry);
  });
}

/** Loads the page at each size and scrolls it through, so every image is in the cache. */
export async function warmImages(browser: Browser, baseURL: string, sizes: [number, number][]): Promise<void> {
  for (const [width, height] of sizes) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await cacheImages(ctx);
    const page = await ctx.newPage();
    await page.goto(baseURL, { waitUntil: 'load' });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= total; y += Math.round(height / 2)) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(50);
    }
    // Every image on show has arrived (hidden ones stay lazy and never load).
    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((i) => i.getClientRects().length > 0 && !i.complete)
          .map((i) => new Promise((r) => (i.addEventListener('load', r, { once: true }), i.addEventListener('error', r, { once: true })))),
      ),
    );
    // The intro's aerial frame is the final scene's file: scrolling past the final cached it.
    await ctx.close();
  }
}

/**
 * Records, in the page, every class change on <html> with its time since navigation start
 * (window.__classLog) and the first time the intro is playing (window.__introStart).
 */
export async function recordClasses(target: BrowserContext | Page): Promise<void> {
  await target.addInitScript(() => {
    const w = window as unknown as { __classLog: [number, string][] };
    w.__classLog = [];
    const log = () => w.__classLog.push([performance.now(), document.documentElement.className]);
    new MutationObserver(log).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
    document.addEventListener('DOMContentLoaded', log);
  });
}

export const classLog = (page: Page) => page.evaluate(() => (window as unknown as { __classLog: [number, string][] }).__classLog);

/** Time (ms since navigation start) when <html> first had `cls`, or undefined. */
export async function firstWith(page: Page, cls: string): Promise<number | undefined> {
  return (await classLog(page)).find(([, c]) => c.split(/\s+/).includes(cls))?.[0];
}

/** Waits until <html> has (or no longer has) a class. */
export async function htmlHas(page: Page, cls: string, timeout = 5000): Promise<void> {
  await page.waitForFunction((c) => document.documentElement.classList.contains(c), cls, { timeout });
}
export async function htmlLacks(page: Page, cls: string, timeout = 5000): Promise<void> {
  await page.waitForFunction((c) => !document.documentElement.classList.contains(c), cls, { timeout });
}

/** Computed opacity of an element times that of all its ancestors. */
export function effectiveOpacity(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    let el: Element | null = document.querySelector(sel);
    let o = 1;
    while (el) {
      o *= Number(getComputedStyle(el).opacity);
      el = el.parentElement;
    }
    return o;
  }, selector);
}

export const TELEGRAM = 'https://t.me/ibadow';

/** The dev server adds its toolbar at the bottom centre, over the phone bar. The built site has none. */
export async function hideDevToolbar(target: BrowserContext | Page): Promise<void> {
  await target.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'astro-dev-toolbar{display:none!important}';
      document.head.append(s);
    });
  });
}
