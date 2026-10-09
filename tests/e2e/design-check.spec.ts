// «Проверка дизайна» (Brief): framing, clear space, type size, filters, proportions, one Telegram button.
// Every screen of «Кадрирование» plus the phone lying down. Layout is measured at rest
// (reducedMotion: reduce), with each scene scrolled so its top meets the viewport top.
// Failures name the screen, the scene and the measured number.
import { expect, test } from '@playwright/test';
import { catalog, screens, textToFace } from '../../src/blocks/images/catalog';
import {
  TELEGRAM,
  boxOf,
  entryFor,
  fmt,
  gap,
  inPageFilters,
  inPageImages,
  inPageLinks,
  inPageProbeText,
  inPageTextBoxes,
  intersect,
  layout,
  margin,
  open,
  overlapArea,
  planStops,
  round,
  sceneMarks,
  scrollTo,
  scrollToSceneTop,
  type Box,
  type SceneName,
} from './helpers';

// The Brief's ten wide screens, the phone lying down (wide scheme, from the plan), the six vertical.
const LYING: readonly [number, number] = [740, 360];
const WIDE_TEN = screens.wide.filter(([w, h]) => w !== LYING[0] || h !== LYING[1]);
const VERTICAL = screens.vertical;

const FRAMED: SceneName[] = ['hero', 'freeze', 'partners', 'final'];
const ALL_SCENES: SceneName[] = ['hero', 'services', 'freeze', 'numbers', 'partners', 'final'];

