// Without scripts (Brief «Состояния»: «Без скриптов», «Изображение не загрузилось»).
// Every scene stands in its final state: all texts of «Тексты» visible, links right, no opening,
// images there. With images blocked the same texts and the Telegram button stay on an ink background.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  INK,
  INSTAGRAM,
  SCENES,
  SCENE_TEXTS,
  TELEGRAM,
  fmt,
  inPageImages,
  inPageLinks,
  inPageProbeText,
  layout,
  open,
  scrollTo,
  type Layout,
  type SceneName,
} from './helpers';

const DEVICES = [
  { name: 'desktop 1440x900', viewport: { width: 1440, height: 900 }, phone: false },
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, phone: true },
] as const;

/** A lazy image arrives when its scene is scrolled to. */
const IMAGE_WAIT = 30_000;

/** The Telegram button as the visitor sees it: in its scene on a computer, in the bar on a phone. */
async function checkTelegramButtons(page: Page, tag: string, phone: boolean) {
  const buttons = await page.locator('a[href*="t.me"]').count();
  expect.soft(buttons, `${tag}: Telegram links on the page`).toBeGreaterThan(0);
  const wanted = phone ? ['phone-bar'] : ['hero', 'final'];
  for (const place of wanted) {
    const link = page.locator(place === 'phone-bar' ? '[data-phone-bar] a[href*="t.me"]' : `[data-scene="${place}"] a[href*="t.me"]`);
    expect.soft(await link.count(), `${tag} ${place}: Telegram buttons there`).toBe(1);
    await link.first().scrollIntoViewIfNeeded();
    const info = (await page.evaluate(inPageLinks, 'a[href*="t.me"]')).filter((l) => l.place === place);
    expect.soft(info[0]?.visible, `${tag} ${place}: «${TELEGRAM.label}» visible (box ${info[0] ? fmt(info[0]) : 'none'})`).toBe(true);
    expect.soft(info[0]?.text, `${tag} ${place}: button text`).toBe(TELEGRAM.label);
    expect.soft(info[0]?.href, `${tag} ${place}: button target`).toBe(TELEGRAM.url);
  }
  // The other placement stays hidden: one button per screen.
  const hidden = (await page.evaluate(inPageLinks, 'a[href*="t.me"]')).filter((l) => !wanted.includes(l.place));
  for (const h of hidden) expect.soft(h.rendered, `${tag} ${h.place}: Telegram button that must stay hidden on this screen`).toBe(false);
}

/** Median colour of a screenshot region, per channel. */
async function median(png: Buffer, box: { x0: number; y0: number; x1: number; y1: number }): Promise<number[] | null> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(info.width, Math.ceil(box.x1));
  const y1 = Math.min(info.height, Math.ceil(box.y1));
  const channels = [0, 1, 2].map(() => [] as number[]);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const o = (y * info.width + x) * info.channels;
      for (let c = 0; c < 3; c += 1) channels[c].push(data[o + c]);
    }
  }
  if (channels[0].length < 20) return null;
  return channels.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
}

/**
 * Every text of the Brief is there once, fully opaque, visible, and inside the screen once its element is
 * scrolled to the middle. With `ink`, the background behind each text is the ink colour (median of its box).
 */
