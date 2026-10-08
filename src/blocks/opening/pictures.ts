// Build time only: the intro's images and their sizes. The aerial frame uses the final scene's
// geometry, files and sizes (Brief: the wide intro is framed as the final), so the browser
// fetches each file once. The hero layers' sizes are the first screen's, for the preloads.
import { images, catalog, crops } from '../images';

const ratioVh = (w: number, h: number) => `${((100 * w) / h).toFixed(2)}vh`;

export async function aerialPictures() {
  const [wide, tall] = await Promise.all([images.picture('aerial'), images.picture('aerial-vertical')]);
  const frame = catalog.aerial;
  const v = catalog['aerial-vertical'];
  const cv = crops.finalVertical;
  const minVw = (100 * v.width) / (2 * Math.min(cv.centreX, cv.keepOutX - cv.centreX));
  return {
    wide,
    tall,
    wideSizes: `(min-aspect-ratio: ${frame.width}/${frame.height}) 100vw, ${ratioVh(frame.width, frame.height)}`,
    tallSizes: `(min-aspect-ratio: ${Math.round((10000 * (100 * v.width)) / v.height / minVw)}/10000) ${minVw.toFixed(2)}vw, ${ratioVh(v.width, v.height)}`,
  };
}

export async function heroPictures() {
  const names = ['balcony-far', 'balcony-band', 'balcony-near', 'balcony-phone-back', 'balcony-phone-near'] as const;
  const [far, band, near, back, front] = await Promise.all(names.map((n) => images.picture(n)));
  const f = catalog['balcony-far'];
  const wideSizes = `(min-aspect-ratio: ${f.width}/${f.height}) 100vw, ${ratioVh(f.width, f.height)}`;
  return { wide: [far!, band!, near!], vertical: [back!, front!], wideSizes, verticalSizes: '100vw' };
}
