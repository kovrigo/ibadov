import { describe, expect, test } from 'bun:test';
import { intro, introFrame, layerZoom, readyFrame, scaleAbout } from '../timeline';
import { motion } from '../../../design/tokens';

describe('intro timeline (Brief «Вступление»)', () => {
  test('ends at 4.4 s, inside 5 s', () => {
    expect(intro.end).toBe(4400);
    expect(intro.end).toBeLessThanOrEqual(5000);
  });

  test('0–240ms: the video comes out of ink', () => {
    expect(introFrame(0).overlay).toBe(1);
    expect(introFrame(0).video).toBe(0);
    expect(introFrame(120).video).toBeGreaterThan(0);
    expect(introFrame(120).video).toBeLessThan(1);
    expect(introFrame(240).video).toBe(1);
  });

  test('2.6 s: the credit fades in over 480ms', () => {
    expect(introFrame(2600).credit).toBe(0);
    expect(introFrame(2840).credit).toBeGreaterThan(0);
    expect(introFrame(2840).credit).toBeLessThan(1);
    expect(introFrame(3080).credit).toBe(1);
  });

  test('3.0–3.9 s: the overlay dissolves straight onto the hero image, no ink between', () => {
    expect(intro.dissolve[1] - intro.dissolve[0]).toBe(motion.duration.cut);
    expect(introFrame(2999).overlay).toBe(1);
    expect(introFrame(3450).overlay).toBeGreaterThan(0);
    expect(introFrame(3450).overlay).toBeLessThan(1);
    expect(introFrame(3900).overlay).toBe(0);
    // The video stays fully up inside the overlay while it dissolves: no ink shows through.
    for (let t = 3000; t <= 3900; t += 100) expect(introFrame(t).video).toBe(1);
  });

  test('3.0–4.4 s: the hero settles from 1.08, each layer by its speed', () => {
    expect(layerZoom(1, introFrame(3000).settle)).toBeCloseTo(1.08, 9);
    expect(layerZoom(0.7, introFrame(3000).settle)).toBeCloseTo(1 + 0.08 * 0.7, 9);
    expect(layerZoom(0.45, introFrame(3000).settle)).toBeCloseTo(1 + 0.08 * 0.45, 9);
    expect(layerZoom(1, introFrame(3700).settle)).toBeGreaterThan(1);
    expect(layerZoom(1, introFrame(4400).settle)).toBe(1);
    expect(layerZoom(1, introFrame(3000).settle)).toBeLessThanOrEqual(motion.maxScale);
  });

  test('3.5 s: headline, lead, nav and cue fade in over 480ms', () => {
    expect(introFrame(3500).headline).toBe(0);
    expect(introFrame(3740).headline).toBeGreaterThan(0);
    expect(introFrame(3980).headline).toBe(1);
  });

  test('at the end the frame is the ready first screen', () => {
    const end = introFrame(intro.end);
    for (const k of ['overlay', 'video', 'credit', 'headline', 'settle'] as const) expect(end[k]).toBe(readyFrame[k]);
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
