// Look-and-feel knobs.

// Chunkiness of the 3D world and shape: how many fat pixels span the shape's
// radius, on every screen. The pixel size follows from the screen, so a phone
// gets chunky pixels just like a desktop. Lower is chunkier. 70 gives an iPhone
// about 7x7 device pixels per fat pixel, and a 1080p-at-2x desktop about 9x9.
export const SHAPE_RES = 70;

// The HUD (text, panels) gets the largest whole-CSS-px fat pixel that still
// leaves at least this many fat pixels across, so the 8px font always fits.
export const HUD_RES = { w: 500, h: 290 };
