// Build time only: the hero layers' files and the first screen's sizes, for the head preloads.
import { images, catalog } from '../images';

const ratioVh = (w: number, h: number) => `${((100 * w) / h).toFixed(2)}vh`;

export async function heroPictures() {
  const names = ['balcony-far', 'balcony-band', 'balcony-near', 'balcony-phone-back', 'balcony-phone-near'] as const;
  const [far, band, near, back, front] = await Promise.all(names.map((n) => images.picture(n)));
  const f = catalog['balcony-far'];
  const wideSizes = `(min-aspect-ratio: ${f.width}/${f.height}) 100vw, ${ratioVh(f.width, f.height)}`;
  return { wide: [far!, band!, near!], vertical: [back!, front!], wideSizes, verticalSizes: '100vw' };
}
