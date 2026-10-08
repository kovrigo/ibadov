// The images catalog: the one source for files, pixel sizes, marks (source pixels),
// crop anchors and output widths. Masters live in ./assets and are never edited here.
import type { DescriptionName } from '../texts';
import type { Box, Point } from './geometry';

export interface Marks {
  face?: Box;
  /** Top of the hair, source y. */
  hairTop?: number;
  dome?: Box;
  domeCentre?: Point;
  watch?: Point;
}

export interface Entry {
  file: string;
  width: number;
  height: number;
  alpha: boolean;
  /** srcset widths, never above the master width. */
  widths: readonly number[];
  /** Encoder quality for the page's AVIF and WebP files. */
  quality: { avif: number; webp: number };
  marks: Marks;
  /** Scene whose screen-reader description this image carries when it is the scene's main image. */
  scene?: DescriptionName;
}

const balconyMarks: Marks = {
  face: { x0: 880, y0: 200, x1: 1100, y1: 420 },
  hairTop: 60,
  dome: { x0: 1385, y0: 105, x1: 1555, y1: 300 },
  watch: { x: 980, y: 688 },
};

// Phone windows are fixed cuts of the balcony frame: back = source x 1026–1583, near = source x 785–1342.
const phoneBackX = 1026;
const phoneNearX = 785;
const shift = (b: Box, dx: number): Box => ({ x0: b.x0 - dx, y0: b.y0, x1: b.x1 - dx, y1: b.y1 });

const aerialMarks: Marks = {
  dome: { x0: 900, y0: 45, x1: 1075, y1: 270 },
  domeCentre: { x: 988, y: 200 },
  face: { x0: 1235, y0: 230, x1: 1440, y1: 460 },
  watch: { x: 1320, y: 690 },
};
// aerial-vertical is source x 635–1341 of the aerial frame.
const aerialVerticalX = 635;

const wide = [640, 960, 1280, 1672] as const;
const photo = { avif: 58, webp: 78 };

export const catalog = {
  'balcony-far': { file: 'balcony-far.webp', width: 1672, height: 941, alpha: false, widths: wide, quality: { avif: 60, webp: 78 }, marks: balconyMarks },
  'balcony-band': { file: 'balcony-band.webp', width: 1672, height: 941, alpha: true, widths: wide, quality: { avif: 60, webp: 78 }, marks: balconyMarks },
  'balcony-near': { file: 'balcony-near.webp', width: 1672, height: 941, alpha: true, widths: wide, quality: { avif: 60, webp: 78 }, marks: balconyMarks, scene: 'hero' },
  'balcony-phone-back': {
    file: 'balcony-phone-back.webp', width: 557, height: 941, alpha: false, widths: [360, 557], quality: { avif: 64, webp: 80 },
    marks: { dome: shift(balconyMarks.dome!, phoneBackX) },
  },
  'balcony-phone-near': {
    file: 'balcony-phone-near.webp', width: 557, height: 941, alpha: true, widths: [360, 557], quality: { avif: 64, webp: 80 },
    marks: { face: shift(balconyMarks.face!, phoneNearX), hairTop: 60, watch: { x: 195, y: 688 } }, scene: 'hero',
  },
  aerial: { file: 'aerial.webp', width: 1672, height: 941, alpha: false, widths: wide, quality: photo, marks: aerialMarks, scene: 'final' },
  'aerial-vertical': {
    file: 'aerial-vertical.webp', width: 706, height: 941, alpha: false, widths: [480, 706], quality: photo,
    marks: {
      dome: shift(aerialMarks.dome!, aerialVerticalX),
      domeCentre: { x: 353, y: 200 },
      face: shift(aerialMarks.face!, aerialVerticalX),
      watch: { x: 1320 - aerialVerticalX, y: 690 },
    },
    scene: 'final',
  },
  close: {
    file: 'close.webp', width: 1035, height: 1280, alpha: false, widths: [480, 720, 1035], quality: photo,
    marks: { face: { x0: 260, y0: 160, x1: 590, y1: 700 } },
  },
  'close-muted': {
    file: 'close-muted.webp', width: 1035, height: 1280, alpha: false, widths: [480, 720, 1035], quality: photo,
    marks: { face: { x0: 260, y0: 160, x1: 590, y1: 700 } }, scene: 'freeze',
  },
  stairs: {
    file: 'stairs.webp', width: 1033, height: 1280, alpha: false, widths: [480, 720, 1033], quality: photo,
    marks: { face: { x0: 350, y0: 330, x1: 540, y1: 540 }, watch: { x: 430, y: 935 } }, scene: 'partners',
  },
  'plate-services': { file: 'plate-services.webp', width: 522, height: 381, alpha: false, widths: [522], quality: { avif: 45, webp: 70 }, marks: {}, scene: 'services' },
  'plate-numbers': { file: 'plate-numbers.webp', width: 540, height: 421, alpha: false, widths: [540], quality: { avif: 45, webp: 70 }, marks: {}, scene: 'numbers' },
  card: { file: 'card.webp', width: 1200, height: 630, alpha: false, widths: [1200], quality: { avif: 60, webp: 80 }, marks: {}, scene: 'card' },
} as const satisfies Record<string, Entry>;

export type ImageName = keyof typeof catalog;

/** Textures used as they are (no resizing). */
export const textures = {
  grain: { file: 'grain.png', width: 256, height: 256 },
  'smoke-a': { file: 'smoke-a.webp', width: 512, height: 1024 },
  'smoke-b': { file: 'smoke-b.webp', width: 512, height: 1024 },
} as const;

export type TextureName = keyof typeof textures;

/** Layered frames, far to near. */
export const layers = {
  balcony: ['balcony-far', 'balcony-band', 'balcony-near'],
  'balcony-phone': ['balcony-phone-back', 'balcony-phone-near'],
} as const satisfies Record<string, readonly ImageName[]>;

export type LayeredName = keyof typeof layers;

/** Crop rules from the Brief «Кадрирование», per scene and scheme. */
export const crops = {
  heroWide: { anchor: { x: 0.62, y: 0.1 }, narrowAnchor: { x: 0.85, y: 0.1 }, narrowBelowAspect: 1.55 },
  heroVertical: { fit: 'width-top' },
  freezeWide: { fit: 'height-right', fadePx: 120 },
  freezeVertical: { focusX: 425, anchorY: 0.3 },
  partnersWide: { fit: 'height-right', fadePx: 120 },
  partnersVertical: { focusX: 445, anchorY: 0.3 },
  finalWide: { anchor: { x: 1, y: 0.1 } },
  // Dome centre in the middle; zoomed in just enough that the face (source x ≥ 600) stays out of frame.
  finalVertical: { centreX: 353, keepOutX: 1235 - aerialVerticalX, anchorY: 0.1 },
  plate: { anchor: { x: 0.5, y: 0.5 } },
} as const;

/** Minimum clear space between text and a face (Brief: 40px on the listed screens, 32px anywhere). */
export const textToFace = { listed: 40, anywhere: 32 } as const;

/** Screens the Brief lists in «Кадрирование» (plus 740×360 from the plan). */
export const screens = {
  wide: [
    [1024, 768], [1200, 800], [1280, 720], [1280, 800], [1280, 1024], [1366, 768],
    [1440, 900], [1920, 1080], [1920, 1200], [2560, 1440], [740, 360],
  ],
  vertical: [[360, 780], [375, 667], [390, 844], [430, 932], [768, 1024], [820, 1180]],
} as const;
