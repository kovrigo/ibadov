import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { catalog, textures } from '../catalog';

const dir = path.join(import.meta.dir, '..', 'assets');
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as {
  checks: string;
  problems: string[];
  files: Record<string, string>;
};

test('image preparation checks passed', () => {
  expect(manifest.checks).toBe('pass');
  expect(manifest.problems).toEqual([]);
});

test('every listed file matches its sha256', () => {
  const entries = Object.entries(manifest.files);
  expect(entries.length).toBeGreaterThan(0);
  for (const [file, sha] of entries) {
    const actual = createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex');
    expect({ file, sha: actual }).toEqual({ file, sha });
  }
});

test('every master the page uses is listed', () => {
  for (const { file } of [...Object.values(catalog), ...Object.values(textures)]) {
    expect(manifest.files[file]).toBeString();
  }
});
