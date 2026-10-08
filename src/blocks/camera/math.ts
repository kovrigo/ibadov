// Camera numbers (Brief «Движение», DESIGN.md Motion). Pure functions: the motion script and the
// unit tests share them. Lengths are CSS pixels, times milliseconds.
import { motion } from '../../design/tokens';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Layer speeds. The phone windows: the back window (far plane and cathedral) moves as the band. */
export const speeds = {
  far: motion.layerSpeed.far,
  band: motion.layerSpeed.band,
  near: motion.layerSpeed.near,
  'phone-back': motion.layerSpeed.band,
  'phone-near': motion.layerSpeed.near,
  plate: motion.layerSpeed.far,
} as const;

/** Hero exit progress: 0 at the top of the page, 1 once the hero has scrolled away. */
export function heroProgress(scrollY: number, heroHeight: number): number {
  return heroHeight > 0 ? clamp01(scrollY / heroHeight) : 0;
}

/** How far a layer lags behind the page during the hero exit: (1 − speed) × p × 12% of the screen. */
export function layerOffset(speed: number, p: number, viewportHeight: number): number {
  return (1 - speed) * p * motion.cameraTravel * viewportHeight;
}

/** Whole hero stack during its exit: 1.00 → 1.06 around the crop anchor. */
export const heroZoom = 0.06;
export const heroScale = (p: number) => 1 + heroZoom * clamp01(p);

/**
 * Pass progress of a scene: 0 when its top meets the bottom of the screen, 1 when its bottom
 * leaves the top — or, for the last scene, when the page can scroll no further.
 * `untilPageEnd` is the page height below the scene's top.
 */
export function passProgress(top: number, height: number, viewportHeight: number, untilPageEnd: number): number {
  const span = Math.min(height + viewportHeight, untilPageEnd);
  return span > 0 ? clamp01((viewportHeight - top) / span) : 1;
}

/** Portrait, stairs and aerial scenes push in slowly across their pass: 1.00 → 1.04. */
export const passZoom = 0.04;
export const passScale = (q: number) => 1 + passZoom * clamp01(q);

/** Text-scene plates move at speed 0.45: they lag the page by up to ±(1 − 0.45) × 12% of the screen. */
export function plateOffset(q: number, viewportHeight: number): number {
  return (1 - speeds.plate) * motion.cameraTravel * viewportHeight * (2 * clamp01(q) - 1);
}

/** Share of a scene's height over which its image comes out of ink (entering) and goes to ink (leaving). */
export const cutShare = 0.15;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Image opacity for the cut through ink, from the scene's top on screen and its height. */
export function cutOpacity(top: number, height: number, viewportHeight: number): number {
  const edge = cutShare * height;
  if (edge <= 0) return 1;
  const entered = viewportHeight - top;
  const left = top + height;
  return Math.min(smooth(clamp01(entered / edge)), smooth(clamp01(left / edge)));
}

/** Share of a scene on screen, against the smaller of its height and the screen's. */
export function visibleShare(top: number, height: number, viewportHeight: number): number {
  const whole = Math.min(height, viewportHeight);
  if (whole <= 0) return 0;
  const seen = Math.min(top + height, viewportHeight) - Math.max(top, 0);
  return clamp01(seen / whole);
}

/** Scale s around (ox, oy), fractions of a w×h box, as a transform for the default centre origin. */
export function scaleAbout(s: number, ox: number, oy: number, w: number, h: number): string {
  const x = (1 - s) * (ox - 0.5) * w;
  const y = (1 - s) * (oy - 0.5) * h;
  return `translate(${px(x)}, ${px(y)}) scale(${num(s)})`;
}

/** scaleX(s) growing from the left edge of a box w wide, for the default centre origin. */
export function scaleFromLeft(s: number, w: number): string {
  return `translateX(${px((-(1 - s) * w) / 2)}) scaleX(${num(s)})`;
}

/** A vertical lift: translateY in px. */
export const lift = (y: number) => `translate3d(0, ${px(y)}, 0)`;

export function num(v: number): string {
  return String(Math.round(v * 1e5) / 1e5);
}
export function px(v: number): string {
  return `${Math.round(v * 100) / 100}px`;
}

export type Span = readonly [start: number, end: number];

/** Text on entry: 24px lift and fade, 480ms. */
export const textEntry = { rise: motion.textRise, duration: motion.duration.title } as const;

/**
 * Numbers, once the scene is half on screen. Each fact: the line draws from the left in 900ms;
 * halfway through it the words and the number fade in over 480ms. The second fact starts 450ms
 * after the first. Everything ends by 1380ms, inside the 1400ms "numbers" duration.
 */
export function numbersSchedule(): { facts: { line: Span; words: Span }[]; end: number } {
  const line = motion.duration.cut;
  const words = motion.duration.title;
  const stagger = 450;
  const facts = [0, 1].map((i) => {
    const start = i * stagger;
    return { line: [start, start + line] as Span, words: [start + line / 2, start + line / 2 + words] as Span };
  });
  return { facts, end: Math.max(...facts.flatMap((f) => [f.line[1], f.words[1]])) };
}

/**
 * Freeze frame, once the scene is 60% on screen (Brief steps 1–5): push 1.00 → 1.04 in 900ms;
 * amber up to 0.3 in 240ms and down in 660ms; at the peak the portrait turns muted; then the
 * credit and caption (480ms); then the gold line towards the face (wide) or under the name
 * (vertical), 480ms.
 */
export function freezeSchedule() {
  const peak = motion.duration.small;
  const text: Span = [peak, peak + motion.duration.title];
  return {
    push: [0, motion.duration.cut] as Span,
    zoom: 1 + passZoom,
    flashUp: [0, peak] as Span,
    flashDown: [peak, motion.duration.cut] as Span,
    flashPeak: 0.3,
    swap: peak,
    text,
    line: [text[1], text[1] + motion.duration.title] as Span,
  };
}

/** Partners on entry: the title with the text group, then the two names 240ms apart. */
export function partnersSchedule() {
  const gap = motion.duration.small;
  const d = motion.duration.title;
  return {
    text: [0, d] as Span,
    names: [[gap, gap + d], [2 * gap, 2 * gap + d]] as Span[],
    rule: [gap, gap + d] as Span,
  };
}
