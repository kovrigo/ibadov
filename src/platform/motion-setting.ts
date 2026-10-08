// The visitor's "reduce motion" setting: one matchMedia listener for the whole page.
// Motion blocks (levels 2 and 3) read it before they start and subscribe to changes.

const QUERY = '(prefers-reduced-motion: reduce)';
const listeners = new Set<(reduced: boolean) => void>();
let media: MediaQueryList | undefined;

function query(): MediaQueryList | undefined {
  if (!media && typeof matchMedia === 'function') {
    media = matchMedia(QUERY);
    media.addEventListener('change', (e) => {
      for (const cb of listeners) cb(e.matches);
    });
  }
  return media;
}

/** True when the visitor asks for less motion. Without matchMedia there is no motion either. */
export function prefersReducedMotion(): boolean {
  return query()?.matches ?? true;
}

/** Calls `cb(reduced)` whenever the setting changes on an open page. Returns an unsubscribe function. */
export function onMotionSettingChange(cb: (reduced: boolean) => void): () => void {
  query();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
