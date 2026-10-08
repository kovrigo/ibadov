// Accent numbers (Brief «Сигара и дым», «Блик»; DESIGN.md Motion). Pure functions shared by the
// motion script and the unit tests.
import { depth, motion } from '../../design/tokens';

/** Glint: a light band across the watch in 700ms, once per entry, at most every 6 s. */
export const glint = {
  duration: motion.duration.glint,
  gap: 6000,
  /** Hero: 600ms after the first screen is ready. */
  heroDelay: 600,
  /** Band path across its box, in % of the band's own width (the band is 28% of the box). */
  from: -150,
  to: 400,
} as const;

/** The band at eased progress k: position (% of its width) and opacity (a soft bell). */
export function glintBand(k: number): { x: number; opacity: number } {
  const s = Math.sin(Math.PI * Math.min(Math.max(k, 0), 1));
  return { x: glint.from + (glint.to - glint.from) * k, opacity: s * s };
}

/** True when a glint last played at `last` may play again at `time`. */
export const glintAllowed = (time: number, last: number) => time - last >= glint.gap;

/** Cigar: drawn as a line on the final's entry in 900ms. */
export const cigar = { duration: motion.duration.cut } as const;

/** Smoke: opacity never above 0.35, one cycle 10–14 s. */
export const smoke = {
  maxOpacity: depth.smokeMaxOpacity,
  minCycle: motion.smokeCycle.min,
  maxCycle: motion.smokeCycle.max,
  /** How long smoke takes to fade out or back in when it must give way (phone glint, leaving view). */
  fade: motion.duration.title,
} as const;

/** Cycle length for a smoke texture: its own value, kept inside 10–14 s. */
export const smokeCycle = (ms: number) => Math.min(Math.max(ms || smoke.minCycle, smoke.minCycle), smoke.maxCycle);

/** One smoke frame at `phase` (0..1 through its cycle): it rises, sways a little and breathes. */
export function smokeFrame(phase: number, rise: number): { y: number; x: number; opacity: number } {
  const p = phase - Math.floor(phase);
  const s = Math.sin(Math.PI * p);
  return { y: -rise * p, x: 8 * Math.sin(2 * Math.PI * p), opacity: smoke.maxOpacity * s * s };
}

/** Numbers as CSS values: unitless with 5 decimals, pixels with 2. */
export const num = (v: number) => String(Math.round(v * 1e5) / 1e5);
export const px = (v: number) => `${Math.round(v * 100) / 100}px`;
