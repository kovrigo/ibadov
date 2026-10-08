// The opening's decision before the first paint (plan decision 6, changed 8 October 2026: the
// intro plays on every opening of the page). shouldPlayIntro() is the logic; gateScript() is the
// same logic as the tiny inline script in <head>, which also preloads the hero images when it
// says yes. tests/gate.test.ts runs both over every branch.
// What the head cannot know yet (the video playing within 1.5 s, the page still at the top) the
// opening's motion script checks before it plays.

export interface IntroEnv {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType: "slow-2g", "2g", "3g", "4g" or nothing. */
  effectiveType?: string;
  hash: string;
  /** The navigation entry's type: "navigate", "reload", "back_forward", "prerender" or nothing. */
  navigation?: string;
}

/**
 * True when the intro may play: motion allowed, no data saver, not 2G, no anchor, and the page
 * not reached through Back or Forward (Back from Telegram returns to the ready first screen).
 * A new visit and a reload both play it: the browser keeps no mark.
 */
export function shouldPlayIntro(env: IntroEnv): boolean {
  return !(env.reducedMotion || env.saveData || /2g$/.test(env.effectiveType ?? '') || env.hash || env.navigation === 'back_forward');
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
    "m=!w.matchMedia||w.matchMedia('(prefers-reduced-motion: reduce)').matches,p=!1,n='';" +
    "try{n=w.performance.getEntriesByType('navigation')[0].type}catch(e){}" +
    "p=!m&&!c.saveData&&!/2g$/.test(c.effectiveType||'')&&!w.location.hash&&n!=='back_forward';" +
    `if(p){h.classList.add('intro-wait');${JSON.stringify(preloads)}.forEach(function(a){` +
    "var l=d.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';l.media=a[0];" +
    "l.setAttribute('imagesrcset',a[1]);l.setAttribute('imagesizes',a[2]);l.setAttribute('fetchpriority','high');" +
    "d.head.appendChild(l)})}else if(!m)h.classList.add('intro-fade')})(window,document)"
  );
}
