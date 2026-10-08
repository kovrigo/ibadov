// Opening (level 3): the intro over the first screen (DESIGN.md Motion «Вступление»).
// The head script already chose: "intro-wait" means the intro may play, and Opening.astro started
// the video. Here: wait up to 1.5 s from navigation start for the video to play; playing and still
// at the top → the film 0–7.0 s, dissolving into the first screen by 7.8 s; otherwise the first
// screen at once with the headline fading in, and the video download stops. A tap anywhere (on
// «Пропустить» too, counted as the finger lifts), the wheel, a scroll or any key → the ready first
// screen in 240ms; Space does not also scroll the page past it. «Пропустить» shows once this script
// listens; it is a button out of the Tab order: a screen reader or voice control presses it with a
// click, and then (or when the intro ends with focus on it) focus goes to the name, the hero's h1,
// unless the visitor has moved focus on. The film plays clear: the first screen's button and menu
// wait with its text and take clicks once half in (a phone keeps its Telegram bar, a plain link
// never intercepted). Nothing is remembered: the next opening plays it again.
// Reduced motion (or switched on mid-intro): the ready first screen. Returns a promise that
// resolves when the first screen is ready.
import { story } from '../story';
import { onMotionSettingChange, prefersReducedMotion } from '../../platform/motion-setting';
import { clearStyle, ease, now, onFrame, setStyle, tween, type MotionProp } from '../../platform/motion-loop';
import { motion, spacing } from '../../design/tokens';
import { intro, introFrame, layerZoom, pullScale, readyFrame, scaleAbout, type IntroFrame } from './timeline';

type El = HTMLElement;

