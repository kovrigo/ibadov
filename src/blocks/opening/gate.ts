// The opening's decision before the first paint (plan decision 6). shouldPlayIntro() is the
// logic; gateScript() is the same logic as the tiny inline script in <head>, which also preloads
// the hero images when it says yes. tests/gate.test.ts runs both over every branch.
// What the head cannot know yet (hero images and video ready within 1.5 s, the page still at the
// top) the opening's motion script checks before it plays.

export const SEEN_KEY = 'ibadow:intro-seen';

export interface IntroEnv {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType: "slow-2g", "2g", "3g", "4g" or nothing. */
  effectiveType?: string;
  hash: string;
  /** Reads the seen mark from localStorage; throws when storage is unavailable. */
  readSeen: () => string | null;
}

/** True when the intro may play: motion allowed, no data saver, not 2G, first visit, no anchor. */
export function shouldPlayIntro(env: IntroEnv): boolean {
  if (env.reducedMotion || env.saveData || /2g$/.test(env.effectiveType ?? '') || env.hash) return false;
  try {
    return !env.readSeen();
  } catch {
    return false;
  }
}

/** An AVIF hero image to preload when the intro may play: [media, srcset, sizes]. */
export type Preload = readonly [media: string, srcset: string, sizes: string];

/**
 * The inline <head> script. Yes: class "intro-wait" on <html> (hero waits under ink, CSS reveals
 * it at 2.5 s if no script takes over) and the preloads. No, with motion allowed: class
 * "intro-fade" (the headline fades in over 480ms). Reduced motion: nothing.
 */
export function gateScript(preloads: readonly Preload[]): string {
  return (
    "(function(w,d){var h=d.documentElement,c=w.navigator.connection||{}," +
    "m=!w.matchMedia||w.matchMedia('(prefers-reduced-motion: reduce)').matches,p=!1;" +
    `try{p=!m&&!c.saveData&&!/2g$/.test(c.effectiveType||'')&&!w.location.hash&&!w.localStorage.getItem('${SEEN_KEY}')}catch(e){}` +
    `if(p){h.classList.add('intro-wait');${JSON.stringify(preloads)}.forEach(function(a){` +
    "var l=d.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';l.media=a[0];" +
    "l.setAttribute('imagesrcset',a[1]);l.setAttribute('imagesizes',a[2]);l.setAttribute('fetchpriority','high');" +
    "d.head.appendChild(l)})}else if(!m)h.classList.add('intro-fade')})(window,document)"
  );
}
