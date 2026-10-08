// Opening (level 3): the intro over the first screen (Brief «Вступление», plan decision 6).
// The head script already chose: "intro-wait" means the intro may play, and Opening.astro started
// the video. Here: wait up to 1.5 s from navigation start for the hero images and the video;
// ready and still at the top → play 0–4.4 s; otherwise the first screen at once with the headline
// fading in, and the video download stops. A tap outside the button, the wheel, a scroll or any
// key → the ready first screen in 240ms, and the intro counts as seen even if it had not started.
// The Telegram button is a plain link and is never intercepted; leaving through it marks the
// intro seen. Reduced motion (or switched on mid-intro): the ready first screen. Returns a promise
// that resolves when the first screen is ready.
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
  const video = document.querySelector<HTMLVideoElement>('[data-opening-video]');
  /** Stops the video and drops its file (and any download still running). */
  const release = () => {
    if (!video?.getAttribute('src')) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  if (prefersReducedMotion()) {
    release();
    cls.remove('intro-wait', 'intro-on');
    return Promise.resolve();
  }
  // The headline's fade is done: drop its class, so turning "reduce motion" off later does not replay it.
  const faded = (resolve: () => void) =>
    setTimeout(() => {
      cls.remove('intro-fade');
      resolve();
    }, motion.duration.title);
  if (!cls.contains('intro-wait')) {
    return cls.contains('intro-fade') ? new Promise((r) => faded(r)) : Promise.resolve();
  }

  const hero = story.scenes().find((s) => s.name === 'hero');
  const q = (sel?: string) => (sel ? document.querySelector<El>(sel) : null);
  const overlay = q('[data-opening]');
  const part = (name: string) => q(hero?.parts[name] ?? `[data-scene="hero"] [data-part="${name}"]`);
  const credit = part('credit');
  // Headline, lead, nav and cue appear together; nav and cue may be absent on some screens.
  const titles = ['headline', 'lead', 'nav', 'cue'].map(part);
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

  // The wait: ink over the image, the video not shown, the credit and titles not shown yet,
  // layers at rest.
  let current: IntroFrame = { overlay: 1, video: 0, credit: 0, headline: 0, settle: 1 };
  const draw = (f: IntroFrame) => {
    current = f;
    set(overlay, 'opacity', String(f.overlay));
    set(video, 'opacity', String(f.video));
    set(credit, 'opacity', String(f.credit));
    for (const el of titles) set(el, 'opacity', String(f.headline));
    for (const l of layers) set(l.picture, 'transform', scaleAbout(layerZoom(l.speed, f.settle), anchor[0], anchor[1], box.w, box.h));
  };
  /** Take over from the CSS wait: same picture, now held by inline styles. */
  const takeOver = (f: IntroFrame) => {
    measure();
    draw(f);
    for (const el of [overlay, video, ...layers.map((l) => l.picture)]) set(el, 'willChange', 'transform, opacity');
    cls.add('intro-on');
    cls.remove('intro-wait');
  };

  const finish = () => {
    if (state === 'done') return;
    state = 'done';
    cancel?.();
    for (const t of INPUTS) removeEventListener(t, onInput, true);
    release();
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
    video?.pause();
    const from = current;
    const mix = (a: number, b: number, k: number) => a + (b - a) * k;
    cancel = tween({
      duration: intro.skip,
      easing: ease.enter,
      update: (k) =>
        draw({
          overlay: mix(from.overlay, readyFrame.overlay, k),
          video: from.video,
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
    // Skipped while waiting for its files: the visitor chose the first screen, next visit too.
    markSeen();
    skip();
  }

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage refused after the head check: the intro still plays this once.
    }
  };

  const play = (v: HTMLVideoElement) => {
    state = 'play';
    markSeen();
    // The video already runs (hidden under ink since it started): the clock follows it.
    const start = now() - v.currentTime * 1000;
    takeOver(introFrame(now() - start));
    cancel = onFrame((t) => {
      if (state !== 'play') return false;
      const k = t - start;
      draw(introFrame(Math.min(k, intro.end)));
      if (k < intro.end) return;
      finish();
      return false;
    });
  };

  /**
   * Not ready in time, or the page is not at the top: the first screen, headline fading in.
   * A script that arrives after the CSS reveal began (2.5 s, Opening.astro) lets that reveal
   * finish instead of fading the headline in a second time.
   */
  const fallback = () => {
    state = 'done';
    for (const t of INPUTS) removeEventListener(t, onInput, true);
    release();
    const headline = titles[0];
    if (headline && Number(getComputedStyle(headline).opacity) > 0) {
      faded(() => {
        cls.remove('intro-wait');
        resolveReady();
      });
      return;
    }
    cls.remove('intro-wait');
    cls.add('intro-fade');
    faded(resolveReady);
  };

  // Leaving through a link (Telegram) counts as seen, played or not: Back never starts the
  // intro (Scope «Вступление и движение»). Leaving or hiding the page mid-intro: it comes back
  // (back-forward cache, the Telegram app handing back) with the first screen ready.
  addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.closest?.('a[href]')) markSeen();
    },
    { capture: true },
  );
  addEventListener('pagehide', finish);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  });

  if (!overlay || !video || !stack || !layers.length) {
    fallback();
    return ready;
  }

  for (const t of INPUTS) addEventListener(t, onInput, { capture: true, passive: true });
  // Turning the screen mid-intro shows the other image group: the ready first screen instead.
  matchMedia('(orientation: portrait)').addEventListener('change', skip);
  onMotionSettingChange((reduced) => {
    if (reduced) finish();
  });

  // Ready: the hero layers decoded and the video playing. It starts at once, invisible under the
  // overlay's ink: a phone may not load a video before play() (iOS), so readiness is playback
  // itself. Refused (a power saver, a browser rule) or broken: no intro.
  const playable = new Promise<void>((resolve, reject) => {
    video.addEventListener('playing', () => resolve(), { once: true });
    video.addEventListener('error', reject, { once: true });
    video.play().catch(reject);
  });
  const loaded = Promise.all([playable, ...layers.map((l) => l.img.decode())]).then(
    () => true,
    () => false,
  );
  const limit = new Promise<boolean>((r) => setTimeout(() => r(false), Math.max(0, WAIT_LIMIT - performance.now())));
  Promise.race([loaded, limit]).then((ok) => {
    if (state !== 'wait') return;
    if (ok && performance.now() <= WAIT_LIMIT && scrollY === 0) play(video);
    else fallback();
  });

  return ready;
}
