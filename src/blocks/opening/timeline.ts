// The intro, 0–4.7 s (Brief «Вступление»), as a pure function of time. The motion script draws
// whatever this returns; the unit test checks the steps and that it ends inside 5 s.
import { motion } from '../../design/tokens';
import { ease } from '../../platform/motion-loop';

export const intro = {
  /** The aerial frame comes out of ink as the push-in starts. */
  aerialIn: [0, motion.duration.title],
  /** 0–2.4 s: push-in on the dome centre, 1.00 → 1.15. */
  push: [0, 2400],
  aerialZoom: motion.maxScale,
  /** 0.6 s: the credit, where it stands on the first screen. */
  credit: [600, 600 + motion.duration.title],
  /** 2.4–3.3 s: the cut through ink (aerial out, then the balcony in). */
  aerialOut: [2400, 2850],
  balconyIn: [2850, 3300],
  /** 3.3–4.7 s: the balcony settles, 1.08 → 1.00, each layer by its speed. */
  settle: [3300, 4700],
  balconyZoom: 0.08,
  /** 3.8 s: headline and lead. */
  headline: [3800, 3800 + motion.duration.title],
  end: 4700,
  /** Tap, scroll or a key: the ready first screen in 240ms. */
  skip: motion.duration.small,
} as const;

export interface IntroFrame {
  /** Opacity of the ink overlay over the hero image. */
  overlay: number;
  aerial: number;
  aerialScale: number;
  credit: number;
  /** Headline and lead. */
  headline: number;
  /** 0 → 1 as the balcony settles. */
  settle: number;
}

const at = (t: number, [a, b]: readonly [number, number]) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));

export function introFrame(t: number): IntroFrame {
  return {
    overlay: 1 - ease.enter(at(t, intro.balconyIn)),
    aerial: ease.enter(at(t, intro.aerialIn)) * (1 - ease.exit(at(t, intro.aerialOut))),
    aerialScale: 1 + (intro.aerialZoom - 1) * ease.camera(at(t, intro.push)),
    credit: ease.enter(at(t, intro.credit)),
    headline: ease.enter(at(t, intro.headline)),
    settle: ease.camera(at(t, intro.settle)),
  };
}

/** The ready first screen. */
export const readyFrame: IntroFrame = { overlay: 0, aerial: 0, aerialScale: intro.aerialZoom, credit: 1, headline: 1, settle: 1 };

/** Scale of a balcony layer: 1 + 0.08 × speed before it settles, 1 once settled. */
export const layerZoom = (speed: number, settle: number) => 1 + intro.balconyZoom * speed * (1 - settle);

/** Scale s around (ox, oy), fractions of a w×h box, for the default centre transform origin. */
export function scaleAbout(s: number, ox: number, oy: number, w: number, h: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `translate(${r((1 - s) * (ox - 0.5) * w)}px, ${r((1 - s) * (oy - 0.5) * h)}px) scale(${Math.round(s * 1e5) / 1e5})`;
}
