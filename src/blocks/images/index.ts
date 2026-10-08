// Images (level 0): files for each screen size, screen-reader descriptions, marks.
// Server-only: picture(), preview(), texture() and card() run at build time through astro:assets
// and sharp. Browser scripts read geometry from catalog.ts / geometry.ts data the markup writes,
// never from this module.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import path from 'node:path';
import sharp from 'sharp';
import { texts } from '../texts';
import { catalog, layers as layerTable, textures, type ImageName, type LayeredName, type Marks, type TextureName } from './catalog';

export { catalog, crops, screens, textToFace, type ImageName, type Marks } from './catalog';
export * as geometry from './geometry';

const files = import.meta.glob<ImageMetadata>('./assets/*.{webp,png}', { eager: true, import: 'default' });
const assetsDir = path.resolve(process.cwd(), 'src/blocks/images/assets');

function master(file: string): ImageMetadata {
  const meta = files[`./assets/${file}`];
  if (!meta) throw new Error(`images: master ${file} is missing from src/blocks/images/assets`);
  return meta;
}

export interface Picture {
  name: ImageName;
  width: number;
  height: number;
  avif: string;
  webp: string;
  /** WebP fallback for <img src>. */
  src: string;
  alt: string;
}

async function picture(name: ImageName): Promise<Picture> {
  const entry = catalog[name];
  const src = master(entry.file);
  const widths = [...entry.widths];
  const [avif, webp] = await Promise.all([
    getImage({ src, widths, format: 'avif', quality: entry.quality.avif }),
    getImage({ src, widths, format: 'webp', quality: entry.quality.webp }),
  ]);
  const scene = 'scene' in entry ? entry.scene : undefined;
  return {
    name,
    width: entry.width,
    height: entry.height,
    avif: avif.srcSet.attribute,
    webp: webp.srcSet.attribute,
    src: webp.src,
    alt: scene ? texts.description(scene) : '',
  };
}

/** Layers far to near. Only the nearest carries the scene description; the rest are decorative. */
function layers(name: LayeredName): { name: ImageName; alt: string }[] {
  const names = layerTable[name];
  return names.map((n, i) => ({ name: n, alt: i === names.length - 1 ? texts.description('hero') : '' }));
}

function marks(name: ImageName): Marks {
  return catalog[name].marks;
}

/**
 * A tiny, already-soft preview of a layered frame as a data URI (well under 2 KB): 27px tall,
 * the frame's own aspect, softened before encoding. JPEG without chroma subsampling keeps the grade.
 */
async function preview(name: LayeredName): Promise<string> {
  const names = layerTable[name];
  const [first, ...rest] = names.map((n) => path.join(assetsDir, catalog[n].file));
  const { width, height } = catalog[names[0]];
  const flat = await sharp(first)
    .composite(rest.map((input) => ({ input })))
    .removeAlpha()
    .png()
    .toBuffer();
  const h = 27;
  const data = await sharp(flat)
    .resize(Math.round((h * width) / height), h, { fit: 'cover' })
    .blur(0.6)
    .jpeg({ quality: 60, chromaSubsampling: '4:4:4' })
    .toBuffer();
  if (data.length > 1500) throw new Error(`images: preview of ${name} is ${data.length} bytes, over budget`);
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}

/** Texture URL: the master file itself, unchanged. */
function texture(name: TextureName): string {
  return master(textures[name].file).src;
}

/** Link-card image: JPEG for every messenger. */
async function card(): Promise<{ src: string; width: number; height: number; alt: string }> {
  const entry = catalog.card;
  const img = await getImage({ src: master(entry.file), width: entry.width, format: 'jpg', quality: 82 });
  return { src: img.src, width: entry.width, height: entry.height, alt: texts.description('card') };
}

export const images = { picture, layers, marks, preview, texture, card };
