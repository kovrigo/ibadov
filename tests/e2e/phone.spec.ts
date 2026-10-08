// The phone (Brief «Телефон и доступность», «Связь», «Состояния»): no sideways scroll, one Telegram button
// (the bar's) at every stop, the bar never over text, Tab order, the hero's image bytes, the phone lying down.
// Layout is measured at rest (reducedMotion: reduce).
import { expect, test, type Page, type Response } from '@playwright/test';
import {
  INSTAGRAM,
  SCENES,
  TELEGRAM,
  fmt,
  inPageActive,
  inPageBar,
  inPageFocusableCount,
  inPageImages,
  inPageLinks,
  inPageProbeText,
  inPageTextBoxes,
  layout,
  open,
  overlapArea,
  boxOf,
  planStops,
  round,
  scrollTo,
  scrollToSceneBottom,
  scrollToSceneTop,
  type ActiveInfo,
  type ImageInfo,
  type SceneName,
} from './helpers';

const PHONES = [
  { w: 360, h: 780 },
  { w: 390, h: 844 },
] as const;

const KB = 1000;

for (const { w, h } of PHONES) {
  const screen = `${w}x${h}`;

  test.describe(`phone ${screen}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

    test('no horizontal scroll at any scene, text not cut', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      const l = await layout(page);
      for (const stop of planStops(l)) {
        await scrollTo(page, stop.y);
        const d = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          bsw: document.body.scrollWidth,
        }));
        const where = `${screen} stop "${stop.label}" (scrollY ${stop.y})`;
        expect.soft(d.sw, `${where}: document scrollWidth against clientWidth ${d.cw}px`).toBeLessThanOrEqual(d.cw);
        expect.soft(d.bsw, `${where}: body scrollWidth against clientWidth ${d.cw}px`).toBeLessThanOrEqual(d.cw);
      }
      for (const scene of SCENES) {
        await scrollToSceneTop(page, l, scene);
        expect.soft(await page.evaluate(() => window.scrollX), `${screen} ${scene}: horizontal scroll position`).toBe(0);
        const texts = (await page.evaluate(inPageTextBoxes, `[data-scene="${scene}"] [data-text]`)).filter((t) => t.visible);
        for (const t of texts) {
          expect.soft(t.x0, `${screen} ${scene} «${t.text}»: left edge, px (needs 0 or more)`).toBeGreaterThanOrEqual(-0.5);
          expect.soft(t.x1, `${screen} ${scene} «${t.text}»: right edge, px (screen width ${w})`).toBeLessThanOrEqual(w + 0.5);
        }
      }
    });

    test('one Telegram button at every stop, and it is the bar button', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      const l = await layout(page);
      for (const stop of planStops(l)) {
        await scrollTo(page, stop.y);
        const visible = (await page.evaluate(inPageLinks, 'a[href*="t.me"]')).filter((x) => x.visible);
        const where = `${screen} stop "${stop.label}" (scrollY ${stop.y})`;
        expect.soft(visible.length, `${where}: visible Telegram buttons (${visible.map((v) => v.place).join(', ') || 'none'})`).toBe(1);
        expect.soft(visible[0]?.place, `${where}: where the visible button sits`).toBe('phone-bar');
        expect.soft(visible[0]?.text, `${where}: button text`).toBe(TELEGRAM.label);
        expect.soft(visible[0]?.href, `${where}: button target`).toBe(TELEGRAM.url);
        const bar = await page.evaluate(inPageBar);
        expect.soft(bar.rendered, `${where}: bar rendered`).toBe(true);
        expect.soft(Math.abs(bar.y1 - h), `${where}: bar bottom ${round(bar.y1)} against screen bottom ${h}, px`).toBeLessThanOrEqual(0.5);
      }
      // No Telegram button other than the bar's is drawn on a phone at all.
      const others = (await page.evaluate(inPageLinks, 'a[href*="t.me"]')).filter((x) => x.place !== 'phone-bar' && x.rendered);
      expect.soft(others.map((o) => o.place), `${screen}: in-scene Telegram buttons that are drawn`).toEqual([]);
    });

    test('the bar never covers scene text', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      const l = await layout(page);
      for (const scene of SCENES) {
        await scrollToSceneBottom(page, l, scene);
        const bar = await page.evaluate(inPageBar);
        const barBox = boxOf(bar);
        const texts = (await page.evaluate(inPageTextBoxes, `[data-scene="${scene}"] [data-text]`)).filter((t) => t.visible);
        expect.soft(texts.length, `${screen} ${scene}: visible text elements`).toBeGreaterThan(0);
        for (const t of texts) {
          const area = overlapArea(boxOf(t), barBox);
          expect.soft(area, `${screen} ${scene}: «${t.text}» (${fmt(boxOf(t))}) overlap with the bar (${fmt(barBox)}) when the scene's bottom meets the screen bottom, px²`).toBe(0);
        }
      }
    });

    test('button 56px, bar button label, Instagram hit area 44px', async ({ page }) => {
      await open(page);
      const bar = (await page.evaluate(inPageLinks, '[data-phone-bar] a'))[0];
      expect.soft(bar?.height, `${screen}: bar button height, px (Brief: 56)`).toBeCloseTo(56, 0);
      const insta = (await page.evaluate(inPageLinks, `a[href="${INSTAGRAM.url}"]`))[0];
      expect.soft(insta?.height, `${screen}: Instagram link hit area height, px (Brief: at least 44)`).toBeGreaterThanOrEqual(44);
      expect.soft(insta?.width, `${screen}: Instagram link hit area width, px (Brief: at least 44)`).toBeGreaterThanOrEqual(44);
    });
  });
}

