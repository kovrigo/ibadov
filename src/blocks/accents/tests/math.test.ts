import { describe, expect, test } from 'bun:test';
import { glint, glintAllowed, glintBand, smoke, smokeCycle, smokeFrame } from '../math';

describe('glint', () => {
  test('700ms, at most every 6 s, hero 600ms after the first screen is ready', () => {
    expect(glint.duration).toBe(700);
    expect(glintAllowed(10_000, 4_100)).toBe(false);
    expect(glintAllowed(10_000, 4_000)).toBe(true);
    expect(glintAllowed(0, Number.NEGATIVE_INFINITY)).toBe(true);
    expect(glint.heroDelay).toBe(600);
  });
  test('the band crosses its box and is invisible at both ends', () => {
    expect(glintBand(0)).toEqual({ x: glint.from, opacity: 0 });
    expect(glintBand(1).x).toBe(glint.to);
    expect(glintBand(1).opacity).toBeCloseTo(0, 9);
    expect(glintBand(0.5).opacity).toBeCloseTo(1, 9);
  });
});

describe('smoke', () => {
  test('never above 0.35', () => {
    for (let p = 0; p <= 1; p += 0.01) expect(smokeFrame(p, 60).opacity).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(smoke.maxOpacity).toBe(0.35);
  });
  test('cycles last 10–14 s', () => {
    expect(smokeCycle(9000)).toBe(10_000);
    expect(smokeCycle(12_000)).toBe(12_000);
    expect(smokeCycle(20_000)).toBe(14_000);
    // A missing data-cycle reads as NaN.
    expect(smokeCycle(Number.NaN)).toBe(10_000);
    expect(smokeCycle(0)).toBe(10_000);
  });
  test('any phase wraps into one cycle (the motion script passes time ÷ cycle)', () => {
    expect(smokeFrame(1.5, 60)).toEqual(smokeFrame(0.5, 60));
    expect(smokeFrame(7.25, 60).y).toBeCloseTo(smokeFrame(0.25, 60).y, 9);
    expect(smokeFrame(-0.25, 60).y).toBeCloseTo(smokeFrame(0.75, 60).y, 9);
    for (const p of [-3.3, 12.7, 100.01]) expect(smokeFrame(p, 60).opacity).toBeLessThanOrEqual(0.35 + 1e-9);
  });
  test('it only rises, and is invisible where the cycle wraps', () => {
    expect(smokeFrame(0, 60).y).toBeCloseTo(0, 9);
    expect(smokeFrame(0.5, 60).y).toBe(-30);
    for (let p = 0; p < 1; p += 0.05) expect(smokeFrame(p, 60).y).toBeLessThanOrEqual(0);
    expect(smokeFrame(0, 60).opacity).toBe(0);
    expect(smokeFrame(0.999, 60).opacity).toBeLessThan(0.001);
  });
});
