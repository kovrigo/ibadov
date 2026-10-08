import { expect, test } from '@playwright/test';
import { cacheImages, hideDevToolbar, warmImages } from './motion-fixtures';

// Motion stays smooth on a phone (plan «Проверки»): 390×844, the processor slowed down 4×, the
// whole page scrolled in about 8 s. No animation frame may take longer than 100ms.
const VIEWPORT = { width: 390, height: 844 };

test('phone, 4× slower CPU: scrolling the whole page never takes a frame over 100ms', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await warmImages(browser, baseURL!, [[VIEWPORT.width, VIEWPORT.height]]);

  const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await cacheImages(ctx);
  await hideDevToolbar(ctx);
  // The intro is measured by its own spec: here the page opens on the first screen.
  await ctx.addInitScript(() => localStorage.setItem('ibadow:intro-seen', '1'));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // The browser reports long animation frames, and a deliberately long one is seen.
  const probe = await page.evaluate(async () => {
    const supported = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
    const seen: number[] = [];
    const po = new PerformanceObserver((list) => seen.push(...list.getEntries().map((e) => e.duration)));
    po.observe({ type: 'long-animation-frame' });
    await new Promise<void>((r) =>
      requestAnimationFrame(() => {
        const end = performance.now() + 150;
        while (performance.now() < end);
        r();
      }),
    );
    await new Promise((r) => setTimeout(r, 300));
    po.disconnect();
    return { supported, seen };
  });
  expect(probe.supported).toBe(true);
  expect(Math.max(0, ...probe.seen)).toBeGreaterThan(100);

  const frames = await page.evaluate(async () => {
    const long: { duration: number; blocking: number; start: number }[] = [];
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { blockingDuration: number })[]) {
        long.push({ duration: e.duration, blocking: e.blockingDuration, start: e.startTime });
      }
    });
    po.observe({ type: 'long-animation-frame' });
    const total = document.documentElement.scrollHeight - innerHeight;
    const duration = 8000;
    const t0 = performance.now();
    let count = 0;
    await new Promise<void>((done) => {
      const step = () => {
        const k = Math.min((performance.now() - t0) / duration, 1);
        window.scrollTo(0, Math.round(total * k));
        count++;
        if (k < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    await new Promise((r) => setTimeout(r, 500));
    po.disconnect();
    return { long, count, total, elapsed: performance.now() - t0, end: scrollY };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const longest = Math.max(0, ...frames.long.map((f) => f.duration));
  console.log(
    `scrolled ${frames.end}/${frames.total}px in ${Math.round(frames.elapsed)}ms, ${frames.count} frames; ` +
      `long animation frames: ${frames.long.length}, longest ${Math.round(longest)}ms`,
  );
  expect(frames.end).toBe(frames.total);
  expect(frames.elapsed).toBeLessThan(12_000);
  expect(longest).toBeLessThanOrEqual(100);
  await ctx.close();
});