test.describe('phone keyboard 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('Tab after the hero text reaches the bar button', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const count = await page.evaluate(inPageFocusableCount);
    const reached: ActiveInfo[] = [];
    for (let i = 0; i < count + 2; i += 1) {
      await page.keyboard.press('Tab');
      const a = await page.evaluate(inPageActive);
      if (!a) break;
      if (reached.some((o) => o.place === a.place && o.href === a.href && o.text === a.text && o.tag === a.tag)) break;
      reached.push(a);
    }
    const order = reached;
    console.log(`[phone] 390x844 Tab order (${count} focusable elements rendered): ${reached.map((o, i) => `${i + 1}. ${o.place} <${o.tag}> «${o.text}» ${o.href ?? ''}`).join(' → ') || 'none'}`);

    const bar = order.findIndex((o) => o.place === 'phone-bar');
    expect.soft(bar, `390x844: place of the bar button in the Tab order ${JSON.stringify(order.map((o) => o.place))}`).toBeGreaterThanOrEqual(0);
    const before = order.slice(0, Math.max(bar, 0));
    expect.soft(before.every((o) => o.place === 'hero'), `390x844: targets before the bar button must all be the hero's; got ${JSON.stringify(before.map((o) => o.place))}`).toBe(true);
    expect.soft(order.filter((o) => o.place === 'hero').length, `390x844: hero targets (all come before the bar button, index ${bar})`).toBe(before.length);
    expect.soft(order[bar]?.text, `390x844: bar target text`).toBe(TELEGRAM.label);
    expect.soft(order[bar]?.href, `390x844: bar target href`).toBe(TELEGRAM.url);
    // The rest follows the page: scenes in their order.
    const rank = order.map((o) => (o.place === 'phone-bar' ? 0.5 : SCENES.indexOf(o.place as SceneName)));
    expect.soft(rank, `390x844: Tab order against page order, ranks ${JSON.stringify(rank)}`).toEqual([...rank].sort((a, b) => a - b));
    expect.soft(order.length, `390x844: focus targets reached`).toBeGreaterThanOrEqual(2);
  });
});

// ---- Hero image bytes ----

interface Loaded {
  layer: string;
  url: string;
  encoded: number;
  decoded: number;
}

