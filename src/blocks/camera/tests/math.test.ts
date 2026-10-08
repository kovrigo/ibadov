import { describe, expect, test } from 'bun:test';
import * as m from '../math';
import { motion } from '../../../design/tokens';

const vh = 900;

describe('hero layers', () => {
  test('each layer lags by (1 − speed) × p × 12% of the screen', () => {
    expect(m.layerOffset(m.speeds.far, 1, vh)).toBeCloseTo(0.55 * 0.12 * vh, 6);
    expect(m.layerOffset(m.speeds.band, 1, vh)).toBeCloseTo(0.3 * 0.12 * vh, 6);
    expect(m.layerOffset(m.speeds.near, 1, vh)).toBe(0);
    expect(m.layerOffset(m.speeds.far, 0.5, vh)).toBeCloseTo(0.5 * 0.55 * 0.12 * vh, 6);
    expect(m.layerOffset(m.speeds.far, 0, vh)).toBe(0);
  });

  test('speeds are DESIGN.md: far 0.45, band 0.70, near 1.00; phone windows as band and near', () => {
    expect([m.speeds.far, m.speeds.band, m.speeds.near]).toEqual([0.45, 0.7, 1]);
    expect([m.speeds['phone-back'], m.speeds['phone-near']]).toEqual([0.7, 1]);
    expect(m.speeds.plate).toBe(0.45);
  });

  test('the full travel over the hero exit is 12% of the screen', () => {
    expect(m.layerOffset(0, 1, vh)).toBeCloseTo(0.12 * vh, 6);
  });

  test('exit progress is scrollY over the hero height, clamped', () => {
    expect(m.heroProgress(0, 900)).toBe(0);
    expect(m.heroProgress(450, 900)).toBe(0.5);
    expect(m.heroProgress(5000, 900)).toBe(1);
    expect(m.heroProgress(-20, 900)).toBe(0);
  });

  test('the stack zooms to 1.06 over the exit', () => {
    expect(m.heroScale(0)).toBe(1);
    expect(m.heroScale(1)).toBeCloseTo(1.06, 9);
    expect(m.heroScale(3)).toBeCloseTo(1.06, 9);
  });

  test('scaling around the crop anchor keeps the anchor point still', () => {
    const [w, h, ax, ay, s] = [1440, 900, 0.62, 0.1, 1.06];
    const t = m.scaleAbout(s, ax, ay, w, h);
    const [, tx, ty] = t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!.map(Number);
    // Default origin is the centre: a point P maps to C + (P − C)·s + t.
    const map = (p: number, c: number, d: number) => c + (p - c) * s + d;
    expect(map(ax * w, w / 2, tx!)).toBeCloseTo(ax * w, 1);
    expect(map(ay * h, h / 2, ty!)).toBeCloseTo(ay * h, 1);
  });

  test('a line grows from its left edge', () => {
    const t = m.scaleFromLeft(0.5, 200);
    expect(t).toBe('translateX(-50px) scaleX(0.5)');
    expect(m.scaleFromLeft(1, 200)).toBe('translateX(0px) scaleX(1)');
  });
});

describe('passes and cuts', () => {
  test('pass progress runs from the top meeting the screen bottom to the bottom leaving the top', () => {
    expect(m.passProgress(vh, vh, vh, 10_000)).toBe(0);
    expect(m.passProgress(0, vh, vh, 10_000)).toBe(0.5);
    expect(m.passProgress(-vh, vh, vh, 10_000)).toBe(1);
  });

  test('the last scene completes its pass at the end of the page', () => {
    // Final scene 900 tall, last on the page: at the bottom its top is at 0.
    expect(m.passProgress(0, vh, vh, vh)).toBe(1);
  });

  test('portrait, stairs and aerial push in 1.00 → 1.04', () => {
    expect(m.passScale(0)).toBe(1);
    expect(m.passScale(1)).toBeCloseTo(1.04, 9);
  });

  test('plates move at speed 0.45: ±(1 − 0.45) × 12% of the screen', () => {
    expect(m.plateOffset(0, vh)).toBeCloseTo(-0.55 * 0.12 * vh, 6);
    expect(m.plateOffset(0.5, vh)).toBeCloseTo(0, 6);
    expect(m.plateOffset(1, vh)).toBeCloseTo(0.55 * 0.12 * vh, 6);
  });

  test('cut through ink: dark at the edges of the scene, full in between', () => {
    const h = vh;
    expect(m.cutOpacity(vh, h, vh)).toBe(0); // top just at the screen bottom
    expect(m.cutOpacity(vh - 0.15 * h, h, vh)).toBe(1); // first 15% passed
    expect(m.cutOpacity(vh - 0.075 * h, h, vh)).toBeCloseTo(0.5, 6);
    expect(m.cutOpacity(0, h, vh)).toBe(1);
    expect(m.cutOpacity(-0.85 * h, h, vh)).toBe(1); // last 15% begins
    expect(m.cutOpacity(-0.925 * h, h, vh)).toBeCloseTo(0.5, 6);
    expect(m.cutOpacity(-h, h, vh)).toBe(0);
  });

  test('visible share counts against the smaller of scene and screen', () => {
    expect(m.visibleShare(0, vh, vh)).toBe(1);
    expect(m.visibleShare(vh * 0.4, vh, vh)).toBeCloseTo(0.6, 9);
    // A scene taller than the screen can still be "60% visible".
    expect(m.visibleShare(0, 2 * vh, vh)).toBe(1);
  });
  test('zero sizes give numbers, never NaN', () => {
    expect(m.visibleShare(100, 0, 900)).toBe(0);
    expect(m.heroProgress(10, 0)).toBe(0);
    expect(m.passProgress(0, 0, 0, 0)).toBe(1);
    expect(m.cutOpacity(0, 0, 900)).toBe(1);
  });
});

