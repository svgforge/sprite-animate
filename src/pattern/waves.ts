/**
 * Waves / topography: a repeating tile of stacked sine waves.
 *
 * @remarks
 * Every wave line has its own phase and amplitude. The wave count divides the
 * tile, and every line completes full cycles across the tile, so the pattern is
 * seamless in both directions.
 */
import { bandColor, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildWaves(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const lines = density;
  const spacing = size / lines;
  const cycles = 2;
  const angular = (Math.PI * 2 * cycles) / size;
  const strokeWidth = Math.max(0.8, spacing * 0.12);
  const segments = 48;
  const offset = rand();
  const pieces: string[] = [];
  for (let i = 0; i < lines; i++) {
    // Center every wave inside its band. A line centered exactly on the tile
    // edge would be clipped there (only half of it drawn), which shows up as a
    // seam; with a half-spacing margin at both edges nothing is cut off.
    const base = (i + 0.5) * spacing;
    const phase = rand() * Math.PI * 2;
    // Amplitude stays below half the spacing so lines never touch an edge.
    const amplitude = spacing * (0.22 + rand() * 0.2);
    const color = bandColor(palette.inks, i / lines, offset);
    const points: string[] = [];
    for (let s = 0; s <= segments; s++) {
      const along = (s / segments) * size;
      const wave = Math.sin(along * angular + phase) * amplitude;
      points.push(`${fmt(along)},${fmt(base + wave)}`);
    }
    pieces.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"/>`,
    );
  }
  return pieces.join("\n    ");
}

/** The waves pattern. */
export const waves: Family = {
  id: "waves",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  density: { min: 3, max: 30, step: 1 },
  densityDefault: 12,
  controls: [],
  draw: buildWaves,
};