const WAIT_LIMIT = 1500;
const speeds: Record<string, number> = {
  far: motion.layerSpeed.far,
  band: motion.layerSpeed.band,
  near: motion.layerSpeed.near,
  'phone-back': motion.layerSpeed.band,
  'phone-near': motion.layerSpeed.near,
};
const INPUTS = ['pointerup', 'wheel', 'touchmove', 'keydown', 'scroll'] as const;

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
  const skipButton = q('[data-opening-skip]');
  // Headline, lead, button, nav and cue appear together; the button, nav and cue are not shown
  // on every screen.
  const titles = ['headline', 'lead', 'action', 'nav', 'cue'].map(part);
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
  // «Пропустить» was pressed: a touch or a mouse starts the skip at pointerup, before its click.
  let pressed = false;
  /**
   * Focus to the name if «Пропустить» holds focus, or was pressed and focus is nowhere else; it is
   * about to disappear.
   */
  const focusName = () => {
    const active = document.activeElement;
    const onSkip = !!overlay && overlay.contains(active);
    if (!onSkip && !(pressed && (!active || active === document.body))) return;
    const name = credit?.querySelector<El>('h1');
    if (!name) return;
    name.tabIndex = -1;
    name.focus({ preventScroll: true });
  };

  // Layers scale around the crop anchor of the visible stack.
  let anchor: [number, number] = [0.5, 0.1];
  let box = { w: 0, h: 0 };
  // Portrait: the film box is its whole frame, centred; `cover` scales it up to fill the screen.
  // As it pulls back it also rises by `lift`, so its title (rows 440–560 of 720, glow included)
  // ends `lg` above the name: the name fades in under the title, not over it.
  const portrait = matchMedia('(orientation: portrait)').matches;
  let cover = 1;
  let lift = 0;
  const measure = () => {
    const first = layers[0];
    if (!first) return;
    box = { w: first.picture.offsetWidth, h: first.picture.offsetHeight };
    if (stack?.dataset.stack === 'wide') {
      const [x, y] = getComputedStyle(first.img).objectPosition.split(/\s+/).map((v) => Number.parseFloat(v) / 100);
      anchor = [Number.isFinite(x) ? x! : 0.5, Number.isFinite(y) ? y! : 0.1];
    }
    if (portrait && overlay && video && video.offsetWidth && video.offsetHeight) {
      cover = Math.max(overlay.offsetWidth / video.offsetWidth, overlay.offsetHeight / video.offsetHeight, 1);
      const name = credit?.getBoundingClientRect();
      const titleEnd = overlay.getBoundingClientRect().top + video.offsetTop + (video.offsetHeight * 560) / 720;
      if (name?.height) lift = Math.max(0, titleEnd - (name.top - Number.parseFloat(spacing.lg)));
    }
  };

  // The wait: ink over the image, the video not shown, the credit and titles not shown yet,
  // layers at rest.
  let current: IntroFrame = { overlay: 1, video: 0, pull: 0, credit: 0, headline: 0, settle: 1 };
  const draw = (f: IntroFrame) => {
    current = f;
    set(overlay, 'opacity', String(f.overlay));
    set(video, 'opacity', String(f.video));
    if (portrait) {
      set(video, 'transform', `translateY(${-Math.round(lift * f.pull * 100) / 100}px) scale(${Math.round(pullScale(cover, f.pull) * 1e5) / 1e5})`);
    }
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
    focusName();
    cls.remove('intro-on', 'intro-wait', 'intro-reveal', 'intro-skip', 'intro-live');
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
    cls.add('intro-reveal', 'intro-skip');
    const from = current;
    const mix = (a: number, b: number, k: number) => a + (b - a) * k;
    cancel = tween({
      duration: intro.skip,
      easing: ease.enter,
      update: (k) =>
        draw({
          overlay: mix(from.overlay, readyFrame.overlay, k),
          video: from.video,
          pull: from.pull,
          credit: mix(from.credit, readyFrame.credit, k),
          headline: mix(from.headline, readyFrame.headline, k),
          settle: mix(from.settle, readyFrame.settle, k),
        }),
      done: finish,
    });
  };

  function onInput(e: Event) {
    const target = e.target as Element | null;
    // The Telegram button (any link) works as a normal link during the intro.
    if (e.type === 'pointerup' && target?.closest?.('a[href]')) return;
    if (e.type === 'pointerup' && target?.closest?.('[data-opening-skip]')) pressed = true;
    // Space opens the first screen like any key, without also scrolling a screen past it.
    if (e.type === 'keydown' && (e as KeyboardEvent).key === ' ') e.preventDefault();
    skip();
  }
  // A screen reader or voice control sends a click alone, without a pointer or a key.
  function onSkipPress() {
    pressed = true;
    skip();
  }

  const play = (v: HTMLVideoElement) => {
    state = 'play';
    // The video already runs (hidden under ink since it started): the clock follows it.
    const start = now() - v.currentTime * 1000;
    takeOver(introFrame(now() - start));
    cancel = onFrame((t) => {
      if (state !== 'play') return false;
      const k = t - start;
      const f = introFrame(Math.min(k, intro.end));
      if (k >= intro.dissolve[0]) cls.add('intro-reveal');
      // The button and the menu take clicks once half in; until then a click skips.
      if (f.headline >= 0.5) cls.add('intro-live');
      draw(f);
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
    focusName();
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

  // Leaving or hiding the page mid-intro: it comes back (back-forward cache, the Telegram app
  // handing back) with the first screen ready. A Back that reloads the page: the head script
  // sees the navigation type and plays nothing.
  addEventListener('pagehide', finish);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  });

  if (!overlay || !video || !stack || !layers.length) {
    fallback();
    return ready;
  }

  for (const t of INPUTS) addEventListener(t, onInput, { capture: true, passive: t !== 'keydown' });
  skipButton?.addEventListener('click', onSkipPress);
  // Now something hears «Пропустить»: show it (Opening.astro keeps it hidden until then).
  if (skipButton) skipButton.hidden = false;
  // Turning the screen mid-intro shows the other image group: the ready first screen instead.
  matchMedia('(orientation: portrait)').addEventListener('change', skip);
  onMotionSettingChange((reduced) => {
    if (reduced) finish();
  });

  // Ready: the video playing. It starts at once, invisible under the overlay's ink: a phone may
  // not load a video before play() (iOS), so readiness is playback itself. Refused (a power saver,
  // a browser rule) or broken: no intro. The hero images have until the dissolve (6.4 s); one
  // still loading then fades in when it comes (story's loading state).
  const loaded = new Promise<void>((resolve, reject) => {
    video.addEventListener('playing', () => resolve(), { once: true });
    video.addEventListener('error', reject, { once: true });
    video.play().catch(reject);
  }).then(
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
