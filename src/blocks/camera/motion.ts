// Camera (level 2): moves the story's scenes while the page scrolls. The hero's layers by speed,
// slow push-ins, the text-scene plates, cuts through ink, text entry, the freeze frame and the
// numbers. It finds everything through story.scenes() and sets its own start states; without it
// every scene is in its final state. Reduced motion: it does nothing, and when the setting turns
// on while the page is open it stops at once and leaves every scene in its final state.
import { story, type Scene, type SceneName } from '../story';
import { onMotionSettingChange, prefersReducedMotion } from '../../platform/motion-setting';
import {
  clearStyle,
  ease,
  observe,
  onLayout,
  onScroll,
  pageBox,
  setStyle,
  tween,
  type MotionProp,
  type TweenOptions,
} from '../../platform/motion-loop';
import * as m from './math';

type El = HTMLElement;

interface View {
  scene: Scene;
  section: El;
  media: El;
  top: number;
  height: number;
}

interface HeroStack {
  el: El;
  layers: { img: El; speed: number }[];
  anchor: [number, number];
  shown: boolean;
  w: number;
  h: number;
}

/** Text that waits off screen in its start state and plays once when it comes into view. */
interface Cue {
  /** Element whose position decides the cue (page coordinates, measured on layout). */
  el: El;
  top: number;
  bottom: number;
  /** Fires when this returns true for the current scroll position. */
  due: (top: number, bottom: number, vh: number) => boolean;
  hide: () => void;
  play: () => void;
  state: 'idle' | 'waiting' | 'done';
}

const lift = m.lift;

/** A scene within a quarter screen of the screen: the camera keeps moving it. */
const nearScreen = (top: number, height: number, vh: number) => top + height >= -0.25 * vh && top <= 1.25 * vh;

function parseAnchor(css: string): [number, number] {
  const [x, y] = css.split(/\s+/).map((v) => (v.endsWith('%') ? Number.parseFloat(v) / 100 : 0.5));
  return [Number.isFinite(x) ? x! : 0.5, Number.isFinite(y) ? y! : 0.5];
}

