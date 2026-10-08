import { describe, expect, test } from 'bun:test';
import { intro, introFrame, layerZoom, readyFrame } from '../timeline';
import { motion } from '../../../design/tokens';

describe('intro timeline (Brief «Вступление»)', () => {
  test('ends at 4.7 s, inside 5 s; glint 600ms later', () => {
    expect(intro.end).toBe(4700);
    expect(intro.end).toBeLessThanOrEqual(5000);
    expect(intro.glint - intro.end).toBe(600);
  });

  test('0–2.4 s: the aerial pushes in 1.00 → 1.15', () => {
    expect(introFrame(0).aerialScale).toBe(1);
    expect(introFrame(1200).aerialScale).toBeGreaterThan(1);
    expect(introFrame(2400).aerialScale).toBeCloseTo(1.15, 9);
    expect(introFrame(2400).aerialScale).toBeLessThanOrEqual(motion.maxScale);
  });

  test('0.6 s: the credit fades in over 480ms', () => {
    expect(introFrame(600).credit).toBe(0);
    expect(introFrame(1080).credit).toBe(1);
    expect(introFrame(840).credit).toBeGreaterThan(0);
  });

  test('2.4–3.3 s: the cut through ink', () => {
    expect(introFrame(2399).aerial).toBeCloseTo(1, 3);
    expect(introFrame(2850).aerial).toBe(0);
    expect(introFrame(2850).overlay).toBe(1); // ink between the shots
    expect(introFrame(3300).overlay).toBe(0);
  });

  test('3.3–4.7 s: the balcony settles from 1.08, each layer by its speed', () => {
    expect(layerZoom(1, introFrame(3300).settle)).toBeCloseTo(1.08, 9);
    expect(layerZoom(0.7, introFrame(3300).settle)).toBeCloseTo(1 + 0.08 * 0.7, 9);
    expect(layerZoom(0.45, introFrame(3300).settle)).toBeCloseTo(1 + 0.08 * 0.45, 9);
    expect(layerZoom(1, introFrame(4700).settle)).toBe(1);
  });

  test('3.8 s: headline and lead fade in over 480ms', () => {
    expect(introFrame(3800).headline).toBe(0);
    expect(introFrame(4280).headline).toBe(1);
  });

  test('at the end the frame is the ready first screen', () => {
    const end = introFrame(intro.end);
    for (const k of ['overlay', 'aerial', 'credit', 'headline', 'settle'] as const) expect(end[k]).toBeCloseTo(readyFrame[k], 9);
  });

  test('a skip reaches the ready first screen in 240ms', () => {
    expect(intro.skip).toBe(240);
  });
});
