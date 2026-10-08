// Camera (level 2): moves the story's scenes while the page scrolls. Browser-safe: the page's
// motion script calls startCamera(). Its only markup, Flash.astro (the freeze frame's amber
// light), fills the story's "accent-freeze" slot.
export { startCamera } from './motion';