async function checkTexts(page: Page, tag: string, ink: boolean) {
  for (const scene of SCENES) {
    for (const text of SCENE_TEXTS[scene]) {
      const where = `${tag} ${scene} «${text.slice(0, 40)}»`;
      const p = await page.evaluate(inPageProbeText, { scene, text, scroll: true });
      expect.soft(p.matches, `${where}: elements whose whole text is this`).toBe(1);
      if (p.matches !== 1) continue;
      expect.soft(p.opacity, `${where}: effective opacity`).toBe(1);
      expect.soft(p.visibility, `${where}: visibility`).toBe('visible');
      const box = { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 };
      expect.soft(p.x1 - p.x0 > 1 && p.y1 - p.y0 > 1, `${where}: has a box (${fmt(box)})`).toBe(true);
      const inside = p.x0 >= -0.5 && p.y0 >= -0.5 && p.x1 <= p.vw + 0.5 && p.y1 <= p.vh + 0.5;
      expect.soft(inside, `${where}: box ${fmt(box)} inside viewport ${p.vw}x${p.vh}`).toBe(true);
      if (ink) {
        const m = await median(await page.screenshot(), box);
        expect.soft(m, `${where}: enough pixels to sample behind the text`).not.toBeNull();
        if (m) {
          const off = Math.max(...m.map((v, i) => Math.abs(v - INK[i])));
          expect.soft(off, `${where}: background median rgb(${m.join(', ')}) against ink rgb(${INK.join(', ')}), largest channel difference`).toBeLessThanOrEqual(8);
        }
      }
    }
  }
  // The «Цифры» heading is for the screen reader: there, but not for the eye.
  const hidden = await page.evaluate(() => {
    const h = document.querySelector('[data-scene="numbers"] h2');
    const r = h?.getBoundingClientRect();
    return { text: h?.textContent?.trim() ?? null, w: r?.width ?? 0, h: r?.height ?? 0 };
  });
  expect.soft(hidden.text, `${tag} numbers: second-level heading`).toBe('Цифры');
  expect.soft(Math.max(hidden.w, hidden.h), `${tag} numbers: «Цифры» box size, px (hidden from the eye, at most 1px)`).toBeLessThanOrEqual(1);
}

