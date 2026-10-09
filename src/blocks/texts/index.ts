// Texts (level 0): every word of the page, verbatim from the Brief «Тексты».
// Nothing else on the page may say anything. Typography is the caller's business.

const name = 'Сергей Ибадов';
const city = 'Риелтор в Санкт-Петербурге';
const tagline = 'Петербург знает своих.';
const telegramLabel = 'Написать в Telegram';
const tabTitle = 'Сергей Ибадов — риелтор в Санкт-Петербурге';

const facts = {
  sales: { label: 'Продажи за 2025 год', lead: 'больше', number: '1 млрд', unit: 'рублей' },
  followers: { lead: 'Больше', number: '100 тысяч', unit: 'подписчиков в Instagram' },
  rank: '№1 риелтор Петербурга',
  partners: { title: 'Партнёрство с застройщиками', names: ['Yard', 'Elements'] as const },
} as const;

const services = ['Купить', 'Продать'] as const;
// What he does, in plain words, under the first screen's headline.
const trade = 'Покупка и продажа недвижимости.';

// The menu of the first screen (customer's frame, 8 October 2026): each item names a scene.
const menu = [
  { label: 'Услуги', scene: 'services' },
  { label: 'Партнёры', scene: 'partners' },
  { label: 'Контакты', scene: 'final' },
] as const;

const chapters = {
  hero: { credit: name, headline: tagline, lead: `${city}. ${trade}`, menu, menuName: 'Разделы', cue: 'Пролистайте', skip: 'Пропустить', skipName: 'Пропустить фильм' },
  services: { title: 'Вариантов два.', items: services },
  freeze: { credit: name, caption: facts.rank },
  numbers: { title: 'Цифры', facts: [facts.sales, facts.followers] as const },
  partners: { title: facts.partners.title, names: facts.partners.names },
  final: { title: 'Ваш ход. Поговорим?', credit: name, line: city },
} as const;

export type ChapterName = keyof typeof chapters;

const contacts = {
  telegram: { handle: '@ibadow', url: 'https://t.me/ibadow', label: telegramLabel },
  instagram: { handle: '@ibadow', url: 'https://instagram.com/ibadow', label: 'Instagram' },
  footnote: 'Instagram принадлежит Meta, признанной экстремистской организацией в РФ',
} as const;

// Screen-reader descriptions, one per scene (Brief «Доступность»). They name only what is in the picture.
const descriptions = {
  hero: 'Сергей Ибадов в тёмном костюме на балконе, за ним вечерний Исаакиевский собор и Нева',
  services: 'Вечер за мраморным столом: часы, ключи, планы квартир, за окном Исаакиевский собор и Нева',
  freeze: 'Сергей Ибадов крупным планом: тёмные очки, тёмный костюм, рука на галстуке',
  numbers: 'Размытые огни вечернего города',
  partners: 'Сергей Ибадов в тёмном костюме и очках на мраморной лестнице',
  final: 'Вечерний Петербург сверху: купол Исаакиевского собора, Нева и Сергей Ибадов в тёмном костюме',
  card: 'Сергей Ибадов в тёмном костюме на балконе, за ним вечерний Исаакиевский собор и Нева',
} as const;

export type DescriptionName = keyof typeof descriptions;

export const texts = {
  chapter<N extends ChapterName>(chapter: N): (typeof chapters)[N] {
    return chapters[chapter];
  },
  facts: () => facts,
  services: () => services,
  contacts: () => contacts,
  card: () => ({ title: tabTitle, description: tagline }),
  page: () => ({ title: tabTitle }),
  description: (scene: DescriptionName): string => descriptions[scene],
};
