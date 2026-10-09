// Every value from DESIGN.md: the front matter tokens plus the numbers its rules name.
// One source: Frame turns these into CSS custom properties; scripts import them directly.

export const colors = {
  ink: '#0B0908',
  text: '#EDE5D8',
  'text-muted': '#A3988A',
  gold: '#CFA858',
  'on-gold': '#0B0908',
  'gold-bright': '#E8BD5B',
  'gold-deep': '#8B672F',
  champagne: '#F6E2B6',
  amber: '#C08354',
  smoke: '#CFC6B8',
} as const;

const serif = "'Noto Serif Display', 'Noto Serif Display Fallback', 'Times New Roman', serif";
const sans = "Montserrat, 'Montserrat Fallback', Arial, sans-serif";
/** Width of the serif (its wdth axis): the light, narrowed antiqua of the customer's frame. */
const serifStretch = '80%';

export interface TypeRole {
  fontFamily: string;
  fontWeight: number;
  fontSize: string;
  lineHeight: number;
  letterSpacing: string;
  uppercase?: boolean;
  lining?: boolean;
}

export const typography = {
  display: { fontFamily: serif, fontWeight: 300, fontSize: 'clamp(2.75rem, 0.5rem + 5.2vw, 6.75rem)', lineHeight: 0.95, letterSpacing: '-0.01em' },
  title: { fontFamily: serif, fontWeight: 300, fontSize: 'clamp(2rem, 1rem + 3.9vw, 4.5rem)', lineHeight: 1.0, letterSpacing: '0em' },
  numeral: { fontFamily: serif, fontWeight: 300, fontSize: 'clamp(4rem, 2rem + 9vw, 10rem)', lineHeight: 0.9, letterSpacing: '0em', lining: true },
  credit: { fontFamily: serif, fontWeight: 400, fontSize: 'clamp(1rem, 0.85rem + 0.6vw, 1.375rem)', lineHeight: 1.2, letterSpacing: '0.36em', uppercase: true },
  lead: { fontFamily: sans, fontWeight: 300, fontSize: 'clamp(1rem, 0.9rem + 0.3vw, 1.1875rem)', lineHeight: 1.7, letterSpacing: '0.12em' },
  body: { fontFamily: sans, fontWeight: 300, fontSize: '1.0625rem', lineHeight: 1.6, letterSpacing: '0.02em' },
  nav: { fontFamily: sans, fontWeight: 300, fontSize: 'clamp(0.875rem, 0.5rem + 0.55vw, 1.125rem)', lineHeight: 1.2, letterSpacing: '0.08em' },
  label: { fontFamily: sans, fontWeight: 400, fontSize: 'clamp(0.8125rem, 0.6rem + 0.3vw, 1rem)', lineHeight: 1.2, letterSpacing: '0.24em', uppercase: true },
  footnote: { fontFamily: sans, fontWeight: 400, fontSize: '0.8125rem', lineHeight: 1.45, letterSpacing: '0em' },
} as const satisfies Record<string, TypeRole>;

export const rounded = { none: '0px' } as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '40px',
  '2xl': '64px',
  '3xl': '104px',
  'gutter-phone': '20px',
  'gutter-desktop': '6vw',
  'text-column': '34rem',
  'phone-bar': '72px',
} as const;

export const components = {
  button: { height: '64px', heightBlock: '56px', padding: '0 36px 0 44px', paddingCompact: '0 20px 0 24px' },
  phoneBar: { padding: '8px 20px', opacity: 0.94 },
  goldLine: { width: '64px', height: '1px' },
} as const;

// Elevation & Depth, Motion and Layout rules of DESIGN.md.
export const depth = {
  scrim: 0.85,
  scrimFade: '32px',
  imageFade: '120px',
  grainOpacity: 0.06,
  grainTile: '256px',
  smokeMaxOpacity: 0.35,
} as const;

export const motion = {
  duration: { hover: 120, small: 240, title: 480, cut: 900, numbers: 1400, glint: 700, calmFade: 200 },
  smokeCycle: { min: 10_000, max: 14_000 },
  easing: {
    camera: 'cubic-bezier(0.65, 0, 0.35, 1)',
    enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exit: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
  layerSpeed: { far: 0.45, band: 0.7, near: 1.0 },
  cameraTravel: 0.12,
  maxScale: 1.15,
  textRise: 24,
} as const;

function rgbTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** All tokens as CSS custom properties on :root. */
export function tokenCss(): string {
  const vars: string[] = [];
  for (const [name, value] of Object.entries(colors)) {
    vars.push(`--${name}: ${value}`, `--${name}-rgb: ${rgbTriplet(value)}`);
  }
  vars.push(`--font-serif: ${serif}`, `--font-sans: ${sans}`, `--serif-stretch: ${serifStretch}`);
  for (const [role, t] of Object.entries(typography)) {
    vars.push(
      `--${role}-size: ${t.fontSize}`,
      `--${role}-lh: ${t.lineHeight}`,
      `--${role}-ls: ${t.letterSpacing}`,
      `--${role}-weight: ${t.fontWeight}`,
    );
  }
  for (const [name, value] of Object.entries(spacing)) {
    const prefix = name.startsWith('gutter') || name === 'text-column' || name === 'phone-bar' ? '' : 'space-';
    vars.push(`--${prefix}${name}: ${value}`);
  }
  vars.push(
    `--radius: ${rounded.none}`,
    `--button-height: ${components.button.height}`,
    `--button-height-block: ${components.button.heightBlock}`,
    `--button-padding-compact: ${components.button.paddingCompact}`,
    `--button-padding: ${components.button.padding}`,
    `--phone-bar-padding: ${components.phoneBar.padding}`,
    `--phone-bar-bg: rgb(${rgbTriplet(colors.ink)} / ${components.phoneBar.opacity})`,
    `--gold-line-width: ${components.goldLine.width}`,
    `--scrim: rgb(${rgbTriplet(colors.ink)} / ${depth.scrim})`,
    `--scrim-fade: ${depth.scrimFade}`,
    `--image-fade: ${depth.imageFade}`,
    `--grain-opacity: ${depth.grainOpacity}`,
    `--grain-tile: ${depth.grainTile}`,
  );
  for (const [name, ms] of Object.entries(motion.duration)) {
    vars.push(`--dur-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${ms}ms`);
  }
  for (const [name, value] of Object.entries(motion.easing)) vars.push(`--ease-${name}: ${value}`);
  return `:root{${vars.join(';')}}`;
}