for (const d of DEVICES) {
  test.describe(`no scripts, ${d.name}`, () => {
    test.use({ javaScriptEnabled: false, viewport: d.viewport, isMobile: d.phone, hasTouch: d.phone });

    test('every text of the Brief is visible, with the Telegram button', async ({ page }) => {
      test.setTimeout(240_000);
      await open(page);
      await checkTexts(page, d.name, false);
      await checkTelegramButtons(page, d.name, d.phone);
    });

    test('links, footnote, no opening', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      const tag = d.name;

      const telegram = await page.evaluate(inPageLinks, 'a[href*="t.me"]');
      expect.soft(telegram.length, `${tag}: Telegram links on the page`).toBeGreaterThan(0);
      for (const t of telegram) {
        expect.soft(t.href, `${tag} ${t.place}: Telegram link target`).toBe(TELEGRAM.url);
        expect.soft(t.text, `${tag} ${t.place}: Telegram link text`).toBe(TELEGRAM.label);
      }

      const insta = await page.evaluate(inPageLinks, 'a[href*="instagram.com"]');
      expect.soft(insta.length, `${tag}: Instagram links on the page`).toBe(1);
      expect.soft(insta[0]?.href, `${tag}: Instagram link target`).toBe(INSTAGRAM.url);
      expect.soft(insta[0]?.text, `${tag}: Instagram link text`).toBe(INSTAGRAM.label);
      expect.soft(insta[0]?.place, `${tag}: Instagram link sits in the scene`).toBe('final');

      // The Meta footnote stands right under the link, on its left edge.
      const note = await page.evaluate(inPageProbeText, { scene: 'final', text: INSTAGRAM.footnote, scroll: true });
      const link = (await page.evaluate(inPageLinks, 'a[href*="instagram.com"]'))[0];
      expect.soft(note.matches, `${tag}: Meta footnote elements`).toBe(1);
      if (link && note.matches === 1) {
        const dy = note.y0 - link.y1;
        expect.soft(dy, `${tag}: footnote top minus link bottom, px (right under: 0 to 32)`).toBeGreaterThanOrEqual(-1);
        expect.soft(dy, `${tag}: footnote top minus link bottom, px (right under: 0 to 32)`).toBeLessThanOrEqual(32);
        expect.soft(Math.abs(note.x0 - link.x0), `${tag}: footnote left edge against link left edge, px`).toBeLessThanOrEqual(2);
      }

      // No opening: nothing sits in main before the hero, and nothing covers the hero's text.
      await scrollTo(page, 0);
      const before = await page.evaluate(() => {
        const hero = document.querySelector('[data-scene="hero"]');
        const out: string[] = [];
        for (let el = document.querySelector('main')?.firstElementChild ?? null; el && el !== hero; el = el.nextElementSibling) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none' && parseFloat(cs.opacity) > 0) {
            out.push(`<${el.tagName.toLowerCase()} class="${el.className}"> ${Math.round(r.width)}x${Math.round(r.height)} opacity ${cs.opacity}`);
          }
        }
        return out;
      });
      expect.soft(before, `${tag}: visible elements in <main> before the hero (the opening's place)`).toEqual([]);
      const covered = await page.evaluate(() => {
        const h = document.querySelector('[data-scene="hero"] [data-text] > p');
        if (!h) return 'no headline';
        const r = h.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top?.closest('[data-scene="hero"]') ? null : `${top?.tagName.toLowerCase()}.${top?.className}`;
      });
      expect.soft(covered, `${tag}: element on top of the hero headline that is not part of the hero`).toBeNull();
      // Nothing large and visible outside the scenes, the grain and the bar: no overlay of any kind.
      const overlays = await page.evaluate(() => {
        const hero = document.querySelector('[data-scene="hero"]');
        const area = window.innerWidth * window.innerHeight;
        const out: string[] = [];
        for (const el of document.body.querySelectorAll('*')) {
          if (el.closest('[data-scene], [data-grain], [data-phone-bar]') || el.contains(hero)) continue;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width * r.height >= 0.5 * area && cs.visibility === 'visible' && cs.display !== 'none' && parseFloat(cs.opacity) > 0) {
            out.push(`<${el.tagName.toLowerCase()} class="${el.className}"> ${Math.round(r.width)}x${Math.round(r.height)} ${cs.position}`);
          }
        }
        return out;
      });
      expect.soft(overlays, `${tag}: large visible elements outside the scenes, the grain and the bar`).toEqual([]);
    });

    test('images are there', async ({ page }) => {
      test.setTimeout(IMAGE_WAIT * 3);
      await open(page);
      const l: Layout = await layout(page);
      const expected: Record<SceneName, string[]> = {
        hero: l.portrait ? ['phone-back', 'phone-near'] : ['far', 'band', 'near'],
        services: ['photo'],
        freeze: ['close', 'close-muted'],
        numbers: ['plate'],
        partners: ['photo'],
        final: ['photo'],
      };
      for (const scene of SCENES) {
        const s = l.scenes.find((x) => x.name === scene)!;
        await scrollTo(page, Math.min(s.top, Math.max(0, l.docHeight - l.vh)));
        await expect
          .poll(
            async () => {
              // Scene layers only: accent textures (smoke) carry no data-layer.
              const imgs = (await page.evaluate(inPageImages, scene)).filter((i) => i.layer && i.w > 0 && i.h > 0 && !i.blank);
              return imgs.filter((i) => i.complete && i.natW > 1).map((i) => i.layer).sort();
            },
            { timeout: IMAGE_WAIT, intervals: [500], message: `${d.name} ${scene}: loaded image layers (wanted ${expected[scene].join(', ')})` },
          )
          .toEqual([...expected[scene]].sort());
        const imgs = (await page.evaluate(inPageImages, scene)).filter((i) => i.w > 0 && !i.blank);
        const described = imgs.filter((i) => (i.alt ?? '').trim() !== '');
        expect.soft(described.length, `${d.name} ${scene}: images with a description for the screen reader (one per scene)`).toBe(1);
      }
    });

    test('images blocked: texts and the button stay, on ink', async ({ page }) => {
      test.setTimeout(240_000);
      // The Brief's file patterns, and every image request.
      await page.route('**/*', (route) => {
        const request = route.request();
        const byName = /\.(webp|avif|png|jpg)(\?|$)/.test(new URL(request.url()).pathname + new URL(request.url()).search);
        return byName || request.resourceType() === 'image' ? route.abort() : route.continue();
      });
      await open(page);
      const l = await layout(page);
      const rendered = (await page.evaluate(inPageImages, null)).filter((i) => i.w > 0 && i.h > 0 && !i.blank);
      expect.soft(rendered.length, `${d.name}: image elements rendered (they must stay in the page, broken)`).toBeGreaterThan(0);
      expect.soft(rendered.filter((i) => i.natW > 0).length, `${d.name}: images that loaded although blocked`).toBe(0);
      expect.soft(l.scenes.length, `${d.name}: scenes on the page`).toBe(6);
      await checkTexts(page, `${d.name} (images blocked)`, true);
      await checkTelegramButtons(page, `${d.name} (images blocked)`, d.phone);
    });
  });
}
