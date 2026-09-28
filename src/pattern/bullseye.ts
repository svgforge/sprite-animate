/**
 * Concentric / bullseye: a repeating tile of rings around a center dot.
 *
 * @remarks
 * The rings are centered at the quarter points of the tile. The ring radius stays
 * below half the center spacing, so neighboring bullseyes never overlap.
 */
import { bandColor, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildBullseye(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const rings = density;
  const centersPerAxis = 2;
  const step = size / centersPerAxis;
  // Ring stroke and center dot scale with the tile, independent of ring count.
  const strokeWidth = Math.max(0.6, step * 0.045);
  const dotRadius = Math.max(0.9, step * 0.02);
  const offset = rand();
  const pieces: string[] = [];
  for (let i = 0; i < centersPerAxis; i++) {
    for (let j = 0; j < centersPerAxis; j++) {
      // Keep the max radius below half the center spacing (step / 2).
      const maxRadius = step * (0.2 + rand() * 0.08);
      const ringStep = maxRadius / rings;
      const cx = (i + 0.5) * step;
      const cy = (j + 0.5) * step;
      for (let r = rings; r >= 1; r--) {
        const color = bandColor(palette.inks, (i + j) / centersPerAxis + r / rings, offset);
        pieces.push(
          `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * ringStep)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}"/>`,
        );
      }
      const dotColor = bandColor(palette.fills, (i + j) / centersPerAxis, offset);
      pieces.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dotRadius)}" fill="${dotColor}"/>`,
      );
    }
  }
  return pieces.join("\n    ");
}

/** The bullseye pattern. */
export const bullseye: Family = {
  id: "bullseye",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  density: { min: 1, max: 10, step: 1 },
  densityDefault: 4,
  controls: [],
  draw: buildBullseye,
};
