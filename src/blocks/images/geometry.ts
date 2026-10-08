// Cover geometry: where a source pixel lands on screen for each way the page crops an image.
// Pure functions (numbers for tests and scripts) plus the same formulas as CSS expressions,
// so markup, motion and checks share one source. CSS lengths use container units:
// cqw is the container width, cqh falls back to the small viewport height.

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** object-fit: cover with object-position anchor (fractions 0..1). */
export function cover(image: Size, box: Size, anchor: Point): Fit {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { scale, width, height, offsetX: anchor.x * (box.width - width), offsetY: anchor.y * (box.height - height) };
}

/** Cover, centred horizontally on a source x where the image allows it. */
export function coverFocus(image: Size, box: Size, focusX: number, anchorY: number): Fit {
  const fit = cover(image, box, { x: 0, y: anchorY });
  return { ...fit, offsetX: clamp(box.width / 2 - focusX * fit.scale, box.width - fit.width, 0) };
}

/**
 * Cover centred on a source x, zoomed in just enough that the visible width never
 * reaches past `keepOutX` (source x). Used where a face must stay out of frame.
 */
export function coverExclude(image: Size, box: Size, centreX: number, keepOutX: number, anchorY: number): Fit {
  const half = Math.min(centreX, keepOutX - centreX);
  const scale = Math.max(box.width / (2 * half), box.height / image.height, box.width / image.width);
  const width = image.width * scale;
  const height = image.height * scale;
  return { scale, width, height, offsetX: box.width / 2 - centreX * scale, offsetY: anchorY * (box.height - height) };
}

/** Full height, pinned to the right edge (wide-scheme portraits). */
export function fitHeightRight(image: Size, box: Size): Fit {
  const scale = box.height / image.height;
  const width = image.width * scale;
  return { scale, width, height: box.height, offsetX: box.width - width, offsetY: 0 };
}

/** Full width, pinned to the top (vertical-scheme phone windows). */
export function fitWidthTop(image: Size, box: Size): Fit {
  const scale = box.width / image.width;
  return { scale, width: box.width, height: image.height * scale, offsetX: 0, offsetY: 0 };
}

export function mapPoint(fit: Fit, p: Point): Point {
  return { x: fit.offsetX + p.x * fit.scale, y: fit.offsetY + p.y * fit.scale };
}

export function mapBox(fit: Fit, b: Box): Box {
  const a = mapPoint(fit, { x: b.x0, y: b.y0 });
  const z = mapPoint(fit, { x: b.x1, y: b.y1 });
  return { x0: a.x, y0: a.y, x1: z.x, y1: z.y };
}

// ---- The same formulas as CSS ----

const n = (v: number) => Number(v.toFixed(5)).toString();

/** Rendered width of a cover fit in CSS. */
export function coverWidthCss(image: Size): string {
  return `max(100cqw, ${n((100 * image.width) / image.height)}cqh)`;
}

/** Screen x of source x `x` under cover with horizontal anchor `ax`. */
export function coverXCss(image: Size, x: number, ax: number): string {
  return `calc(${n(ax * 100)}cqw + ${n(x / image.width - ax)} * ${coverWidthCss(image)})`;
}

/** Screen x of source x `x` under fitHeightRight. */
export function rightXCss(image: Size, x: number): string {
  return `calc(100cqw - ${n((1 - x / image.width) * (100 * image.width) / image.height)}cqh)`;
}

/** object-position x (a length) that centres source x `focusX` under cover, clamped to the image edges. */
export function focusPositionCss(image: Size, focusX: number): string {
  const w = coverWidthCss(image);
  return `clamp(100cqw - ${w}, 50cqw - ${n(focusX / image.width)} * ${w}, 0px)`;
}

/** Rendered width for coverExclude in CSS. */
export function excludeWidthCss(image: Size, centreX: number, keepOutX: number): string {
  const half = Math.min(centreX, keepOutX - centreX);
  return `max(${n((100 * image.width) / (2 * half))}cqw, ${n((100 * image.width) / image.height)}cqh)`;
}
