// Story (level 1): the chapters in order. Pure data, safe to import from browser scripts.
//
// Contract for motion blocks (camera, accents, opening):
// - story.scenes() lists the six scene sections in page order. The opening overlay is not a
//   scene: it fills the "before-hero" slot, placed in <main> right before the hero section.
// - section: the <section data-scene="…">. It never moves; move what is inside it.
// - media:   the scene's image box ([data-media], ink background, overflow hidden).
// - stacks:  image groups ([data-stack]); each shows only when all its images loaded (only
//            when scripts run; the group carries data-loading meanwhile). Hero has two:
//            "wide" (far, band, near) and "vertical" (phone-back, phone-near); CSS shows one by
//            screen shape (portrait = vertical). Other scenes have one stack, "main".
// - layers:  each <img data-layer="…">. Hero: far, band, near (wide) and phone-back,
//            phone-near (vertical). Freeze: close and close-muted (muted on top; the static
//            page shows it, the camera may start from close). Services, numbers: plate.
//            Partners, final: photo. The hero's wide layers are cropped with object-position
//            62% 10% (85% 10% when the screen is narrower than 1.55:1); scale around that.
// - text:    the text group ([data-text]) to fade and lift on entry. Lines inside it carry
//            data-line: "name" (short gold-line), "rule" (between words), "fact" (over each
//            number), "reach" (freeze, wide only, from the caption towards the face).
// - accent:  the empty accent place ([data-accent]): an overlay over the image for every
//            scene except the final, where it sits in the text column above the title.
// Without scripts every scene is in its final state; scripts set their own start states.

export type SceneName = 'hero' | 'services' | 'freeze' | 'numbers' | 'partners' | 'final';

export interface Scene {
  name: SceneName;
  section: string;
  media: string;
  stacks: Record<string, string>;
  layers: Record<string, string>;
  text: string;
  accent: string;
}

const order: SceneName[] = ['hero', 'services', 'freeze', 'numbers', 'partners', 'final'];

const layerNames: Record<SceneName, string[]> = {
  hero: ['far', 'band', 'near', 'phone-back', 'phone-near'],
  services: ['plate'],
  freeze: ['close', 'close-muted'],
  numbers: ['plate'],
  partners: ['photo'],
  final: ['photo'],
};

const stackNames: Record<SceneName, string[]> = {
  hero: ['wide', 'vertical'],
  services: ['main'],
  freeze: ['main'],
  numbers: ['main'],
  partners: ['main'],
  final: ['main'],
};

function scene(name: SceneName): Scene {
  const section = `[data-scene="${name}"]`;
  return {
    name,
    section,
    media: `${section} [data-media]`,
    stacks: Object.fromEntries(stackNames[name].map((s) => [s, `${section} [data-stack="${s}"]`])),
    layers: Object.fromEntries(layerNames[name].map((l) => [l, `${section} [data-layer="${l}"]`])),
    text: `${section} [data-text]`,
    accent: `${section} [data-accent]`,
  };
}

export const story = {
  scenes: (): Scene[] => order.map(scene),
};
