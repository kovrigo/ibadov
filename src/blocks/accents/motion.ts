// Accents (level 2): the glint on the watch, the smoke and the cigar's reveal, and the film
// grain's jitter (a CSS animation in Accents.astro, switched on here). Finds its markup in the
// story's accent places; the glint follows the image layer that carries the watch. Reduced
// motion: does nothing; switched on while the page is open, it stops at once (cigar drawn, no
// smoke, no glint, grain still).
import { story } from '../story';
import { onMotionSettingChange, prefersReducedMotion } from '../../platform/motion-setting';
import {
  clearStyle,
  ease,
  now,
  observe,
  onFrame,
  setStyle,
  tween,
  type MotionProp,
} from '../../platform/motion-loop';
import * as a from './math';
import { num, px } from './math';

type El = HTMLElement;

const PHONE = '(max-width: 767px), (orientation: landscape) and (max-height: 500px)';

interface Glint {
  box: El;
  band: El;
  section: El;
  layer: El | null;
  /** The image group of the layer: the glint waits while it is loading (Landing.astro). */
  stack: El | null;
  hero: boolean;
  inView: boolean;
  armed: boolean;
  last: number;
  playing: boolean;
  /** Untransformed position and width of the layer inside its scene, and the box's centre. */
  ox: number;
  oy: number;
  ow: number;
  cx: number;
  cy: number;
}

interface Smoke {
  el: El;
  cycle: number;
  offset: number;
  rise: number;
  afterCigar: boolean;
  visible: boolean;
  level: number;
}

export interface AccentsOptions {
  /** Resolves when the first screen is ready (after the opening, if it plays). */
  heroReady?: Promise<void>;
}