describe('numbers', () => {
  const s = m.numbersSchedule();
  test('ends by 1380ms, inside the 1400ms numbers duration', () => {
    expect(s.end).toBeLessThanOrEqual(1380);
    expect(s.end).toBeLessThanOrEqual(motion.duration.numbers);
  });
  test('each line draws in 900ms; words fade in over 480ms from its midpoint', () => {
    for (const f of s.facts) {
      expect(f.line[1] - f.line[0]).toBe(900);
      expect(f.words[0]).toBe(f.line[0] + 450);
      expect(f.words[1] - f.words[0]).toBe(480);
    }
  });
  test('the second fact starts 450ms after the first', () => {
    expect(s.facts).toHaveLength(2);
    expect(s.facts[1]!.line[0] - s.facts[0]!.line[0]).toBe(450);
  });
});

describe('freeze frame', () => {
  const f = m.freezeSchedule();
  test('push 1.00 → 1.04 in 900ms', () => {
    expect(f.push).toEqual([0, 900]);
    expect(f.zoom).toBeCloseTo(1.04, 9);
  });
  test('amber to 0.3 in 240ms and back in 660ms; the swap at the peak', () => {
    expect(f.flashPeak).toBe(0.3);
    expect(f.flashUp).toEqual([0, 240]);
    expect(f.flashDown[1] - f.flashDown[0]).toBe(660);
    expect(f.swap as number).toBe(f.flashUp[1]);
  });
  test('credit and caption in 480ms after the swap, then the gold line in 480ms', () => {
    expect(f.text).toEqual([240, 720]);
    expect(f.line[0]).toBe(f.text[1]);
    expect(f.line[1] - f.line[0]).toBe(480);
  });
});

describe('partners', () => {
  test('names 240ms apart', () => {
    const p = m.partnersSchedule();
    expect(p.names[1]![0] - p.names[0]![0]).toBe(240);
  });
});

describe('zoom limit', () => {
  test('no camera scale above 1.15', () => {
    for (const s of [m.heroScale(1), m.passScale(1), m.freezeSchedule().zoom]) expect(s).toBeLessThanOrEqual(motion.maxScale);
  });
});

describe('seam from the first screen into services (DESIGN.md Motion)', () => {
  test('at rest the desk is not there and the balcony is whole', () => {
    expect(m.seamDesk(0)).toBe(0);
    expect(m.seamHero(0)).toBe(1);
  });
  test('the desk is in before the balcony is half gone: the pictures cross, no dip to ink', () => {
    expect(m.seamDesk(0.4)).toBe(1);
    expect(m.seamHero(0.3)).toBe(1);
    expect(m.seamHero(0.6)).toBeCloseTo(0.5, 6);
    for (let p = 0; p <= 1; p += 0.05) expect(m.seamDesk(p) + m.seamHero(p)).toBeGreaterThanOrEqual(1);
  });
  test('once the first screen has left, only the desk', () => {
    expect(m.seamHero(0.9)).toBe(0);
    expect(m.seamDesk(1)).toBe(1);
  });
  test('both move continuously with the scroll', () => {
    for (let p = 0; p < 1; p += 0.01) {
      expect(Math.abs(m.seamDesk(p + 0.01) - m.seamDesk(p))).toBeLessThan(0.05);
      expect(Math.abs(m.seamHero(p + 0.01) - m.seamHero(p))).toBeLessThan(0.05);
    }
  });
  test('the leaving half of the cut is the cut', () => {
    const [vh, h] = [900, 900];
    for (const top of [0, -0.85 * h, -0.925 * h, -h]) expect(m.cutOut(top, h)).toBe(m.cutOpacity(top, h, vh));
  });
});
