import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Motion writes only transform, opacity, will-change and visibility (DESIGN.md Motion, plan
// decision 18): no animated filter, clip-path, stroke-dashoffset, blur, width, height, top, left.
// Scans every block's motion.ts and the platform loop for style writes of any other property.
const root = path.resolve(import.meta.dir, '..');
const blocks = path.join(root, 'src', 'blocks');
const loop = path.join(root, 'src', 'platform', 'motion-loop.ts');
const files = [
  ...readdirSync(blocks)
    .map((b) => path.join(blocks, b, 'motion.ts'))
    .filter((f) => existsSync(f)),
  loop,
];
const rel = (f: string) => path.relative(root, f);

const ALLOWED_JS = new Set(['transform', 'opacity', 'willChange', 'visibility']);
const ALLOWED_CSS = new Set(['transform', 'opacity', 'will-change', 'visibility']);

/** Source without comments, so prose never counts as code. */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('motion writes only transform, opacity, will-change, visibility', () => {
  test('the scan sees every motion file', () => {
    expect(files.map(rel).sort()).toEqual(
      ['src/blocks/accents/motion.ts', 'src/blocks/camera/motion.ts', 'src/blocks/opening/motion.ts', 'src/platform/motion-loop.ts'].sort(),
    );
  });

  for (const file of files) {
    test(rel(file), () => {
      const src = code(file);
      const bad: string[] = [];

      // el.style.prop = …
      for (const m of src.matchAll(/\.style\.([A-Za-z]+)\s*=(?!=)/g)) if (!ALLOWED_JS.has(m[1]!)) bad.push(`style.${m[1]}`);
      // el.style.setProperty('prop', …) / removeProperty('prop')
      for (const m of src.matchAll(/\.(setProperty|removeProperty)\(\s*([^,)]+)/g)) {
        const lit = m[2]!.trim().match(/^['"`]([^'"`]+)['"`]$/)?.[1];
        if (!lit || !ALLOWED_CSS.has(lit)) bad.push(`${m[1]}(${m[2]})`);
      }
      // Whole-style writes and other ways to set arbitrary properties.
      for (const re of [/\.style\s*=(?!=)/, /cssText/, /setAttribute\(\s*['"`]style/, /Object\.assign\([^)]*\.style/, /\.animate\(/, /insertRule/, /\.style\.cssFloat/]) {
        if (re.test(src)) bad.push(String(re));
      }
      // Computed writes el.style[x] = …: only the platform's setStyle, typed to the four properties.
      if (/\.style\[[^\]]+\]\s*=(?!=)/.test(src)) {
        const union = src.match(/export type MotionProp\s*=\s*([^;]+);/)?.[1];
        const props = union ? [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]!) : [];
        if (file !== loop || props.length !== 4 || !props.every((p) => ALLOWED_JS.has(p))) bad.push('style[…] outside setStyle');
      }
      // Calls through the platform writer (and the local set() wrappers) name the property.
      for (const m of src.matchAll(/\b(?:setStyle|set)\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g)) if (!ALLOWED_JS.has(m[1]!)) bad.push(`set(…, '${m[1]}')`);

      expect(bad).toEqual([]);
    });
  }

  test('the checks catch a forbidden write', () => {
    const sample = "el.style.filter = 'blur(2px)'; el.style.setProperty('clip-path', 'x'); set(el, 'top', '0');";
    const hits = [
      ...[...sample.matchAll(/\.style\.([A-Za-z]+)\s*=(?!=)/g)].filter((m) => !ALLOWED_JS.has(m[1]!)),
      ...[...sample.matchAll(/\.(setProperty|removeProperty)\(\s*['"`]([^'"`]+)/g)].filter((m) => !ALLOWED_CSS.has(m[2]!)),
      ...[...sample.matchAll(/\b(?:setStyle|set)\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g)].filter((m) => !ALLOWED_JS.has(m[1]!)),
    ];
    expect(hits).toHaveLength(3);
  });
});
