import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { texts } from '../src/blocks/texts';

// Checks dist/index.html after `SITE_URL=… bun run build`.
const file = path.resolve(import.meta.dir, '..', 'dist', 'index.html');
if (!existsSync(file)) throw new Error('dist/index.html is missing: run `SITE_URL=https://example.test bun run build` first');
const html = readFileSync(file, 'utf8');

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&');

const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
const meta = (attr: 'name' | 'property', key: string) =>
  decode(head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? '');
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const sections = [...body.matchAll(/<section[^>]*data-scene="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({
  name: m[1]!,
  html: m[2]!,
}));

describe('built page', () => {
  test('lang ru and the tab title', () => {
    expect(html).toMatch(/<html lang="ru"/);
    expect(decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')).toBe('Сергей Ибадов — риелтор в Санкт-Петербурге');
  });

  test('scenes in the Brief order', () => {
    expect(sections.map((s) => s.name)).toEqual(['hero', 'services', 'freeze', 'numbers', 'partners', 'final']);
  });

  test('exactly one h1, in the hero, and it is the credit', () => {
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    const hero = sections.find((s) => s.name === 'hero')!;
    expect(decode(hero.html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? '')).toBe('Сергей Ибадов');
  });

  test('an h2 in every scene except the hero', () => {
    for (const s of sections) expect({ scene: s.name, h2: count(s.html, /<h2[\s>]/g) }).toEqual({ scene: s.name, h2: s.name === 'hero' ? 0 : 1 });
  });

  test('links: Telegram and Instagram outside, the menu to scenes on the page', () => {
    const hrefs = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => decode(m[1]!));
    expect(hrefs).toContain('https://t.me/ibadow');
    expect(hrefs).toContain('https://instagram.com/ibadow');
    const menu = texts.chapter('hero').menu.map((m) => `#${m.scene}`);
    expect(hrefs.filter((h) => h.startsWith('#'))).toEqual(menu);
    for (const h of menu) expect(body).toContain(`id="${h.slice(1)}"`);
    for (const h of hrefs) expect(['https://t.me/ibadow', 'https://instagram.com/ibadow', ...menu]).toContain(h);
  });

  test('the Meta footnote', () => {
    expect(decode(body)).toContain('Instagram принадлежит Meta, признанной экстремистской организацией в РФ');
  });

  test('no form, no phone, no email', () => {
    expect(html).not.toMatch(/<form[\s>]/i);
    expect(html).not.toMatch(/tel:/i);
    expect(html).not.toMatch(/mailto:/i);
  });

  test('link card with an absolute image URL', () => {
    expect(meta('name', 'description')).toBe('Петербург знает своих.');
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:locale')).toBe('ru_RU');
    expect(meta('property', 'og:title')).toBe('Сергей Ибадов — риелтор в Санкт-Петербурге');
    expect(meta('property', 'og:description')).toBe('Петербург знает своих.');
    expect(meta('property', 'og:image')).toMatch(/^https?:\/\/[^/]+\/.+\.(jpe?g|png|webp)$/);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toBe(texts.description('hero'));
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  test('the link card image is in the build: a 1200×630 JPEG', async () => {
    const image = path.join(path.dirname(file), decodeURIComponent(new URL(meta('property', 'og:image')).pathname));
    expect(existsSync(image)).toBe(true);
    const m = await sharp(image).metadata();
    expect([m.format, m.width, m.height]).toEqual(['jpeg', 1200, 630]);
  });

  test('no other words: every text on the page comes from the texts block', () => {
    const allowed = new Set<string>();
    const add = (v: unknown): void => {
      if (typeof v === 'string') allowed.add(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(add);
    };
    for (const c of ['hero', 'services', 'freeze', 'numbers', 'partners', 'final'] as const) add(texts.chapter(c));
    add(texts.contacts());
    // The hero sets its headline in two lines with the last word in gold: one element per word;
    // and its lead one sentence per line.
    for (const w of texts.chapter('hero').headline.split(' ')) allowed.add(w);
    for (const line of texts.chapter('hero').lead.split(/(?<=\.) /)) allowed.add(line);
    const visible = body
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .split(/<[^>]+>/)
      .map((t) => decode(t).trim())
      .filter(Boolean);
    expect(visible.length).toBeGreaterThan(10);
    for (const t of visible) expect({ text: t, allowed: allowed.has(t) }).toEqual({ text: t, allowed: true });
    const alts = [...body.matchAll(/\balt="([^"]*)"/g)].map((m) => decode(m[1]!)).filter(Boolean);
    const descriptions = new Set((['hero', 'services', 'freeze', 'numbers', 'partners', 'final'] as const).map((d) => texts.description(d)));
    for (const a of alts) expect({ alt: a, allowed: descriptions.has(a) }).toEqual({ alt: a, allowed: true });
  });

  test('one image description per scene and scheme', () => {
    for (const s of sections) {
      const alts = [...s.html.matchAll(/\balt="([^"]+)"/g)].length;
      // The hero has one main image per scheme (wide and vertical); CSS shows one of them.
      expect({ scene: s.name, alts }).toEqual({ scene: s.name, alts: s.name === 'hero' ? 2 : 1 });
    }
  });
});
