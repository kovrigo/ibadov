// The intro, 0–4.4 s (Brief «Вступление»), as a pure function of time. The motion script draws
// whatever this returns and starts the video at 0; the unit test checks the steps and that it
// ends inside 5 s.
import { motion } from '../../design/tokens';
import { ease } from '../../platform/motion-loop';

export const intro = {
  /** The video comes out of ink as it starts playing. */
  videoIn: [0, motion.duration.small],
  /** 2.6 s: the credit, where it stands on the first screen. */
  credit: [2600, 2600 + motion.duration.title],
  /** 3.0–3.9 s: the whole overlay (ink and video) dissolves straight onto the hero image. */
  dissolve: [3000, 3000 + motion.duration.cut],
  /** 3.0–4.4 s: the hero settles, 1.08 → 1.00, each layer by its speed. */
  settle: [3000, 4400],
  heroZoom: 0.08,
  /** 3.5 s: headline, lead, nav and cue. */
  headline: [3500, 3500 + motion.duration.title],
  end: 4400,
  /** Tap, scroll or a key: the ready first screen in 240ms. */
  skip: motion.duration.small,
} as const;

export interface IntroFrame {
  /** Opacity of the whole overlay (ink and video) over the hero image. */
  overlay: number;
  /** Opacity of the video over the overlay's ink. */
  video: number;
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
    credit: ease.enter(at(t, intro.credit)),
    headline: ease.enter(at(t, intro.headline)),
    settle: ease.camera(at(t, intro.settle)),
  };
}

/** The ready first screen. */
export const readyFrame: IntroFrame = { overlay: 0, video: 1, credit: 1, headline: 1, settle: 1 };

/** Scale of a hero layer: 1 + 0.08 × speed before it settles, 1 once settled. */
export const layerZoom = (speed: number, settle: number) => 1 + intro.heroZoom * speed * (1 - settle);

/** Scale s around (ox, oy), fractions of a w×h box, for the default centre transform origin. */
export function scaleAbout(s: number, ox: number, oy: number, w: number, h: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `translate(${r((1 - s) * (ox - 0.5) * w)}px, ${r((1 - s) * (oy - 0.5) * h)}px) scale(${Math.round(s * 1e5) / 1e5})`;
}
