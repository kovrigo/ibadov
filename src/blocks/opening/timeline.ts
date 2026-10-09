// The intro, 0–7.8 s, as a pure function of time (DESIGN.md Motion «Вступление»; changed
// 8 October 2026: the customer's film plays whole, up to its own dissolve). The motion script
// draws whatever this returns; the video's clock is the timeline's. The unit test checks the steps.
import { motion } from '../../design/tokens';
import { ease } from '../../platform/motion-loop';

export const intro = {
  /** Length of the cut: the customer's film up to 7.0 s, the frame before its own dissolve into a screenshot. */
  clip: 7000,
  /** The video comes out of ink as it starts playing. */
  videoIn: [0, motion.duration.small],
  /**
   * 3.75–4.65 s, portrait screens only: the film fills the screen, then pulls back to its whole
   * width as its camera settles, so its title (from 3.97 s) shows complete.
   */
  pull: [3750, 3750 + motion.duration.cut],
  /** 6.4–7.3 s: the whole overlay (ink and video) dissolves straight onto the hero image. */
  dissolve: [6400, 6400 + motion.duration.cut],
  /** 6.4–7.8 s: the hero settles, 1.08 → 1.00, each layer by its speed. */
  settle: [6400, 7800],
  heroZoom: 0.08,
  /** 6.6 s: the credit, where it stands on the first screen. */
  credit: [6600, 6600 + motion.duration.title],
  /** 6.85 s: headline, lead, nav and cue. */
  headline: [6850, 6850 + motion.duration.title],
  end: 7800,
  /** Tap, scroll, a key or «Пропустить»: the ready first screen in 240ms. */
  skip: motion.duration.small,
} as const;

export interface IntroFrame {
  /** Opacity of the whole overlay (ink and video) over the hero image. */
  overlay: number;
  /** Opacity of the video over the overlay's ink. */
  video: number;
  /** 0 → 1 as the film pulls back from full screen to its whole width (portrait screens). */
  pull: number;
  credit: number;
  /** Headline, lead, nav and cue. */
  headline: number;
  /** 0 → 1 as the hero settles. */
  settle: number;
}

const at = (t: number, [a, b]: readonly [number, number]) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));

export function introFrame(t: number): IntroFrame {
  return {
    overlay: 1 - ease.camera(at(t, intro.dissolve)),
    video: ease.enter(at(t, intro.videoIn)),
    pull: ease.camera(at(t, intro.pull)),
    credit: ease.enter(at(t, intro.credit)),
    headline: ease.enter(at(t, intro.headline)),
    settle: ease.camera(at(t, intro.settle)),
  };
}

/** The ready first screen. */
export const readyFrame: IntroFrame = { overlay: 0, video: 1, pull: 1, credit: 1, headline: 1, settle: 1 };

/** Scale of a hero layer: 1 + 0.08 × speed before it settles, 1 once settled. */
export const layerZoom = (speed: number, settle: number) => 1 + intro.heroZoom * speed * (1 - settle);

/**
 * Scale of the film on a portrait screen: `cover` (it fills the screen) before the pull-back,
 * 1 (its whole width, centred) after. `cover` is the screen over the video box, the larger side.
 */
export const pullScale = (cover: number, pull: number) => cover + (1 - cover) * pull;

/** Scale s around (ox, oy), fractions of a w×h box, for the default centre transform origin. */
export function scaleAbout(s: number, ox: number, oy: number, w: number, h: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `translate(${r((1 - s) * (ox - 0.5) * w)}px, ${r((1 - s) * (oy - 0.5) * h)}px) scale(${Math.round(s * 1e5) / 1e5})`;
}