export function startCamera(): void {
  if (prefersReducedMotion()) return;

  const touched = new Set<El>();
  const cancels = new Set<() => void>();
  const unsubscribe: (() => void)[] = [];
  let stopped = false;

  const set = (el: El | null | undefined, prop: MotionProp, value: string) => {
    if (!el || stopped) return;
    touched.add(el);
    setStyle(el, prop, value);
  };
  const run = (o: TweenOptions) => {
    const cancel = tween({
      ...o,
      done: () => {
        cancels.delete(cancel);
        o.done?.();
      },
    });
    cancels.add(cancel);
  };
  const reset = (...els: (El | null | undefined)[]) => {
    for (const el of els) if (el) clearStyle(el);
  };

  // ---- Scenes ----

  const views = new Map<SceneName, View>();
  for (const scene of story.scenes()) {
    const section = document.querySelector<El>(scene.section);
    const media = document.querySelector<El>(scene.media);
    if (section && media) views.set(scene.name, { scene, section, media, top: 0, height: 0 });
  }
  const q = (sel: string | undefined) => (sel ? document.querySelector<El>(sel) : null);
  const view = (name: SceneName) => views.get(name);

  const heroStacks: HeroStack[] = [];
  const hero = view('hero');
  if (hero) {
    const s = hero.scene;
    const stack = (name: string, layers: string[]) => {
      const el = q(s.stacks[name]);
      if (!el) return;
      const list = layers
        .map((l) => ({ img: q(s.layers[l])!, speed: m.speeds[l as keyof typeof m.speeds] }))
        .filter((l) => l.img && l.speed < 1);
      heroStacks.push({ el, layers: list, anchor: [0.5, 0.1], shown: false, w: 0, h: 0 });
    };
    stack('wide', ['far', 'band', 'near']);
    stack('vertical', ['phone-back', 'phone-near']);
  }

  const plates = (['services', 'numbers'] as const).flatMap((n) => {
    const v = view(n);
    const img = v && q(v.scene.layers.plate);
    return v && img ? [{ v, img }] : [];
  });
  const pushes = (['partners', 'final'] as const).flatMap((n) => {
    const v = view(n);
    const el = v && q(v.scene.stacks.main);
    return v && el ? [{ v, el }] : [];
  });

  // ---- Start states and one-off plays ----

  const cues: Cue[] = [];
  const textCue = (text: El | null | undefined, play: () => void, hide: () => void) => {
    if (!text) return;
    cues.push({
      el: text,
      top: 0,
      bottom: 0,
      // Text plays when its top passes 85% of the screen.
      due: (top, bottom, vh) => top < vh * 0.85 && bottom > 0,
      hide,
      play,
      state: 'idle',
    });
  };
  const shareCue = (v: View | undefined, share: number, play: () => void, hide: () => void) => {
    if (!v) return;
    cues.push({
      el: v.section,
      top: 0,
      bottom: 0,
      due: (top, bottom, vh) => m.visibleShare(top, bottom - top, vh) >= share,
      hide,
      play,
      state: 'idle',
    });
  };

  const hideText = (el: El | null) => {
    set(el, 'opacity', '0');
    set(el, 'transform', lift(m.textEntry.rise));
  };
  const showText = (el: El | null, delay = 0) => {
    if (!el) return;
    set(el, 'willChange', 'transform, opacity');
    run({
      duration: m.textEntry.duration,
      delay,
      easing: ease.enter,
      update: (k) => {
        set(el, 'opacity', m.num(k));
        set(el, 'transform', lift((1 - k) * m.textEntry.rise));
      },
      done: () => reset(el),
    });
  };
  const fade = (el: El | null | undefined, [start, end]: m.Span, easing = ease.enter) => {
    if (!el) return;
    set(el, 'willChange', 'opacity');
    run({ duration: end - start, delay: start, easing, update: (k) => set(el, 'opacity', m.num(k)), done: () => reset(el) });
  };
  const draw = (el: El | null | undefined, [start, end]: m.Span, easing = ease.camera) => {
    if (!el) return;
    const w = el.offsetWidth;
    set(el, 'willChange', 'transform');
    run({ duration: end - start, delay: start, easing, update: (k) => set(el, 'transform', m.scaleFromLeft(k, w)), done: () => reset(el) });
  };
  const undrawn = (el: El | null | undefined) => {
    if (el) set(el, 'transform', m.scaleFromLeft(0, el.offsetWidth));
  };
  const shown = (el: El | null | undefined): el is El => !!el && el.getClientRects().length > 0;

  // Services and final: the text group lifts and fades in.
  for (const name of ['services', 'final'] as const) {
    const v = view(name);
    const text = v && q(v.scene.text);
    textCue(text, () => showText(text!), () => hideText(text!));
  }

  // Partners: the text group, then the names 240ms apart and the line between them.
  {
    const v = view('partners');
    const text = v && q(v.scene.text);
    const rule = text?.querySelector<El>('[data-line="rule"]');
    const names = [rule?.previousElementSibling as El | null, rule?.nextElementSibling as El | null];
    const s = m.partnersSchedule();
    textCue(
      text,
      () => {
        showText(text!);
        names.forEach((n, i) => fade(n, s.names[i]!));
        draw(rule, s.rule, ease.enter);
      },
      () => {
        hideText(text!);
        for (const n of names) set(n, 'opacity', '0');
        undrawn(rule);
      },
    );
  }

  // Freeze frame at 60% on screen. Before it, the portrait pushes in slowly with the scroll.
  const freeze = view('freeze');
  const freezeStack = freeze && q(freeze.scene.stacks.main);
  let freezeScale = 1;
  let frozen = false;
  if (freeze && freezeStack) {
    const s = m.freezeSchedule();
    const muted = q(freeze.scene.layers['close-muted']);
    const flash = q(`${freeze.scene.accent} [data-flash]`);
    const text = q(freeze.scene.text);
    const lines = () => [text?.querySelector<El>('[data-line="reach"]'), text?.querySelector<El>('[data-line="name"]')].filter(shown);
    shareCue(
      freeze,
      0.6,
      () => {
        frozen = true;
        const from = freezeScale;
        set(freezeStack, 'willChange', 'transform');
        run({
          duration: s.push[1] - s.push[0],
          easing: ease.camera,
          update: (k) => set(freezeStack, 'transform', `scale(${m.num(from + (s.zoom - from) * k)})`),
        });
        if (flash) {
          set(flash, 'willChange', 'opacity');
          run({
            duration: s.flashUp[1] - s.flashUp[0],
            easing: ease.enter,
            update: (k) => set(flash, 'opacity', m.num(s.flashPeak * k)),
            done: () => {
              set(muted, 'opacity', '1');
              run({
                duration: s.flashDown[1] - s.flashDown[0],
                easing: ease.camera,
                update: (k) => set(flash, 'opacity', m.num(s.flashPeak * (1 - k))),
                done: () => reset(flash),
              });
            },
          });
        } else {
          run({ duration: 0, delay: s.swap, update: () => set(muted, 'opacity', '1') });
        }
        showText(text, s.text[0]);
        for (const line of lines()) draw(line, s.line);
      },
      () => {
        set(muted, 'opacity', '0');
        hideText(text);
        for (const line of lines()) undrawn(line);
      },
    );
  }

  // Numbers at half on screen: lines draw, words fade in at the line's midpoint. No counter.
  {
    const v = view('numbers');
    const lines = v ? [...document.querySelectorAll<El>(`${v.scene.text} [data-line="fact"]`)] : [];
    const s = m.numbersSchedule();
    shareCue(
      v,
      0.5,
      () =>
        lines.forEach((line, i) => {
          const f = s.facts[i];
          if (!f) return;
          draw(line, f.line);
          fade(line.nextElementSibling as El | null, f.words);
        }),
      () =>
        lines.forEach((line) => {
          undrawn(line);
          set(line.nextElementSibling as El | null, 'opacity', '0');
        }),
    );
  }

  // ---- Layout and scroll ----

  let docHeight = 0;
  unsubscribe.push(
    onLayout(() => {
      docHeight = document.documentElement.scrollHeight;
      for (const v of views.values()) Object.assign(v, pageBox(v.section));
      for (const st of heroStacks) {
        st.shown = st.el.getClientRects().length > 0;
        st.w = st.el.offsetWidth;
        st.h = st.el.offsetHeight;
        const far = st.layers[0]?.img;
        if (far && st === heroStacks[0]) st.anchor = parseAnchor(getComputedStyle(far).objectPosition);
      }
      for (const c of cues) {
        const box = pageBox(c.el);
        c.top = box.top;
        c.bottom = box.top + box.height;
      }
    }),
  );

  unsubscribe.push(
    onScroll(() => {
      const y = scrollY;
      const vh = innerHeight;
      for (const v of views.values()) {
        const top = v.top - y;
        if (!nearScreen(top, v.height, vh)) continue;
        set(v.media, 'opacity', m.num(m.cutOpacity(top, v.height, vh)));
      }
      if (hero) {
        const p = m.heroProgress(y, hero.height);
        if (nearScreen(hero.top - y, hero.height, vh)) {
          for (const st of heroStacks) {
            if (!st.shown) continue;
            set(st.el, 'transform', m.scaleAbout(m.heroScale(p), st.anchor[0], st.anchor[1], st.w, st.h));
            for (const l of st.layers) set(l.img, 'transform', lift(m.layerOffset(l.speed, p, vh)));
          }
        }
      }
      for (const { v, img } of plates) {
        const top = v.top - y;
        if (!nearScreen(top, v.height, vh)) continue;
        set(img, 'transform', lift(m.plateOffset(m.passProgress(top, v.height, vh, docHeight - v.top), vh)));
      }
      for (const { v, el } of pushes) {
        const top = v.top - y;
        if (!nearScreen(top, v.height, vh)) continue;
        set(el, 'transform', `scale(${m.num(m.passScale(m.passProgress(top, v.height, vh, docHeight - v.top)))})`);
      }
      if (freeze && freezeStack && !frozen) {
        const top = freeze.top - y;
        freezeScale = m.passScale(m.passProgress(top, freeze.height, vh, docHeight - freeze.top));
        set(freezeStack, 'transform', `scale(${m.num(freezeScale)})`);
      }
      for (const c of cues) {
        if (c.state === 'done') continue;
        const top = c.top - y;
        const bottom = c.bottom - y;
        if (c.state === 'idle') {
          // Never hide what is already on screen: it stays in its final state.
          if (top < vh && bottom > 0) {
            c.state = 'done';
            continue;
          }
          c.hide();
          c.state = 'waiting';
        }
        if (c.due(top, bottom, vh)) {
          c.state = 'done';
          c.play();
        }
      }
    }),
  );

  // will-change only while a scene is on screen (or about to be).
  const movers = (name: SceneName): El[] => {
    if (name === 'hero') return heroStacks.flatMap((st) => [st.el, ...st.layers.map((l) => l.img)]);
    const p = plates.find((x) => x.v.scene.name === name);
    if (p) return [p.img];
    const push = pushes.find((x) => x.v.scene.name === name);
    if (push) return [push.el];
    return name === 'freeze' && freezeStack ? [freezeStack] : [];
  };
  for (const v of views.values()) {
    unsubscribe.push(
      observe(
        v.section,
        (e) => {
          for (const el of movers(v.scene.name)) set(el, 'willChange', e.isIntersecting ? 'transform' : '');
        },
        '25% 0px',
      ),
    );
  }

  // Reduced motion switched on while the page is open: stop and show every final state.
  unsubscribe.push(
    onMotionSettingChange((reduced) => {
      if (!reduced || stopped) return;
      for (const cancel of cancels) cancel();
      cancels.clear();
      for (const off of unsubscribe) off();
      for (const el of touched) clearStyle(el);
      touched.clear();
      stopped = true;
    }),
  );
}
