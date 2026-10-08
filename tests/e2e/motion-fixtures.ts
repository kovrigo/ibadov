// Shared parts of the motion checks (intro, calm, smooth).
import type { BrowserContext, Page } from '@playwright/test';

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
