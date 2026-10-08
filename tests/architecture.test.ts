import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Architecture rules (docs/product/system-architecture.md, plan decision 10):
// design/ and platform/ never import blocks; a block reaches another block only through its
// index.ts and only at the same or a lower level; block imports never go round in a circle.
const levels: Record<string, number> = {
  texts: 0,
  images: 0,
  story: 1,
  contact: 1,
  card: 1,
  camera: 2,
  accents: 2,
  opening: 3,
};

const root = path.resolve(import.meta.dir, '..');
const src = path.join(root, 'src');
const blocksDir = path.join(src, 'blocks');
const codeFile = /\.(ts|mts|js|mjs|astro)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'assets' && dir.endsWith(path.join('blocks', 'images'))) return [];
    return statSync(full).isDirectory() ? walk(full) : codeFile.test(name) ? [full] : [];
  });
}

function specifiers(code: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.add(m[1]!);
  return [...found];
}

function blockOf(file: string): string | undefined {
  const rel = path.relative(blocksDir, file);
  return rel.startsWith('..') ? undefined : rel.split(path.sep)[0];
}

interface Edge {
  file: string;
  spec: string;
  target: string;
}

const files = walk(src);
const edges: Edge[] = files.flatMap((file) =>
  specifiers(readFileSync(file, 'utf8'))
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => ({ file, spec, target: path.resolve(path.dirname(file), spec) })),
);
const rel = (f: string) => path.relative(root, f);

describe('architecture', () => {
  test('the scan sees the code', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(edges.length).toBeGreaterThan(10);
  });

  test('every block folder has a known level', () => {
    for (const name of readdirSync(blocksDir)) expect({ name, known: name in levels }).toEqual({ name, known: true });
  });

  test('design/ and platform/ never import blocks', () => {
    const bad = edges
      .filter((e) => /^src[\\/](design|platform)[\\/]/.test(rel(e.file)) && blockOf(e.target))
      .map((e) => `${rel(e.file)} → ${e.spec}`);
    expect(bad).toEqual([]);
  });

  test('a block imports another block only through its index.ts', () => {
    const bad = edges
      .filter((e) => {
        const from = blockOf(e.file);
        const to = blockOf(e.target);
        if (!from || !to || from === to) return false;
        const inside = path.relative(path.join(blocksDir, to), e.target).replace(/\.ts$/, '');
        return !(inside === '' || inside === 'index');
      })
      .map((e) => `${rel(e.file)} → ${e.spec}`);
    expect(bad).toEqual([]);
  });

  test('a block imports only blocks of the same or a lower level', () => {
    const bad = edges
      .filter((e) => {
        const from = blockOf(e.file);
        const to = blockOf(e.target);
        return from && to && from !== to && levels[to]! > levels[from]!;
      })
      .map((e) => `${rel(e.file)} (${blockOf(e.file)}) → ${e.spec} (${blockOf(e.target)})`);
    expect(bad).toEqual([]);
  });

  test('block imports never go round in a circle', () => {
    const graph = new Map<string, Set<string>>();
    for (const e of edges) {
      const from = blockOf(e.file);
      const to = blockOf(e.target);
      if (from && to && from !== to) graph.set(from, (graph.get(from) ?? new Set()).add(to));
    }
    const cycles: string[] = [];
    const visit = (node: string, trail: string[]) => {
      if (trail.includes(node)) {
        cycles.push([...trail.slice(trail.indexOf(node)), node].join(' → '));
        return;
      }
      for (const next of graph.get(node) ?? []) visit(next, [...trail, node]);
    };
    for (const node of graph.keys()) visit(node, []);
    expect(cycles).toEqual([]);
  });
});
