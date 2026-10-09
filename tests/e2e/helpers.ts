// Shared parts of the browser checks nojs, phone and design-check.
//
// Functions named inPage* run inside the browser (page.evaluate): they must stay self-contained,
// with no reference to anything outside their own body. Everything else runs in the test.
//
// Geometry comes from src/blocks/images/geometry.ts and the marks from catalog.ts; this file only
// reads the rendered <img> box and its computed object-position and hands both to them.
import type { Page } from '@playwright/test';
import { catalog, type ImageName, type Marks } from '../../src/blocks/images/catalog';
import { cover, mapBox, type Box, type Fit } from '../../src/blocks/images/geometry';

export type { Box };

export const SCENES = ['hero', 'services', 'freeze', 'numbers', 'partners', 'final'] as const;
export type SceneName = (typeof SCENES)[number];

export const TELEGRAM = { url: 'https://t.me/ibadow', label: 'Написать в Telegram' } as const;
export const INSTAGRAM = {
  url: 'https://instagram.com/ibadow',
  label: 'Instagram',
  footnote: 'Instagram принадлежит Meta, признанной экстремистской организацией в РФ',
} as const;

/** Brief «Тексты», word for word, per scene. Buttons and the hidden «Цифры» heading are checked apart. */
export const SCENE_TEXTS: Record<SceneName, string[]> = {
  hero: ['Сергей Ибадов', 'Петербург знает своих.', 'Риелтор в Санкт-Петербурге. Покупка и продажа недвижимости.'],
  services: ['Вариантов два.', 'Купить', 'Продать'],
  freeze: ['Сергей Ибадов', '№1 риелтор Петербурга'],
  numbers: ['Продажи за 2025 год', 'больше', '1 млрд', 'рублей', 'Больше', '100 тысяч', 'подписчиков в Instagram'],
  partners: ['Партнёрство с застройщиками', 'Yard', 'Elements'],
  final: ['Ваш ход. Поговорим?', 'Сергей Ибадов', 'Риелтор в Санкт-Петербурге', INSTAGRAM.label, INSTAGRAM.footnote],
};

/** The ink token (DESIGN.md), as the screenshot sees it. */
export const INK = [11, 9, 8] as const;

export const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

// ---------------------------------------------------------------------------------------------
// In the page
// ---------------------------------------------------------------------------------------------

export interface Layout {
  scenes: { name: string; top: number; bottom: number }[];
  vw: number;
  vh: number;
  docHeight: number;
  portrait: boolean;
}

export function inPageLayout(): Layout {
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')].map((s) => {
    const r = s.getBoundingClientRect();
    return { name: s.dataset.scene ?? '', top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
  });
  return {
    scenes,
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    docHeight: document.documentElement.scrollHeight,
    portrait: window.matchMedia('(orientation: portrait)').matches,
  };
}

export interface TextBox {
  text: string;
  tag: string;
  link: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fontSize: number;
  visible: boolean;
}

/** Every text-bearing element under `root` (CSS selector; whole body when null). A link counts with its own box. */
export function inPageTextBoxes(root: string | null): TextBox[] {
  const scope = root ? document.querySelector(root) : document.body;
  const out: TextBox[] = [];
  if (!scope) return out;
  const effOpacity = (el: Element | null) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  };
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.nodeValue || !n.nodeValue.trim() || seen.has(el)) continue;
    if (el.closest('script, style, noscript, template, svg')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const link = el.closest('a');
    const r = (link ?? el).getBoundingClientRect();
    out.push({
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      tag: el.tagName.toLowerCase(),
      link: !!link,
      x0: r.left,
      y0: r.top,
      x1: r.right,
      y1: r.bottom,
      fontSize: parseFloat(cs.fontSize),
      visible: r.width > 1 && r.height > 1 && cs.visibility === 'visible' && effOpacity(el) > 0.01,
    });
  }
  return out;
}

export interface TextProbe {
  matches: number;
  opacity: number;
  visibility: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vw: number;
  vh: number;
  fontSize: number;
}

/**
 * Finds the one element in `scene` whose whole text is `text` (the deepest such element), scrolls it to
 * the middle of the screen and reports its effective opacity, visibility and box.
 */