/** Encoded body sizes of the hero's layer images that load on this screen. */
async function heroBytes(page: Page): Promise<{ items: Loaded[]; total: number; previewBytes: number }> {
  const responses = new Map<string, Response>();
  page.on('response', (r) => {
    if (r.request().resourceType() === 'image') responses.set(r.url(), r);
  });
  await open(page);
  const l = await layout(page);
  const want = l.portrait ? ['phone-back', 'phone-near'] : ['band', 'far', 'near'];
  const rendered = async (): Promise<ImageInfo[]> =>
    (await page.evaluate(inPageImages, 'hero')).filter((i) => i.w > 0 && i.h > 0 && !i.blank);
  await expect
    .poll(async () => (await rendered()).filter((i) => i.complete && i.natW > 1).map((i) => i.layer).sort(), {
      timeout: 150_000,
      intervals: [500],
      message: `hero layers loaded (wanted ${want.join(', ')})`,
    })
    .toEqual(want);
  const items: Loaded[] = [];
  for (const img of await rendered()) {
    const response = responses.get(img.src);
    expect(response, `hero layer ${img.layer}: no network response for ${img.src}`).toBeDefined();
    const sizes = await response!.request().sizes();
    items.push({ layer: img.layer, url: img.src, encoded: sizes.responseBodySize, decoded: (await response!.body()).length });
  }
  // The blurred preview behind the hero's layers is a data URI; its size is reported, not judged.
  const previewBytes = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-scene="hero"] *')) {
      if (el.getBoundingClientRect().width === 0) continue;
      const m = getComputedStyle(el).backgroundImage.match(/^url\("?data:[^,]*;base64,([^")]*)"?\)$/);
      if (m) return Math.floor((m[1].length * 3) / 4);
    }
    return -1;
  });
  return { items, total: items.reduce((sum, i) => sum + i.encoded, 0), previewBytes };
}

function report(screen: string, got: { items: Loaded[]; total: number; previewBytes: number }, budget: number) {
  const parts = got.items.map((i) => `${i.layer} ${i.encoded} B (body ${i.decoded} B)`).join(', ');
  console.log(`[phone] hero bytes ${screen}: ${got.total} B = ${round(got.total / KB, 1)} KB of ${budget / KB} KB; layers: ${parts}; preview ${got.previewBytes} B`);
}

test.describe('hero image bytes 390x844 dpr 3', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('at most 150 KB', async ({ page }) => {
    test.setTimeout(240_000);
    const got = await heroBytes(page);
    report('390x844 dpr3', got, 150 * KB);
    for (const i of got.items) expect.soft(i.encoded, `390x844 dpr3 hero layer ${i.layer}: encoded body size, bytes`).toBeGreaterThan(0);
    expect.soft(got.total, `390x844 dpr3: hero layer images, encoded bytes in total (${got.items.map((i) => `${i.layer} ${i.encoded}`).join(', ')}); budget ${150 * KB}`).toBeLessThanOrEqual(150 * KB);
  });
});

test.describe('hero image bytes 1440x900 dpr 1', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });

  test('at most 250 KB', async ({ page }) => {
    test.setTimeout(240_000);
    const got = await heroBytes(page);
    report('1440x900 dpr1', got, 250 * KB);
    for (const i of got.items) expect.soft(i.encoded, `1440x900 dpr1 hero layer ${i.layer}: encoded body size, bytes`).toBeGreaterThan(0);
    expect.soft(got.total, `1440x900 dpr1: hero layer images, encoded bytes in total (${got.items.map((i) => `${i.layer} ${i.encoded}`).join(', ')}); budget ${250 * KB}`).toBeLessThanOrEqual(250 * KB);
  });
});

// ---- The phone lying down ----