export function startAccents({ heroReady = Promise.resolve() }: AccentsOptions = {}): void {
  if (prefersReducedMotion()) return;

  const touched = new Set<El>();
  const offs = new Set<() => void>();
  let stopped = false;
  const set = (el: El | null | undefined, prop: MotionProp, value: string) => {
    if (!el || stopped) return;
    touched.add(el);
    setStyle(el, prop, value);
  };
  const keep = (off: () => void) => {
    offs.add(off);
    return off;
  };
  const phone = matchMedia(PHONE);
  const scenes = story.scenes();

  // ---- Glint ----

  let heroReadyAt = Number.POSITIVE_INFINITY;
  heroReady.then(() => {
    heroReadyAt = now();
    wake();
  });

  const glints: Glint[] = scenes.flatMap((scene) => {
    const section = document.querySelector<El>(scene.section);
    if (!section) return [];
    return [...document.querySelectorAll<El>(`${scene.accent} [data-glint]`)].flatMap((frame) => {
      const box = frame.querySelector<El>('[data-glint-box]');
      const band = frame.querySelector<El>('[data-glint-band]');
      const layerSel = scene.layers[frame.dataset.glintLayer ?? ''];
      if (!box || !band) return [];
      const layer = layerSel ? document.querySelector<El>(layerSel) : null;
      return [{
        box,
        band,
        section,
        layer,
        stack: layer?.closest<El>('[data-stack]') ?? null,
        hero: scene.name === 'hero',
        inView: false,
        armed: true,
        last: Number.NEGATIVE_INFINITY,
        playing: false,
        ox: 0,
        oy: 0,
        ow: 0,
        cx: 0,
        cy: 0,
      }];
    });
  });

  const measure = (g: Glint) => {
    let x = 0;
    let y = 0;
    let e: El | null = g.layer;
    while (e && e !== g.section) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent as El | null;
    }
    g.ox = x;
    g.oy = y;
    g.ow = g.layer?.offsetWidth ?? 0;
    g.cx = g.box.offsetLeft + g.box.offsetWidth / 2;
    g.cy = g.box.offsetTop + g.box.offsetHeight / 2;
  };
  /**
   * The box over the watch takes the same scale and shift the camera gives the watch's layer:
   * a point P of the scene maps to (tx, ty) + k·P. Only the small box moves, so nothing ever
   * reaches past the page edge.
   */
  const follow = (g: Glint) => {
    if (!g.layer || !g.ow) return;
    const r = g.layer.getBoundingClientRect();
    const s = g.section.getBoundingClientRect();
    const k = r.width / g.ow;
    const tx = r.left - s.left - k * g.ox + (k - 1) * g.cx;
    const ty = r.top - s.top - k * g.oy + (k - 1) * g.cy;
    set(g.box, 'transform', `translate(${px(tx)}, ${px(ty)}) scale(${num(k)})`);
  };
  const glintPlaying = () => glints.some((g) => g.playing);
  // Not over a picture that is still loading: it would be used up on ink. A group whose image
  // failed stays loading, and its glint simply never plays.
  const pending = (g: Glint) => g.inView && g.armed && !g.playing && !g.stack?.hasAttribute('data-loading');
  const glintWaiting = () => glints.some(pending);

  const play = (g: Glint) => {
    g.playing = true;
    g.armed = false;
    g.last = now();
    measure(g);
    set(g.box, 'willChange', 'transform');
    set(g.band, 'willChange', 'transform, opacity');
    const stop = tween({
      duration: a.glint.duration,
      easing: ease.camera,
      update: (k) => {
        follow(g);
        const b = a.glintBand(k);
        set(g.band, 'transform', `translate3d(${b.x}%, 0, 0) rotate(25deg)`);
        set(g.band, 'opacity', num(b.opacity));
      },
      done: () => {
        offs.delete(stop);
        clearStyle(g.band);
        clearStyle(g.box);
        g.playing = false;
        wake();
      },
    });
    keep(stop);
  };

  // A picture that finishes loading may let its glint play.
  const loaded = new MutationObserver(() => wake());
  for (const stack of new Set(glints.map((g) => g.stack))) if (stack) loaded.observe(stack, { attributeFilter: ['data-loading'] });
  keep(() => loaded.disconnect());

  for (const g of glints) {
    const box = g.box;
    // Entry: the whole watch on screen. A new entry needs the watch to have left the screen.
    keep(
      observe(
        box,
        (e) => {
          g.inView = e.intersectionRatio >= 0.99;
          wake();
        },
        '0px',
        1,
      ),
    );
    keep(
      observe(box, (e) => {
        if (!e.isIntersecting) g.armed = true;
      }),
    );
  }

  // ---- Smoke ----

  const smokes: Smoke[] = [...document.querySelectorAll<El>('[data-smoke]')].map((el) => ({
    el,
    cycle: a.smokeCycle(Number(el.dataset.cycle)),
    offset: Number(el.dataset.offset) || 0,
    rise: Number(el.dataset.rise) || 60,
    afterCigar: el.dataset.smokeAfter === 'cigar',
    visible: false,
    level: 0,
  }));
  for (const s of smokes) {
    keep(
      observe(
        s.el,
        (e) => {
          s.visible = e.isIntersecting;
          wake();
        },
      ),
    );
  }

  // ---- Cigar: a wipe on transforms only (window slides in, drawing stays put) ----

  const cigar = document.querySelector<El>('[data-cigar]');
  const win = cigar?.querySelector<El>('[data-cigar-window]');
  const art = cigar?.querySelector<El>('[data-cigar-art]');
  let cigarDrawn = true;
  if (cigar && win && art) {
    const r = cigar.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight) {
      cigarDrawn = false;
      set(win, 'transform', 'translate3d(-100%, 0, 0)');
      set(art, 'transform', 'translate3d(100%, 0, 0)');
      const off = keep(
        observe(
          cigar,
          (e) => {
            if (!e.isIntersecting || cigarDrawn) return;
            off();
            offs.delete(off);
            set(win, 'willChange', 'transform');
            set(art, 'willChange', 'transform');
            const stop = keep(
              tween({
                duration: a.cigar.duration,
                easing: ease.camera,
                update: (k) => {
                  set(win, 'transform', `translate3d(${num(-100 * (1 - k))}%, 0, 0)`);
                  set(art, 'transform', `translate3d(${num(100 * (1 - k))}%, 0, 0)`);
                },
                done: () => {
                  offs.delete(stop);
                  clearStyle(win);
                  clearStyle(art);
                  cigarDrawn = true;
                  wake();
                },
              }),
            );
          },
          '0px 0px -15% 0px',
        ),
      );
    }
  }

  // ---- Grain: about 12 steps a second, on the compositor (Accents.astro) ----

  const grain = document.querySelector<El>('[data-grain]');
  if (grain) grain.dataset.jitter = '';

  // ---- One task drives glint timing and smoke; it pauses with the page loop ----

  let last = now();
  let running = false;
  let stopTick = () => {};
  const tick = (t: number) => {
    const dt = Math.min(t - last, 100);
    last = t;

    // Phone: glint and smoke never together. A waiting glint makes the smoke give way first.
    const onPhone = phone.matches;
    // No smoke before the first screen is ready (it would cross the intro at the hero's seam).
    const holdSmoke = t < heroReadyAt || (onPhone && (glintPlaying() || glintWaiting()));
    let smokeShowing = false;
    for (const s of smokes) {
      const target = s.visible && !holdSmoke && (!s.afterCigar || cigarDrawn) ? 1 : 0;
      const step = dt / a.smoke.fade;
      // Off screen it simply stops; on screen it fades in or gives way gently.
      s.level = !s.visible ? 0 : target > s.level ? Math.min(target, s.level + step) : Math.max(target, s.level - step);
      if (s.level > 0) smokeShowing = true;
      if (s.level <= 0 && !s.visible) {
        if (touched.has(s.el)) {
          clearStyle(s.el);
          touched.delete(s.el);
        }
        continue;
      }
      const f = a.smokeFrame((t + s.offset) / s.cycle, s.rise);
      set(s.el, 'willChange', 'transform, opacity');
      set(s.el, 'transform', `translate3d(${px(f.x)}, ${px(f.y)}, 0)`);
      set(s.el, 'opacity', num(f.opacity * s.level));
    }

    for (const g of glints) {
      if (!pending(g)) continue;
      if (g.hero && t < heroReadyAt + a.glint.heroDelay) continue;
      if (!a.glintAllowed(t, g.last)) continue;
      if (onPhone && (smokeShowing || glintPlaying())) continue;
      play(g);
    }

    const busy =
      smokes.some((s) => s.visible || s.level > 0) ||
      glints.some((g) => g.playing || (pending(g) && (!g.hero || heroReadyAt < Number.POSITIVE_INFINITY)));
    if (!busy) {
      running = false;
      offs.delete(stopTick);
    }
    return busy;
  };
  function wake() {
    if (running || stopped) return;
    running = true;
    last = now();
    stopTick = keep(onFrame(tick));
  }
  wake();

  // Reduced motion switched on: everything back to its still, final state.
  keep(
    onMotionSettingChange((reduced) => {
      if (!reduced || stopped) return;
      stopped = true;
      for (const off of offs) off();
      offs.clear();
      for (const el of touched) clearStyle(el);
      touched.clear();
      for (const g of glints) {
        clearStyle(g.box);
        clearStyle(g.band);
      }
      if (win) clearStyle(win);
      if (art) clearStyle(art);
      if (grain) delete grain.dataset.jitter;
    }),
  );
}