export function inPageProbeText(arg: { scene: string; text: string; scroll: boolean }): TextProbe {
  const section = document.querySelector(`[data-scene="${arg.scene}"]`);
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  const found: Element[] = [];
  if (section) {
    for (const el of section.querySelectorAll('*')) {
      if (norm(el.textContent) !== arg.text) continue;
      if ([...el.children].some((c) => norm(c.textContent) === arg.text)) continue;
      found.push(el);
    }
  }
  const el = found[0];
  if (!el) {
    return { matches: 0, opacity: 0, visibility: 'none', x0: 0, y0: 0, x1: 0, y1: 0, vw: 0, vh: 0, fontSize: 0 };
  }
  if (arg.scroll) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
  let opacity = 1;
  for (let e: Element | null = el; e; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    matches: found.length,
    opacity,
    visibility: cs.visibility,
    x0: r.left,
    y0: r.top,
    x1: r.right,
    y1: r.bottom,
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    fontSize: parseFloat(cs.fontSize),
  };
}

export interface LinkInfo {
  href: string | null;
  text: string;
  /** 'phone-bar', a scene name, or 'outside'. */
  place: string;
  /** Telegram placement attribute of the button wrapper, when there is one. */
  placement: string | null;
  /** Box exists, visibility visible, effective opacity above zero, and the box meets the viewport. */
  visible: boolean;
  /** Same, without the viewport condition. */
  rendered: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

export function inPageLinks(selector: string): LinkInfo[] {
  return [...document.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => {
    const r = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    let opacity = 1;
    for (let e: Element | null = a; e; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
    const rendered = r.width > 0 && r.height > 0 && cs.visibility === 'visible' && opacity > 0.01;
    const inView =
      r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < document.documentElement.clientWidth;
    return {
      href: a.getAttribute('href'),
      text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
      place: a.closest('[data-phone-bar]')
        ? 'phone-bar'
        : (a.closest('[data-scene]')?.getAttribute('data-scene') ?? 'outside'),
      placement: a.closest('[data-telegram]')?.getAttribute('data-telegram') ?? null,
      visible: rendered && inView,
      rendered,
      x0: r.left,
      y0: r.top,
      x1: r.right,
      y1: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

export interface ImageInfo {
  scene: string;
  layer: string;
  x: number;
  y: number;
  w: number;
  h: number;
  natW: number;
  natH: number;
  complete: boolean;
  blank: boolean;
  objectFit: string;
  objectPosition: string;
  src: string;
  alt: string | null;
}

export function inPageImages(scene: string | null): ImageInfo[] {
  const root: ParentNode | null = scene ? document.querySelector(`[data-scene="${scene}"]`) : document;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLImageElement>('img')].map((img) => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      scene: img.closest('[data-scene]')?.getAttribute('data-scene') ?? '',
      layer: img.dataset.layer ?? '',
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      natW: img.naturalWidth,
      natH: img.naturalHeight,
      complete: img.complete,
      blank: img.currentSrc.startsWith('data:'),
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      src: img.currentSrc,
      alt: img.getAttribute('alt'),
    };
  });
}

/** Elements (and their ::before/::after) whose computed filter or backdrop-filter is not none. */
export function inPageFilters(): string[] {
  const bad: string[] = [];
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const filter = cs.filter;
      const backdrop = cs.getPropertyValue('backdrop-filter');
      if ((filter && filter !== 'none') || (backdrop && backdrop !== 'none')) {
        const id = el.getAttribute('data-layer') ?? el.getAttribute('data-scene') ?? el.className;
        bad.push(`${el.tagName.toLowerCase()}${pseudo ?? ''}[${String(id)}] filter=${filter} backdrop-filter=${backdrop}`);
      }
    }
  }
  return bad;
}

export interface ActiveInfo {
  tag: string;
  text: string;
  href: string | null;
  place: string;
}

export function inPageActive(): ActiveInfo | null {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return null;
  return {
    tag: a.tagName.toLowerCase(),
    text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    href: a.getAttribute('href'),
    place: a.closest('[data-phone-bar]')
      ? 'phone-bar'
      : (a.closest('[data-scene]')?.getAttribute('data-scene') ?? 'outside'),
  };
}

export function inPageFocusableCount(): number {
  const sel = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length > 0).length;
}

