/**
 * Dots / halftone: a repeating tile of two staggered dot grids.
 *
 * @remarks
 * Dots on the cell centers plus smaller dots offset by a quarter cell. Both stay
 * fully inside their cells — no dot sits on the tile boundary — so the tile
 * repeats cleanly. The dot size swells and shrinks in one full sine period across
 * the tile (a halftone-like gradient) and the palette is assigned in
 * tile-periodic bands.
 */
import { bandColor, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildDots(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const n = density;
  const step = size / n;
  const mainRadius = step * 0.3;
  const subRadius = step * 0.15;
  const offset = rand();
  const phase = rand() * Math.PI * 2;
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const position = (i + j) / n;
      // Size modulation: one full sine period across the tile → seamless.
      const swell = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(position * Math.PI * 2 + phase));
      const cx = (i + 0.5) * step;
      const cy = (j + 0.5) * step;
      const subX = (i + 0.25) * step;
      const subY = (j + 0.25) * step;
      const mainColor = bandColor(palette.fills, position, offset);
      const subColor = bandColor(palette.fills, position + 0.5, offset);
      pieces.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(mainRadius * swell)}" fill="${mainColor}"/>`,
        `<circle cx="${fmt(subX)}" cy="${fmt(subY)}" r="${fmt(subRadius)}" fill="${subColor}"/>`,
      );
    }
  }
  return pieces.join("\n    ");
}

/** The dots pattern. */
export const dots: Family = {
  id: "dots",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  density: { min: 4, max: 24, step: 1 },
  densityDefault: 8,
  controls: [],
  draw: buildDots,
};
