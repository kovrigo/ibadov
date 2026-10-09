import { describe, expect, test } from 'bun:test';
import { texts } from '../index';

// The texts are literal types; compare them as plain values.
const expectValue = (v: unknown) => expect(v);

// Copied by hand from docs/designs/landing-page.md, «Дизайн» → «Тексты» and «Доступность».
const brief = {
  heroCredit: 'Сергей Ибадов',
  heroHeadline: 'Петербург знает своих.',
  heroLead: 'Риелтор в Санкт-Петербурге. Покупка и продажа недвижимости.',
  // Added 8 October 2026 with the customer's frame: the menu and the scroll hint.
  menu: ['Услуги', 'Партнёры', 'Контакты'],
  menuName: 'Разделы',
  cue: 'Пролистайте',
  // Added 8 October 2026 with the customer's video: the intro's skip control.
  skip: 'Пропустить',
  // What a screen reader says for it (Brief «Тексты», 8 October 2026, design).
  skipName: 'Пропустить фильм',
  button: 'Написать в Telegram',
  servicesTitle: 'Вариантов два.',
  services: ['Купить', 'Продать'],
  freezeCaption: '№1 риелтор Петербурга',
  numbersHidden: 'Цифры',
  fact1: ['Продажи за 2025 год', 'больше', '1 млрд', 'рублей'],
  fact2: ['Больше', '100 тысяч', 'подписчиков в Instagram'],
  partnersTitle: 'Партнёрство с застройщиками',
  partners: ['Yard', 'Elements'],
  finalTitle: 'Ваш ход. Поговорим?',
  finalLine: 'Риелтор в Санкт-Петербурге',
  instagram: 'Instagram',
  footnote: 'Instagram принадлежит Meta, признанной экстремистской организацией в РФ',
  tabTitle: 'Сергей Ибадов — риелтор в Санкт-Петербурге',
  cardTitle: 'Сергей Ибадов — риелтор в Санкт-Петербурге',
  cardPhrase: 'Петербург знает своих.',
  heroDescription: 'Сергей Ибадов в тёмном костюме на балконе, за ним вечерний Исаакиевский собор и Нева',
};

// «Тон»: sales clichés and gangster jokes that must never appear.
const banned = [
  'эксклюзивные объекты',
  'для тех, кто ценит',
  'индивидуальный подход',
  'квартира вашей мечты',
  'решать вопрос',
  'решаем вопрос',
  'наличн',
  'чистые деньги',
  '«чистые»',
  'Оставить заявку',
  'Больше, чем недвижимость',
  'более',
  '100 000',
];

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

const chapterNames = ['hero', 'services', 'freeze', 'numbers', 'partners', 'final'] as const;
const descriptionNames = ['hero', 'services', 'freeze', 'numbers', 'partners', 'final', 'card'] as const;

const everything = [
  ...chapterNames.flatMap((c) => allStrings(texts.chapter(c))),
  ...allStrings(texts.facts()),
  ...allStrings(texts.services()),
  ...allStrings(texts.contacts()),
  ...allStrings(texts.card()),
  ...allStrings(texts.page()),
  ...descriptionNames.map((d) => texts.description(d)),
];

describe('texts are verbatim from the Brief', () => {
  test('hero', () => {
    const { menu, ...hero } = texts.chapter('hero');
    expectValue(hero).toEqual({ credit: brief.heroCredit, headline: brief.heroHeadline, lead: brief.heroLead, menuName: brief.menuName, cue: brief.cue, skip: brief.skip, skipName: brief.skipName });
    expectValue(menu.map((m) => m.label)).toEqual(brief.menu);
    expectValue(menu.map((m) => m.scene)).toEqual(['services', 'partners', 'final']);
  });
  test('services', () => {
    expectValue(texts.chapter('services').title).toBe(brief.servicesTitle);
    expectValue([...texts.services()]).toEqual(brief.services);
    expectValue([...texts.chapter('services').items]).toEqual(brief.services);
  });
  test('freeze frame', () => {
    expectValue(texts.chapter('freeze')).toEqual({ credit: brief.heroCredit, caption: brief.freezeCaption });
    expectValue(texts.facts().rank).toBe(brief.freezeCaption);
  });
  test('numbers, words and order of the customer', () => {
    const [sales, followers] = texts.chapter('numbers').facts;
    expectValue(texts.chapter('numbers').title).toBe(brief.numbersHidden);
    expectValue([sales.label, sales.lead, sales.number, sales.unit]).toEqual(brief.fact1);
    expectValue([followers.lead, followers.number, followers.unit]).toEqual(brief.fact2);
  });
  test('partners', () => {
    expectValue(texts.chapter('partners').title).toBe(brief.partnersTitle);
    expectValue([...texts.chapter('partners').names]).toEqual(brief.partners);
  });
  test('final', () => {
    expectValue(texts.chapter('final')).toEqual({ title: brief.finalTitle, credit: brief.heroCredit, line: brief.finalLine });
  });
  test('contacts', () => {
    const c = texts.contacts();
    expectValue(c.telegram).toEqual({ handle: '@ibadow', url: 'https://t.me/ibadow', label: brief.button });
    expectValue(c.instagram).toEqual({ handle: '@ibadow', url: 'https://instagram.com/ibadow', label: brief.instagram });
    expectValue(c.footnote).toBe(brief.footnote);
  });
  test('tab title and link card', () => {
    expectValue(texts.page().title).toBe(brief.tabTitle);
    expectValue(texts.card()).toEqual({ title: brief.cardTitle, description: brief.cardPhrase });
  });
  test('hero description is the Brief example', () => {
    expectValue(texts.description('hero')).toBe(brief.heroDescription);
  });
  test('every scene has one description', () => {
    for (const d of descriptionNames) expectValue(texts.description(d).length).toBeGreaterThan(10);
  });
});

describe('no other words', () => {
  const briefStrings = new Set(allStrings(brief));
  const allowedExtra = new Set(['@ibadow', 'https://t.me/ibadow', 'https://instagram.com/ibadow', 'services', 'partners', 'final']);
  test('every visible string comes from the Brief', () => {
    const descriptions = new Set(descriptionNames.map((d) => texts.description(d)));
    for (const s of everything) {
      if (allowedExtra.has(s) || descriptions.has(s)) continue;
      expect(briefStrings.has(s)).toBe(true);
    }
  });
  test('banned clichés are absent', () => {
    const joined = everything.join('\n').toLowerCase();
    for (const phrase of banned) expect(joined).not.toContain(phrase.toLowerCase());
  });
  test('no phone or email', () => {
    const joined = everything.join('\n');
    expect(joined).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(joined).not.toMatch(/\+?\d[\d\s()-]{8,}\d/);
  });
});