export interface BarInfo {
  exists: boolean;
  rendered: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function inPageBar(): BarInfo {
  const bar = document.querySelector('[data-phone-bar]');
  if (!bar) return { exists: false, rendered: false, x0: 0, y0: 0, x1: 0, y1: 0 };
  const r = bar.getBoundingClientRect();
  const cs = getComputedStyle(bar);
  return {
    exists: true,
    rendered: r.width > 0 && r.height > 0 && cs.visibility === 'visible',
    x0: r.left,
    y0: r.top,
    x1: r.right,
    y1: r.bottom,
  };
}

// ---------------------------------------------------------------------------------------------
// In the test
// ---------------------------------------------------------------------------------------------

/** Open the page and wait until the fonts are in, so every box is measured in its final type. */
export async function open(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load("300 16px 'Noto Serif Display'", 'Сергей Ибадов №1'),
      document.fonts.load('300 16px Montserrat', 'Сергей Ибадов'),
      document.fonts.load('400 16px Montserrat', 'Написать в Telegram'),
    ]);
    await document.fonts.ready;
  });
}

export async function layout(page: Page): Promise<Layout> {
  return page.evaluate(inPageLayout);
}

/** Scroll to document y. Page timers and frame callbacks do not run without scripts, so the wait is the test's. */
export async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y);
  await page.waitForTimeout(50);
}

export function sceneOf(l: Layout, name: SceneName) {
  const s = l.scenes.find((x) => x.name === name);
  if (!s) throw new Error(`scene ${name} is not on the page`);
  return s;
}

/** Scroll so the scene's top meets the viewport top (clamped to the page). */
export async function scrollToSceneTop(page: Page, l: Layout, name: SceneName): Promise<void> {
  await scrollTo(page, Math.min(sceneOf(l, name).top, Math.max(0, l.docHeight - l.vh)));
}

/** Scroll so the scene's bottom meets the viewport bottom. */
export async function scrollToSceneBottom(page: Page, l: Layout, name: SceneName): Promise<void> {
  await scrollTo(page, Math.min(Math.max(0, sceneOf(l, name).bottom - l.vh), Math.max(0, l.docHeight - l.vh)));
}

export interface Stop {
  y: number;
  label: string;
}

/** Scene tops, scene bottoms against the viewport bottom, and a half-screen step down the whole page. */
export function planStops(l: Layout): Stop[] {
  const max = Math.max(0, l.docHeight - l.vh);
  const found = new Map<number, string>();
  const add = (y: number, label: string) => {
    const key = Math.round(Math.min(Math.max(y, 0), max));
    if (!found.has(key)) found.set(key, label);
  };
  for (const s of l.scenes) {
    add(s.top, `${s.name} top`);
    add(s.bottom - l.vh, `${s.name} bottom`);
  }
  for (let y = 0; y <= max; y += l.vh / 2) add(y, `scroll ${Math.round(y)}`);
  add(max, 'page end');
  return [...found].sort((a, b) => a[0] - b[0]).map(([y, label]) => ({ y, label }));
}

export function gap(a: Box, b: Box): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
  return Math.hypot(dx, dy);
}

export function boxOf(t: { x0: number; y0: number; x1: number; y1: number }): Box {
  return { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 };
}

/** Overlapping area of two boxes, 0 when they only touch. */
export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Smallest distance from the box to the frame's edges, negative when it sticks out. */
export function margin(b: Box, frame: Box): number {
  return Math.min(b.x0 - frame.x0, b.y0 - frame.y0, frame.x1 - b.x1, frame.y1 - b.y1);
}

export function intersect(a: Box, b: Box): Box {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}

export const fmt = (b: Box) => `x ${round(b.x0)}–${round(b.x1)}, y ${round(b.y0)}–${round(b.y1)}`;

// ---- Image marks on the screen ----

/** The catalog entry the rendered layer shows. Services and final swap their picture with the screen's shape. */
export function entryFor(scene: string, layer: string, portrait: boolean): ImageName {
  const table: Record<string, Record<string, ImageName>> = {
    hero: {
      far: 'balcony-far',
      band: 'balcony-band',
      near: 'balcony-near',
      'phone-back': 'balcony-phone-back',
      'phone-near': 'balcony-phone-near',
    },
    services: { photo: portrait ? 'desk-vertical' : 'desk' },
    freeze: { close: 'close', 'close-muted': 'close-muted' },
    numbers: { plate: 'plate-numbers' },
    partners: { photo: 'stairs' },
    final: { photo: portrait ? 'aerial-vertical' : 'aerial' },
  };
  const name = table[scene]?.[layer];
  if (!name) throw new Error(`no catalog entry for ${scene}/${layer}`);
  return name;
}

