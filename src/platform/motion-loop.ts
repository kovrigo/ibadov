// The one frame loop every motion block shares: one requestAnimationFrame, one passive scroll
// listener, IntersectionObserver for what is on screen, the DESIGN.md easings, and a clock that
// stands still while the tab is hidden (so time-based motion pauses and resumes in place).
// It names no block and no scene. Importing it has no side effects: listeners start on first use.
//
// Motion writes only transform, opacity, will-change and visibility. setStyle() is the only
// writer here and accepts nothing else (tests/motion-properties.test.ts checks every motion file).
import { motion } from '../design/tokens';

export type Easing = (t: number) => number;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = x(t) - p;
      if (Math.abs(err) < 1e-7) return y(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      if (x(t) < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
}

function fromCss(css: string): Easing {
  const [a, b, c, d] = (css.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return cubicBezier(a!, b!, c!, d!);
}

/** DESIGN.md Motion: camera, enter (appearing), exit (leaving). */
export const ease = {
  camera: fromCss(motion.easing.camera),
  enter: fromCss(motion.easing.enter),
  exit: fromCss(motion.easing.exit),
  linear: clamp01,
} satisfies Record<string, Easing>;

// ---- Clock: milliseconds that do not pass while the tab is hidden ----

const browser = typeof document !== 'undefined';
let hiddenAt: number | undefined;
let hiddenTotal = 0;

export function now(): number {
  return (hiddenAt ?? performance.now()) - hiddenTotal;
}

// ---- Frame loop ----

/** A per-frame task. Return false to stop it. */
export type Task = (time: number) => boolean | void;

const tasks = new Set<Task>();
const scrollSubs = new Set<() => void>();
const layoutSubs = new Set<() => void>();
let raf = 0;
let scrollDirty = false;
let layoutDirty = false;
let listening = false;

function frame() {
  raf = 0;
  if (layoutDirty) {
    layoutDirty = false;
    scrollDirty = true;
    for (const cb of layoutSubs) cb();
  }
  if (scrollDirty) {
    scrollDirty = false;
    for (const cb of scrollSubs) cb();
  }
  const t = now();
  for (const task of tasks) if (task(t) === false) tasks.delete(task);
  request();
}

function request() {
  if (!browser || raf || hiddenAt !== undefined) return;
  if (tasks.size || scrollDirty || layoutDirty) raf = requestAnimationFrame(frame);
}

function markScroll() {
  scrollDirty = true;
  request();
}

function markLayout() {
  layoutDirty = true;
  request();
}

function listen() {
  if (listening || !browser) return;
  listening = true;
  if (document.hidden) hiddenAt = performance.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt ??= performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      if (hiddenAt !== undefined) hiddenTotal += performance.now() - hiddenAt;
      hiddenAt = undefined;
      request();
    }
  });
  addEventListener('scroll', markScroll, { passive: true });
  addEventListener('resize', markLayout);
  addEventListener('load', markLayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(markLayout).observe(document.body);
  document.fonts?.ready.then(markLayout);
}

/** Runs `task` on every frame until it returns false or the returned function is called. */
export function onFrame(task: Task): () => void {
  listen();
  tasks.add(task);
  request();
  return () => {
    tasks.delete(task);
  };
}

/** Calls `cb` once per frame after the page scrolled (and once right away). Read scrollY there. */
export function onScroll(cb: () => void): () => void {
  listen();
  scrollSubs.add(cb);
  markScroll();
  return () => {
    scrollSubs.delete(cb);
  };
}

/** Calls `cb` before the scroll callbacks whenever sizes may have changed (and once right away). */
export function onLayout(cb: () => void): () => void {
  listen();
  layoutSubs.add(cb);
  markLayout();
  return () => {
    layoutSubs.delete(cb);
  };
}

export interface TweenOptions {
  duration: number;
  delay?: number;
  easing?: Easing;
  /** Eased progress 0..1. Not called before the delay has passed. */
  update: (v: number) => void;
  done?: () => void;
}

/** A timed change on the loop's clock. Returns a function that cancels it. */
export function tween({ duration, delay = 0, easing = ease.enter, update, done }: TweenOptions): () => void {
  const start = now() + delay;
  return onFrame((t) => {
    if (t < start) return;
    const k = duration > 0 ? clamp01((t - start) / duration) : 1;
    update(easing(k));
    if (k < 1) return;
    done?.();
    return false;
  });
}

// ---- What is on screen ----

const observers = new Map<string, { io: IntersectionObserver; cbs: Map<Element, Set<(e: IntersectionObserverEntry) => void>> }>();

/** Calls `cb` with each IntersectionObserver entry for `el`. One observer per margin and threshold. */
export function observe(
  el: Element,
  cb: (entry: IntersectionObserverEntry) => void,
  rootMargin = '0px',
  threshold = 0,
): () => void {
  const key = `${rootMargin}|${threshold}`;
  let o = observers.get(key);
  if (!o) {
    const cbs = new Map<Element, Set<(e: IntersectionObserverEntry) => void>>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) for (const f of cbs.get(e.target) ?? []) f(e);
      },
      { rootMargin, threshold },
    );
    o = { io, cbs };
    observers.set(key, o);
  }
  const set = o.cbs.get(el) ?? new Set();
  if (!set.size) o.io.observe(el);
  set.add(cb);
  o.cbs.set(el, set);
  const { io, cbs } = o;
  return () => {
    set.delete(cb);
    if (!set.size) {
      cbs.delete(el);
      io.unobserve(el);
    }
  };
}

/** Top and height of an element in page coordinates (its layout box, transforms included). */
export function pageBox(el: Element): { top: number; height: number } {
  const r = el.getBoundingClientRect();
  return { top: r.top + scrollY, height: r.height };
}

// ---- The only style writes motion makes ----

export type MotionProp = 'transform' | 'opacity' | 'willChange' | 'visibility';
const MOTION_PROPS: readonly MotionProp[] = ['transform', 'opacity', 'willChange', 'visibility'];
const written = new WeakMap<Element, Partial<Record<MotionProp, string>>>();

/** Writes one motion property, skipping a value the element already has from us. */
export function setStyle(el: HTMLElement | SVGElement, prop: MotionProp, value: string): void {
  let w = written.get(el);
  if (!w) written.set(el, (w = {}));
  if (w[prop] === value) return;
  w[prop] = value;
  el.style[prop] = value;
}

/** Removes every motion property we wrote: the element is back to its CSS (the final state). */
export function clearStyle(el: HTMLElement | SVGElement): void {
  for (const prop of MOTION_PROPS) setStyle(el, prop, '');
}