for (const [w, h] of [...WIDE_TEN, LYING, ...VERTICAL]) {
  const isTen = WIDE_TEN.some(([a, b]) => a === w && b === h);
  const phone = w < 768 || (w === LYING[0] && h === LYING[1]);

  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce', isMobile: phone, hasTouch: phone });

    test(`design check ${w}x${h}`, async ({ page }) => {
      test.setTimeout(240_000);
      const screen = `${w}x${h}`;
      const summary: string[] = [];
      await open(page);
      const l = await layout(page);
      const viewport: Box = { x0: 0, y0: 0, x1: l.vw, y1: l.vh };

      expect.soft(l.vw, `${screen}: layout viewport width`).toBe(w);
      expect.soft(l.vh, `${screen}: layout viewport height`).toBe(h);
      expect.soft(l.portrait, `${screen}: screen shape portrait (height > width)`).toBe(h > w);
      expect.soft(l.scenes.map((s) => s.name), `${screen}: scenes on the page, in order`).toEqual(ALL_SCENES);

      // Brief «Сцены»: every scene at least as tall as the screen.
      for (const s of l.scenes) {
        expect.soft(s.bottom - s.top, `${screen} ${s.name}: scene height against screen height ${h}px`).toBeGreaterThanOrEqual(h - 0.5);
      }

      // ---- Face, dome, clear space ----
      for (const scene of FRAMED) {
        await scrollToSceneTop(page, l, scene);
        const imgs = await page.evaluate(inPageImages, scene);
        const texts = (await page.evaluate(inPageTextBoxes, `[data-scene="${scene}"] [data-text]`)).filter((t) => t.visible);
        const marks = sceneMarks(scene, l.portrait, imgs);
        const where = `${screen} ${scene}`;
        expect.soft(texts.length, `${where}: visible text elements found`).toBeGreaterThan(0);

        const frame = marks.frames.reduce((acc, f) => intersect(acc, f), viewport);
        const inFrame = (name: string, b: Box | undefined) => {
          if (!b) return;
          const m = margin(b, frame);
          expect.soft(m, `${where}: ${name} (${fmt(b)}) distance to the edge of the visible picture (viewport ${w}x${h}), px`).toBeGreaterThanOrEqual(-0.5);
          summary.push(`${scene} ${name} margin ${round(m)}`);
        };

        const faceOutOfFrame = scene === 'final' && l.portrait;
        if (faceOutOfFrame) {
          // Brief «Проверка дизайна»: vertical final has the dome and the edge of a shoulder, no face.
          const face = marks.face!;
          const wInside = Math.max(0, Math.min(face.x1, l.vw) - Math.max(face.x0, 0));
          const area = overlapArea(face, viewport);
          expect.soft(wInside, `${where}: face (${fmt(face)}) width inside the viewport ${w}x${h}, px (must be 0: no face in frame)`).toBeLessThanOrEqual(0.5);
          summary.push(`${scene} face intrusion ${round(wInside)}px (area ${round(area)})`);
        } else {
          inFrame('face', marks.face);
        }
        inFrame('dome', marks.dome);

        if (marks.face && !faceOutOfFrame && texts.length > 0) {
          let nearest = Infinity;
          let nearestText = '';
          for (const t of texts) {
            const d = gap(boxOf(t), marks.face);
            if (d < nearest) {
              nearest = d;
              nearestText = `«${t.text}» (${fmt(boxOf(t))})`;
            }
          }
          const need = scene === 'hero' && isTen ? textToFace.listed : textToFace.anywhere;
          expect.soft(nearest, `${where}: text-to-face distance, px (needs ${need}); nearest ${nearestText}, face ${fmt(marks.face)}`).toBeGreaterThanOrEqual(need - 0.01);
          summary.push(`${scene} text-face ${round(nearest)}px`);
        }

        if (scene === 'hero' && isTen) {
          const dome = marks.dome!;
          expect.soft(l.vw - dome.x1, `${where}: dome (${fmt(dome)}) to the right edge, px (needs 40)`).toBeGreaterThanOrEqual(40 - 0.01);
          const hairPct = (marks.hairTop! / l.vh) * 100;
          expect.soft(hairPct, `${where}: top of the hair at ${round(marks.hairTop!)}px = this % of screen height (needs 5)`).toBeGreaterThanOrEqual(5);
          summary.push(`hero dome→edge ${round(l.vw - dome.x1)}px hair ${round(hairPct)}%`);
        }

        if (scene === 'hero' && l.portrait) {
          // Brief «Первый экран, вертикальная схема»: dome right edge at 95%, face left edge at 17%, ~30px between them.
          const dome = marks.dome!;
          const face = marks.face!;
          expect.soft((dome.x1 / l.vw) * 100, `${where}: dome right edge as % of screen width (Brief: 95)`).toBeCloseTo(95, 0);
          expect.soft((face.x0 / l.vw) * 100, `${where}: face left edge as % of screen width (Brief: 17)`).toBeCloseTo(17, 0);
          const between = dome.x0 - face.x1;
          expect.soft(between, `${where}: space between face and dome, px (Brief: about 30; both whole)`).toBeGreaterThan(0);
          if (w <= 430) expect.soft(between, `${where}: space between face and dome on a phone, px (Brief: about 30, here at least 24)`).toBeGreaterThanOrEqual(24);
          for (const f of marks.frames) {
            expect.soft(f.y0, `${where}: phone window top, px (pinned to the top)`).toBeCloseTo(0, 0);
            expect.soft(f.x1 - f.x0, `${where}: phone window width, px (screen width ${w})`).toBeCloseTo(w, 0);
          }
          summary.push(`hero face→dome ${round(between)}px`);
        }
      }

      // ---- Crop anchors (Brief «Кадрирование») ----
      if (!l.portrait) {
        await scrollToSceneTop(page, l, 'hero');
        const hero = await page.evaluate(inPageImages, 'hero');
        const expected = w / h < 1.55 ? '85% 10%' : '62% 10%';
        for (const layer of ['far', 'band', 'near']) {
          const img = hero.find((i) => i.layer === layer && i.w > 0);
          expect.soft(img?.objectPosition, `${screen} hero: object-position of layer ${layer} (aspect ${round(w / h, 3)}, Brief: ${expected})`).toBe(expected);
        }
        await scrollToSceneTop(page, l, 'final');
        const final = await page.evaluate(inPageImages, 'final');
        expect.soft(final.find((i) => i.w > 0)?.objectPosition, `${screen} final: object-position (Brief: 100% 10%)`).toBe('100% 10%');

        // Headline size: title below 1.55:1 and on the phone lying down, display above.
        await scrollToSceneTop(page, l, 'hero');
        const headline = await page.evaluate(() => {
          const p = document.querySelector<HTMLElement>('[data-scene="hero"] [data-text] > p');
          return p ? parseFloat(getComputedStyle(p).fontSize) : 0;
        });
        await scrollToSceneTop(page, l, 'services');
        const title = (await page.evaluate(inPageProbeText, { scene: 'services', text: 'Вариантов два.', scroll: false })).fontSize;
        const display = (await page.evaluate(inPageProbeText, { scene: 'services', text: 'Купить', scroll: false })).fontSize;
        const wantTitle = w / h < 1.55 || (w === LYING[0] && h === LYING[1]);
        if (wantTitle) {
          expect.soft(headline, `${screen} hero: headline font-size, px (Brief: title = ${title}px here, not display = ${display}px)`).toBe(title);
        } else {
          expect.soft(headline, `${screen} hero: headline font-size, px (Brief: display = ${display}px here, not title = ${title}px)`).toBe(display);
        }
        summary.push(`headline ${headline}px (${wantTitle ? 'title' : 'display'} wanted)`);
      }

      // ---- One «Написать в Telegram» at every stop ----
      const stops = planStops(l);
      for (const stop of stops) {
        await scrollTo(page, stop.y);
        const links = await page.evaluate(inPageLinks, 'a[href*="t.me"]');
        const visible = links.filter((x) => x.visible);
        expect.soft(visible.length, `${screen} stop "${stop.label}" (scrollY ${stop.y}): visible Telegram buttons, ${visible.map((v) => v.place).join(', ') || 'none'}`).toBeLessThanOrEqual(1);
      }
      await scrollTo(page, 0);
      const telegram = await page.evaluate(inPageLinks, 'a[href*="t.me"]');
      for (const t of telegram) {
        expect.soft(t.text, `${screen} ${t.place}: Telegram link text (Brief: only the button «${TELEGRAM.label}»)`).toBe(TELEGRAM.label);
        expect.soft(t.href, `${screen} ${t.place}: Telegram link target`).toBe(TELEGRAM.url);
      }

      // ---- Type size: nothing under 13px ----
      const all = (await page.evaluate(inPageTextBoxes, null)).filter((t) => t.visible);
      expect.soft(all.length, `${screen}: visible text elements on the page`).toBeGreaterThan(5);
      for (const t of all) {
        expect.soft(t.fontSize, `${screen}: font-size of «${t.text}» (${t.tag}), px (needs 13)`).toBeGreaterThanOrEqual(13);
      }
      summary.push(`smallest text ${Math.min(...all.map((t) => t.fontSize))}px`);

      // ---- No filters ----
      expect.soft(await page.evaluate(inPageFilters), `${screen}: elements with a CSS filter or backdrop-filter`).toEqual([]);

      // ---- Proportions ----
      // Every scene's pictures have been scrolled past, so their requests are out: wait for them to land.
      await page.waitForFunction(
        () =>
          [...document.images].every(
            (i) => i.getBoundingClientRect().width === 0 || i.currentSrc.startsWith('data:') || (i.complete && i.naturalWidth > 1),
          ),
        null,
        { timeout: 30_000, polling: 500 },
      );
      const images = await page.evaluate(inPageImages, null);
      const unverified: string[] = [];
      let checked = 0;
      for (const img of images) {
        if (img.w < 1 || img.h < 1 || img.blank) continue;
        const id = `${img.scene}/${img.layer}`;
        const covers = img.objectFit === 'cover' || img.objectFit === 'contain';
        expect.soft(covers || img.natW > 1, `${screen} ${id}: object-fit "${img.objectFit}" (needs cover or contain, or a loaded image whose box keeps its aspect)`).toBe(true);
        if (img.natW <= 1) {
          unverified.push(id);
          continue;
        }
        checked += 1;
        const natural = img.natW / img.natH;
        if (!covers) {
          expect.soft(Math.abs(img.w / img.h / natural - 1), `${screen} ${id}: box aspect ${round(img.w / img.h, 4)} against natural ${round(natural, 4)}`).toBeLessThanOrEqual(0.01);
        }
        if (!img.layer) continue; // accent textures (smoke) are not catalog images
        const entry = catalog[entryFor(img.scene, img.layer, l.portrait)];
        expect.soft(Math.abs(natural / (entry.width / entry.height) - 1), `${screen} ${id}: loaded file aspect ${round(natural, 4)} against catalog ${round(entry.width / entry.height, 4)}`).toBeLessThanOrEqual(0.01);
      }

      expect.soft(unverified, `${screen}: images not loaded`).toEqual([]);
      expect.soft(checked, `${screen}: images whose proportions were checked`).toBeGreaterThan(0);
      console.log(`[design] ${screen}: ${summary.join(' | ')} | proportions checked on ${checked} loaded images`);
    });
  });
}

// Browser zoom 200–300% on short windows (CSS size = window / zoom): scenes grow taller than the
// screen, and the text must still keep its 32px from the face (Brief «Кадрирование»).
for (const [w, h, zoom] of [[640, 317, '1280×633 at 200%'], [512, 253, '1280×633 at 250%'], [427, 211, '1280×633 at 300%'], [480, 263, '1440×789 at 300%']] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    test(`browser zoom, ${zoom}: text clear of the face`, async ({ page }) => {
      await open(page);
      const l = await layout(page);
      for (const scene of FRAMED) {
        await scrollToSceneTop(page, l, scene);
        const texts = (await page.evaluate(inPageTextBoxes, `[data-scene="${scene}"] [data-text]`)).filter((t) => t.visible);
        const face = sceneMarks(scene, l.portrait, await page.evaluate(inPageImages, scene)).face!;
        for (const t of texts) {
          expect.soft(gap(boxOf(t), face), `${w}x${h} ${scene}: «${t.text}» (${fmt(boxOf(t))}) to the face (${fmt(face)}), px`).toBeGreaterThanOrEqual(textToFace.anywhere - 0.01);
        }
      }
    });
  });
}