function axis(token: string, free: number, what: string): number {
  if (token.endsWith('%')) return (parseFloat(token) / 100) * free;
  if (token.endsWith('px')) return parseFloat(token);
  throw new Error(`${what}: cannot read object-position part "${token}"`);
}

/** Cover fit of the rendered <img>: scale from geometry.cover, offsets from its computed object-position. */
export function fitOf(img: ImageInfo, entry: ImageName): Fit {
  if (img.objectFit !== 'cover') {
    throw new Error(`${img.scene}/${img.layer}: object-fit is "${img.objectFit}", the marks map assumes cover`);
  }
  const e = catalog[entry];
  const base = cover({ width: e.width, height: e.height }, { width: img.w, height: img.h }, { x: 0, y: 0 });
  const [px, py] = img.objectPosition.split(/\s+/);
  const what = `${img.scene}/${img.layer}`;
  return { ...base, offsetX: axis(px, img.w - base.width, what), offsetY: axis(py, img.h - base.height, what) };
}

/** A mark (source pixels) as a box in viewport coordinates. */
export function screenBox(img: ImageInfo, entry: ImageName, mark: Box): Box {
  const b = mapBox(fitOf(img, entry), mark);
  return { x0: img.x + b.x0, y0: img.y + b.y0, x1: img.x + b.x1, y1: img.y + b.y1 };
}

export function screenY(img: ImageInfo, entry: ImageName, sourceY: number): number {
  const fit = fitOf(img, entry);
  return img.y + fit.offsetY + sourceY * fit.scale;
}

export function marksOf(entry: ImageName): Marks {
  return catalog[entry].marks as Marks;
}

export function imgFor(imgs: ImageInfo[], scene: string, layer: string): ImageInfo {
  const img = imgs.find((i) => i.scene === scene && i.layer === layer && !i.blank && i.w > 0 && i.h > 0);
  if (!img) throw new Error(`no rendered <img data-layer="${layer}"> in scene ${scene}`);
  return img;
}

export interface SceneMarks {
  face?: Box;
  dome?: Box;
  /** Screen y of the top of the hair. */
  hairTop?: number;
  /** The rendered image's own box (the part of the page the picture covers). */
  frames: Box[];
}

/** Face and dome of the scene on the screen, from the rendered images. Scenes without them return nothing. */
export function sceneMarks(scene: SceneName, portrait: boolean, imgs: ImageInfo[]): SceneMarks {
  const frameOf = (i: ImageInfo): Box => ({ x0: i.x, y0: i.y, x1: i.x + i.w, y1: i.y + i.h });
  if (scene === 'hero' && !portrait) {
    const img = imgFor(imgs, 'hero', 'near');
    const entry = entryFor('hero', 'near', portrait);
    const m = marksOf(entry);
    return {
      face: screenBox(img, entry, m.face!),
      dome: screenBox(img, entry, m.dome!),
      hairTop: screenY(img, entry, m.hairTop!),
      frames: [frameOf(img)],
    };
  }
  if (scene === 'hero') {
    const back = imgFor(imgs, 'hero', 'phone-back');
    const near = imgFor(imgs, 'hero', 'phone-near');
    const eb = entryFor('hero', 'phone-back', portrait);
    const en = entryFor('hero', 'phone-near', portrait);
    return {
      dome: screenBox(back, eb, marksOf(eb).dome!),
      face: screenBox(near, en, marksOf(en).face!),
      hairTop: screenY(near, en, marksOf(en).hairTop!),
      frames: [frameOf(back), frameOf(near)],
    };
  }
  if (scene === 'freeze' || scene === 'partners') {
    const layer = scene === 'freeze' ? 'close-muted' : 'photo';
    const img = imgFor(imgs, scene, layer);
    const entry = entryFor(scene, layer, portrait);
    return { face: screenBox(img, entry, marksOf(entry).face!), frames: [frameOf(img)] };
  }
  if (scene === 'final') {
    const img = imgFor(imgs, 'final', 'photo');
    const entry = entryFor('final', 'photo', portrait);
    const m = marksOf(entry);
    return { face: screenBox(img, entry, m.face!), dome: screenBox(img, entry, m.dome!), frames: [frameOf(img)] };
  }
  return { frames: [] };
}
