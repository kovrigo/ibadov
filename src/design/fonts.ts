// Fonts: Oranienbaum 400 and Jost 400/500, cyrillic + latin woff2 only, served by the site.
// Only Oranienbaum cyrillic is preloaded (the first screen needs it).
import oranienbaumCyrillic from '@fontsource/oranienbaum/files/oranienbaum-cyrillic-400-normal.woff2?url';
import oranienbaumLatin from '@fontsource/oranienbaum/files/oranienbaum-latin-400-normal.woff2?url';
import jostCyrillic400 from '@fontsource/jost/files/jost-cyrillic-400-normal.woff2?url';
import jostLatin400 from '@fontsource/jost/files/jost-latin-400-normal.woff2?url';
import jostCyrillic500 from '@fontsource/jost/files/jost-cyrillic-500-normal.woff2?url';
import jostLatin500 from '@fontsource/jost/files/jost-latin-500-normal.woff2?url';

// Unicode ranges as published by @fontsource for these subsets.
const cyrillic = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const latin =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const face = (family: string, weight: number, url: string, range: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format('woff2');unicode-range:${range}}`;

// Metric-adjusted fallbacks, so headings do not jump when the web font swaps in.
// Computed with fontkit from the woff2 files above against Liberation Serif / Liberation Sans
// (metric twins of Times New Roman / Arial): size-adjust = average advance of the page's own
// strings in the web font ÷ the same in the fallback; overrides = web ascent/descent ÷ size-adjust.
// Oranienbaum: UPM 1000, ascent 895, descent 260. Jost: UPM 1000, ascent 1070, descent 375.
const fallbacks = [
  "@font-face{font-family:'Oranienbaum Fallback';src:local('Times New Roman'),local('TimesNewRomanPSMT'),local('Liberation Serif');size-adjust:93.82%;ascent-override:95.39%;descent-override:27.71%;line-gap-override:0%}",
  "@font-face{font-family:'Jost Fallback';src:local('Arial'),local('ArialMT'),local('Liberation Sans');size-adjust:95.17%;ascent-override:112.44%;descent-override:39.41%;line-gap-override:0%}",
];

export const fontFaceCss = [
  face('Oranienbaum', 400, oranienbaumCyrillic, cyrillic),
  face('Oranienbaum', 400, oranienbaumLatin, latin),
  face('Jost', 400, jostCyrillic400, cyrillic),
  face('Jost', 400, jostLatin400, latin),
  face('Jost', 500, jostCyrillic500, cyrillic),
  face('Jost', 500, jostLatin500, latin),
  ...fallbacks,
].join('\n');

export const fontPreloads = [oranienbaumCyrillic];
