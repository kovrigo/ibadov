import { describe, expect, test } from 'bun:test';
import { cubicBezier, ease } from '../motion-loop';

describe('easings (DESIGN.md Motion)', () => {
  test('the identity curve is linear', () => {
    for (const p of [0, 0.3, 0.7, 1]) expect(cubicBezier(0, 0, 1, 1)(p)).toBeCloseTo(p, 5);
  });
  test('camera is symmetric, enter front-loaded, exit back-loaded', () => {
    expect(ease.camera(0.5)).toBeCloseTo(0.5, 5);
    expect(ease.camera(0.25) + ease.camera(0.75)).toBeCloseTo(1, 5);
    expect(ease.enter(0.5)).toBeGreaterThan(0.9);
    expect(ease.exit(0.5)).toBeLessThan(0.1);
  });
  test('every curve starts at 0, ends at 1, never goes back, and clamps outside 0..1', () => {
    for (const e of [ease.camera, ease.enter, ease.exit]) {
      expect(e(-1)).toBe(0);
      expect(e(2)).toBe(1);
      let last = 0;
      for (let p = 0; p <= 1; p += 0.01) {
        const v = e(p);
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
      }
    }
  });
});
