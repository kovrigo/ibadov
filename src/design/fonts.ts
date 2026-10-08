// Fonts: Noto Serif Display (variable, weight and width axes) and Montserrat 300/400/500,
// cyrillic + latin woff2 only, served by the site. Only the serif's cyrillic file is preloaded
// (the first screen needs it).
import serifCyrillic from '@fontsource-variable/noto-serif-display/files/noto-serif-display-cyrillic-standard-normal.woff2?url';
import serifLatin from '@fontsource-variable/noto-serif-display/files/noto-serif-display-latin-standard-normal.woff2?url';
import sansCyrillic300 from '@fontsource/montserrat/files/montserrat-cyrillic-300-normal.woff2?url';
import sansLatin300 from '@fontsource/montserrat/files/montserrat-latin-300-normal.woff2?url';
import sansCyrillic400 from '@fontsource/montserrat/files/montserrat-cyrillic-400-normal.woff2?url';
import sansLatin400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url';
import sansCyrillic500 from '@fontsource/montserrat/files/montserrat-cyrillic-500-normal.woff2?url';
import sansLatin500 from '@fontsource/montserrat/files/montserrat-latin-500-normal.woff2?url';

// Unicode ranges as published by @fontsource for these subsets.
const cyrillic = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const latin =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const face = (family: string, weight: number | string, url: string, range: string, stretch = '') =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};${stretch ? `font-stretch:${stretch};` : ''}font-display:swap;src:url(${url}) format('woff2');unicode-range:${range}}`;

// Metric-adjusted fallbacks, so headings do not jump when the web font swaps in.
// Measured in Chromium against Liberation Serif / Liberation Sans (metric twins of Times New Roman /
// Arial): size-adjust = width of the page's own strings in the web font (serif at weight 300,
// width 80%; sans at 300) ÷ the same in the fallback; overrides = web ascent/descent ÷ size-adjust.
// Noto Serif Display: UPM 1000, ascent 1069, descent 293. Montserrat: UPM 1000, ascent 968, descent 251.
const fallbacks = [
  "@font-face{font-family:'Noto Serif Display Fallback';src:local('Times New Roman'),local('TimesNewRomanPSMT'),local('Liberation Serif');size-adjust:101.08%;ascent-override:105.76%;descent-override:28.99%;line-gap-override:0%}",
  "@font-face{font-family:'Montserrat Fallback';src:local('Arial'),local('ArialMT'),local('Liberation Sans');size-adjust:112.88%;ascent-override:85.75%;descent-override:22.24%;line-gap-override:0%}",
];

export const fontFaceCss = [
  face('Noto Serif Display', '100 900', serifCyrillic, cyrillic, '62.5% 100%'),
  face('Noto Serif Display', '100 900', serifLatin, latin, '62.5% 100%'),
  face('Montserrat', 300, sansCyrillic300, cyrillic),
  face('Montserrat', 300, sansLatin300, latin),
  face('Montserrat', 400, sansCyrillic400, cyrillic),
  face('Montserrat', 400, sansLatin400, latin),
  face('Montserrat', 500, sansCyrillic500, cyrillic),
  face('Montserrat', 500, sansLatin500, latin),
  ...fallbacks,
].join('\n');

export const fontPreloads = [serifCyrillic];
