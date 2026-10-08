// Opening (level 3): the intro before the first screen. Browser-safe: the page's motion script
// calls startOpening(), which resolves when the first screen is ready. Markup: Gate.astro (the
// inline <head> script, Frame's "head" slot) and Opening.astro (the video overlay, in the hero's
// accent place). The decision logic is gate.ts.
export { startOpening } from './motion';
