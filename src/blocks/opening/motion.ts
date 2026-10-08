// Opening (level 3): the intro over the first screen (Brief «Вступление», plan decision 6).
// The head script already chose: "intro-wait" means the intro may play. Here: wait up to 1.5 s
// from navigation start for the intro and hero images; ready and still at the top → play 0–4.7 s;
// otherwise the first screen at once with the headline fading in. A tap outside the button, the
// wheel, a scroll or any key → the ready first screen in 240ms. The Telegram button is a plain
// link and is never intercepted. Reduced motion (or switched on mid-intro): the ready first screen.
// Returns a promise that resolves when the first screen is ready.
import { story } from '../story';
import { onMotionSettingChange, prefersReducedMotion } from '../../platform/motion-setting';
import { clearStyle, ease, now, onFrame, setStyle, tween, type MotionProp } from '../../platform/motion-loop';
import { motion } from '../../design/tokens';
import { SEEN_KEY } from './gate';
import { intro, introFrame, layerZoom, readyFrame, scaleAbout, type IntroFrame } from './timeline';

type El = HTMLElement;

const WAIT_LIMIT = 1500;
const speeds: Record<string, number> = {
  far: motion.layerSpeed.far,
  band: motion.layerSpeed.band,
  near: motion.layerSpeed.near,
  'phone-back': motion.layerSpeed.band,
  'phone-near': motion.layerSpeed.near,
};
const INPUTS = ['pointerdown', 'wheel', 'touchmove', 'keydown', 'scroll'] as const;

export function startOpening(): Promise<void> {
  const cls = document.documentElement.classList;
  if (prefersReducedMotion()) {
    cls.remove('intro-wait', 'intro-on');
    return Promise.resolve();
  }
  if (!cls.contains('intro-wait')) {
    return cls.contains('intro-fade') ? new Promise((r) => setTimeout(r, motion.duration.title)) : Promise.resolve();
  }

  const hero = story.scenes().find((s) => s.name === 'hero');
  const q = (sel?: string) => (sel ? document.querySelector<El>(sel) : null);
  const overlay = q('[data-opening]');
  const aerial = overlay?.querySelector<HTMLImageElement>('[data-opening-aerial]') ?? null;
  const texts = { credit: q(hero?.parts.credit), headline: q(hero?.parts.headline), lead: q(hero?.parts.lead) };
  const stack = hero ? Object.values(hero.stacks).map(q).find((el) => el && el.getClientRects().length > 0) : null;
  const layers = [...(stack?.querySelectorAll<HTMLImageElement>('img[data-layer]') ?? [])].map((img) => ({
    img,
    picture: img.parentElement as El,
    speed: speeds[img.dataset.layer ?? ''] ?? 1,
  }));

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let state: 'wait' | 'play' | 'skip' | 'done' = 'wait';
  const touched = new Set<El>();
  const set = (el: El | null | undefined, prop: MotionProp, value: string) => {
    if (!el) return;
    touched.add(el);
    setStyle(el, prop, value);
  };
  let cancel: (() => void) | undefined;

  // Layers scale around the crop anchor of the visible stack.
  let anchor: [number, number] = [0.5, 0.1];
  let box = { w: 0, h: 0 };
  const measure = () => {
    const first = layers[0];
    if (!first) return;
    box = { w: first.picture.offsetWidth, h: first.picture.offsetHeight };
    if (stack?.dataset.stack === 'wide') {
      const [x, y] = getComputedStyle(first.img).objectPosition.split(/\s+/).map((v) => Number.parseFloat(v) / 100);
      anchor = [Number.isFinite(x) ? x! : 0.5, Number.isFinite(y) ? y! : 0.1];
    }
  };

  // The wait: ink over the image, the credit, headline and lead not shown yet, layers at rest.
  let current: IntroFrame = { overlay: 1, aerial: 0, aerialScale: 1, credit: 0, headline: 0, settle: 1 };
  const draw = (f: IntroFrame) => {
    current = f;
    set(overlay, 'opacity', String(f.overlay));
    set(aerial, 'opacity', String(f.aerial));
    set(aerial, 'transform', `scale(${f.aerialScale})`);
    set(texts.credit, 'opacity', String(f.credit));
    set(texts.headline, 'opacity', String(f.headline));
    set(texts.lead, 'opacity', String(f.headline));
    for (const l of layers) set(l.picture, 'transform', scaleAbout(layerZoom(l.speed, f.settle), anchor[0], anchor[1], box.w, box.h));
  };
  /** Take over from the CSS wait: same picture, now held by inline styles. */
  const takeOver = (f: IntroFrame) => {
    measure();
    draw(f);
    for (const el of [overlay, aerial, ...layers.map((l) => l.picture)]) set(el, 'willChange', 'transform, opacity');
    cls.add('intro-on');
    cls.remove('intro-wait');
  };

  const finish = () => {
    if (state === 'done') return;
    state = 'done';
    cancel?.();
    for (const t of INPUTS) removeEventListener(t, onInput, true);
    cls.remove('intro-on', 'intro-wait');
    for (const el of touched) clearStyle(el);
    touched.clear();
    resolveReady();
  };

  const skip = () => {
    if (state === 'done' || state === 'skip') return;
    if (state === 'wait') takeOver(current);
    state = 'skip';
    cancel?.();
    const from = current;
    const mix = (a: number, b: number, k: number) => a + (b - a) * k;
    cancel = tween({
      duration: intro.skip,
      easing: ease.enter,
      update: (k) =>
        draw({
          overlay: mix(from.overlay, readyFrame.overlay, k),
          aerial: mix(from.aerial, readyFrame.aerial, k),
          aerialScale: from.aerialScale,
          credit: mix(from.credit, readyFrame.credit, k),
          headline: mix(from.headline, readyFrame.headline, k),
          settle: mix(from.settle, readyFrame.settle, k),
        }),
      done: finish,
    });
  };

  function onInput(e: Event) {
    // The Telegram button (any link) works as a normal link during the intro.
    if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('a[href]')) return;
    skip();
  }

  const play = () => {
    state = 'play';
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage refused after the head check: the intro still plays this once.
    }
    takeOver(introFrame(0));
    const start = now();
    cancel = onFrame((t) => {
      if (state !== 'play') return false;
      const k = t - start;
      draw(introFrame(Math.min(k, intro.end)));
      if (k < intro.end) return;
      finish();
      return false;
    });
  };

  /** Not ready in time, or the page is not at the top: the first screen, headline fading in. */
  const fallback = () => {
    state = 'done';
    for (const t of INPUTS) removeEventListener(t, onInput, true);
    cls.remove('intro-wait');
    cls.add('intro-fade');
    setTimeout(resolveReady, motion.duration.title);
  };

  if (!overlay || !aerial || !stack || !layers.length) {
    fallback();
    return ready;
  }

  for (const t of INPUTS) addEventListener(t, onInput, { capture: true, passive: true });
  onMotionSettingChange((reduced) => {
    if (reduced) finish();
  });

  const decoded = Promise.all([aerial, ...layers.map((l) => l.img)].map((img) => img.decode())).then(
    () => true,
    () => false,
  );
  const limit = new Promise<boolean>((r) => setTimeout(() => r(false), Math.max(0, WAIT_LIMIT - performance.now())));
  Promise.race([decoded, limit]).then((ok) => {
    if (state !== 'wait') return;
    if (ok && performance.now() <= WAIT_LIMIT && scrollY === 0) play();
    else fallback();
  });

  return ready;
}
