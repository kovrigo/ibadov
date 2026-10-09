import { describe, expect, test } from 'bun:test';
import { intro, introFrame, layerZoom, pullScale, readyFrame, scaleAbout } from '../timeline';
import { motion } from '../../../design/tokens';

describe('intro timeline (DESIGN.md Motion «Вступление»)', () => {
  test('the film plays whole up to 7.0 s; the first screen is ready at 7.8 s', () => {
    expect(intro.clip).toBe(7000);
    expect(intro.end).toBe(7800);
  });

  test('0–240ms: the video comes out of ink', () => {
    expect(introFrame(0).overlay).toBe(1);
    expect(introFrame(0).video).toBe(0);
    expect(introFrame(120).video).toBeGreaterThan(0);
    expect(introFrame(120).video).toBeLessThan(1);
    expect(introFrame(240).video).toBe(1);
  });

  test('nothing of the first screen shows over the film before the dissolve', () => {
    for (let t = 0; t < intro.dissolve[0]; t += 100) {
      const f = introFrame(t);
      expect([f.overlay, f.credit, f.headline, f.settle]).toEqual([1, 0, 0, 0]);
    }
  });

  test('3.75–4.65 s: the portrait pull-back, finished before the title is complete (4.3 s) plus 350ms', () => {
    expect(introFrame(3750).pull).toBe(0);
    expect(introFrame(4200).pull).toBeGreaterThan(0);
    expect(introFrame(4200).pull).toBeLessThan(1);
    expect(introFrame(4650).pull).toBe(1);
    // The title starts typing at 3.97 s: the pull-back is under way by then.
    expect(introFrame(3970).pull).toBeGreaterThan(0);
  });

  test('pull scale: cover before, 1 after', () => {
    expect(pullScale(2.3, 0)).toBe(2.3);
    expect(pullScale(2.3, 1)).toBe(1);
    expect(pullScale(2.3, 0.5)).toBeCloseTo(1.65, 9);
  });

  test('6.4–7.3 s: the overlay dissolves straight onto the hero image, and starts before the film ends', () => {
    expect(intro.dissolve[1] - intro.dissolve[0]).toBe(motion.duration.cut);
    expect(intro.dissolve[0]).toBeLessThan(intro.clip);
    expect(intro.dissolve[1]).toBeGreaterThan(intro.clip);
    expect(introFrame(6399).overlay).toBe(1);
    expect(introFrame(6850).overlay).toBeGreaterThan(0);
    expect(introFrame(6850).overlay).toBeLessThan(1);
    expect(introFrame(7300).overlay).toBe(0);
    // The video stays fully up inside the overlay while it dissolves: no ink shows through.
    for (let t = 6400; t <= 7300; t += 100) expect(introFrame(t).video).toBe(1);
    // At the film's last frame most of the hero is already in.
    expect(introFrame(intro.clip).overlay).toBeLessThan(0.3);
  });

  test('6.4–7.8 s: the hero settles from 1.08, each layer by its speed', () => {
    expect(layerZoom(1, introFrame(6400).settle)).toBeCloseTo(1.08, 9);
    expect(layerZoom(0.7, introFrame(6400).settle)).toBeCloseTo(1 + 0.08 * 0.7, 9);
    expect(layerZoom(0.45, introFrame(6400).settle)).toBeCloseTo(1 + 0.08 * 0.45, 9);
    expect(layerZoom(1, introFrame(7100).settle)).toBeGreaterThan(1);
    expect(layerZoom(1, introFrame(7800).settle)).toBe(1);
    expect(layerZoom(1, introFrame(6400).settle)).toBeLessThanOrEqual(motion.maxScale);
  });

  test('6.6 s: the credit; 6.85 s: headline, lead, nav and cue, each over 480ms', () => {
    expect(introFrame(6600).credit).toBe(0);
    expect(introFrame(6840).credit).toBeGreaterThan(0);
    expect(introFrame(7080).credit).toBe(1);
    expect(introFrame(6850).headline).toBe(0);
    expect(introFrame(7090).headline).toBeGreaterThan(0);
    expect(introFrame(7330).headline).toBe(1);
  });

  test('at the end the frame is the ready first screen', () => {
    const end = introFrame(intro.end);
    for (const k of ['overlay', 'video', 'pull', 'credit', 'headline', 'settle'] as const) expect(end[k]).toBe(readyFrame[k]);
  });

  test('a skip reaches the ready first screen in 240ms', () => {
    expect(intro.skip).toBe(240);
  });

  test('a layer scales around its crop anchor: the anchor stays still', () => {
    const [w, h, ax, ay, s] = [1440, 900, 0.62, 0.1, 1.08];
    const [, tx, ty] = scaleAbout(s, ax, ay, w, h).match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!.map(Number);
    // Default origin is the centre: a point P maps to C + (P − C)·s + t.
    expect(w / 2 + (ax * w - w / 2) * s + tx!).toBeCloseTo(ax * w, 1);
    expect(h / 2 + (ay * h - h / 2) * s + ty!).toBeCloseTo(ay * h, 1);
  });
});