test.describe('phone lying down 740x360', () => {
  test.use({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('wide scheme, the bar with one button, no in-scene button', async ({ page }) => {
    test.setTimeout(120_000);
    const screen = '740x360';
    await open(page);
    const l = await layout(page);
    expect.soft(l.portrait, `${screen}: screen shape is portrait`).toBe(false);

    // Wide scheme: the wide stack is drawn, the vertical one is not.
    const stacks = await page.evaluate(() => {
      const box = (name: string) => {
        const e = document.querySelector(`[data-scene="hero"] [data-stack="${name}"]`);
        const r = e?.getBoundingClientRect();
        return { w: r?.width ?? 0, h: r?.height ?? 0 };
      };
      return { wide: box('wide'), vertical: box('vertical') };
    });
    expect.soft(stacks.wide.w * stacks.wide.h, `${screen}: wide hero stack area, px² (drawn: ${round(stacks.wide.w)}x${round(stacks.wide.h)})`).toBeGreaterThan(0);
    expect.soft(stacks.vertical.w * stacks.vertical.h, `${screen}: vertical hero stack area, px² (must not be drawn)`).toBe(0);

    for (const stop of planStops(l)) {
      await scrollTo(page, stop.y);
      const where = `${screen} stop "${stop.label}" (scrollY ${stop.y})`;
      const links = await page.evaluate(inPageLinks, 'a[href*="t.me"]');
      const visible = links.filter((x) => x.visible);
      expect.soft(visible.length, `${where}: visible Telegram buttons (${visible.map((v) => v.place).join(', ') || 'none'})`).toBe(1);
      expect.soft(visible[0]?.place, `${where}: where the visible button sits`).toBe('phone-bar');
      const bar = await page.evaluate(inPageBar);
      expect.soft(bar.rendered, `${where}: bar rendered`).toBe(true);
      expect.soft(Math.abs(bar.y1 - l.vh), `${where}: bar bottom ${round(bar.y1)} against screen bottom ${l.vh}, px`).toBeLessThanOrEqual(0.5);
      const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect.soft(d.sw, `${where}: document scrollWidth against clientWidth ${d.cw}px`).toBeLessThanOrEqual(d.cw);
    }
    const scene = (await page.evaluate(inPageLinks, 'a[href*="t.me"]')).filter((x) => x.place !== 'phone-bar' && x.rendered);
    expect.soft(scene.map((s) => s.place), `${screen}: in-scene Telegram buttons that are drawn`).toEqual([]);

    // Headings are title size here (Brief «Кадрирование»).
    await scrollToSceneTop(page, l, 'hero');
    const headline = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>('[data-scene="hero"] [data-text] > p');
      return p ? parseFloat(getComputedStyle(p).fontSize) : 0;
    });
    const title = (await page.evaluate(inPageProbeText, { scene: 'services', text: 'Вариантов два.', scroll: false })).fontSize;
    expect.soft(headline, `${screen}: hero headline font-size, px (title = ${title})`).toBe(title);
  });
});

test.describe('phone turned 390x844 → 844x390', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('the wide image group waits for its real images, then shows', async ({ page }) => {
    await open(page);
    const wide = page.locator('[data-scene="hero"] [data-stack="wide"]');
    // Upright, its layers show the 1px blank: the group counts as loading, not ready.
    await expect(wide).toHaveAttribute('data-loading', '');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(wide).not.toHaveAttribute('data-loading', { timeout: 15_000 });
    const layers = await wide.locator('img').evaluateAll((els) =>
      els.map((i) => ({ layer: (i as HTMLImageElement).dataset.layer, blank: (i as HTMLImageElement).currentSrc.startsWith('data:'), loaded: (i as HTMLImageElement).naturalWidth > 1 })),
    );
    for (const l of layers) expect(l).toEqual({ layer: l.layer, blank: false, loaded: true });
  });
});

for (const device of [
  { name: 'phone lying down', isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop zoomed to 250%', isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]) {
  test.describe(`${device.name} 568x320`, () => {
    test.use({ viewport: { width: 568, height: 320 }, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor, reducedMotion: 'reduce' });

    test('no sideways scroll, even where a full text column and its scrim meet the edge', async ({ page }) => {
      await open(page);
      const l = await layout(page);
      for (const scene of SCENES) {
        await scrollToSceneTop(page, l, scene);
        await page.evaluate(() => window.scrollTo({ left: 200, behavior: 'instant' as ScrollBehavior }));
        const m = await page.evaluate(() => ({ scrollX, wider: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        expect({ scene, ...m }).toEqual({ scene, scrollX: 0, wider: 0 });
      }
    });
  });
}
