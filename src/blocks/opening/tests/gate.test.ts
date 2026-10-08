import { describe, expect, test } from 'bun:test';
import { gateScript, SEEN_KEY, shouldPlayIntro, type IntroEnv, type Preload } from '../gate';

// Every branch of the decision, and the inline <head> copy gives the same answer for each.
const base: IntroEnv = { reducedMotion: false, saveData: false, effectiveType: '4g', hash: '', readSeen: () => null };
const unavailable = () => {
  throw new DOMException('denied', 'SecurityError');
};
const cases: [string, Partial<IntroEnv>, boolean][] = [
  ['first visit, motion allowed, fast network', {}, true],
  ['no network information at all', { effectiveType: undefined }, true],
  ['3g still plays', { effectiveType: '3g' }, true],
  ['reduced motion', { reducedMotion: true }, false],
  ['data saver', { saveData: true }, false],
  ['2g', { effectiveType: '2g' }, false],
  ['slow-2g', { effectiveType: 'slow-2g' }, false],
  ['seen before', { readSeen: () => '1' }, false],
  ['storage unavailable', { readSeen: unavailable }, false],
  ['anchor in the address', { hash: '#final' }, false],
  ['reduced motion and seen', { reducedMotion: true, readSeen: () => '1' }, false],
];

/** Runs the inline script against a fake window/document built from `env`. */
function runInline(env: IntroEnv, preloads: Preload[] = []) {
  const classes = new Set<string>();
  const links: Record<string, string>[] = [];
  const document = {
    documentElement: { classList: { add: (c: string) => classes.add(c) } },
    createElement: () => {
      const attrs: Record<string, string> = {};
      return new Proxy(attrs, {
        set: (t, k: string, v) => ((t[k] = String(v)), true),
        get: (t, k: string) => (k === 'setAttribute' ? (a: string, v: string) => (t[a] = v) : t[k]),
      });
    },
    head: { appendChild: (l: Record<string, string>) => links.push(l) },
  };
  const window = {
    navigator: { connection: env.effectiveType === undefined && !env.saveData ? undefined : { saveData: env.saveData, effectiveType: env.effectiveType } },
    matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' && env.reducedMotion }),
    location: { hash: env.hash },
    get localStorage() {
      return { getItem: (k: string) => (k === SEEN_KEY ? env.readSeen() : null) };
    },
  };
  new Function('window', 'document', gateScript(preloads))(window, document);
  return { classes, links };
}

describe('shouldPlayIntro', () => {
  for (const [name, patch, expected] of cases) {
    test(name, () => expect(shouldPlayIntro({ ...base, ...patch })).toBe(expected));
  }
  test('storage is not read when an earlier condition already says no', () => {
    let reads = 0;
    shouldPlayIntro({ ...base, reducedMotion: true, readSeen: () => (reads++, null) });
    expect(reads).toBe(0);
  });
});

describe('inline head script', () => {
  for (const [name, patch, expected] of cases) {
    test(`agrees: ${name}`, () => {
      const env = { ...base, ...patch };
      const { classes } = runInline(env);
      expect(classes.has('intro-wait')).toBe(expected);
      expect(shouldPlayIntro(env)).toBe(expected);
      // No intro but motion allowed: the headline fades in. Reduced motion: nothing at all.
      expect(classes.has('intro-fade')).toBe(!expected && !env.reducedMotion);
    });
  }

  test('no matchMedia counts as reduced motion: no class at all', () => {
    const classes = new Set<string>();
    new Function('window', 'document', gateScript([]))(
      { navigator: {}, location: { hash: '' }, localStorage: { getItem: () => null } },
      { documentElement: { classList: { add: (c: string) => classes.add(c) } } },
    );
    expect([...classes]).toEqual([]);
  });

  test('preloads the hero images, and only they, only when the intro may play', () => {
    const preloads: Preload[] = [
      ['(orientation: landscape)', '/far.avif 640w, /far-2.avif 1280w', '100vw'],
      ['(orientation: portrait)', '/phone-back.avif 640w', '100vw'],
    ];
    const yes = runInline(base, preloads);
    expect(yes.links).toEqual([
      { rel: 'preload', as: 'image', type: 'image/avif', media: '(orientation: landscape)', imagesrcset: '/far.avif 640w, /far-2.avif 1280w', imagesizes: '100vw', fetchpriority: 'high' },
      { rel: 'preload', as: 'image', type: 'image/avif', media: '(orientation: portrait)', imagesrcset: '/phone-back.avif 640w', imagesizes: '100vw', fetchpriority: 'high' },
    ]);
    expect(runInline({ ...base, readSeen: () => '1' }, preloads).links).toEqual([]);
    // The video is not the head's: Opening.astro starts it.
    expect(gateScript(preloads)).not.toMatch(/video|mp4/);
  });

  test('stays tiny: the logic without its data is under 1 KB', () => {
    expect(gateScript([]).length).toBeLessThan(1024);
  });
});
