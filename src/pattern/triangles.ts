/**
 * Triangles / tessellation: a repeating tile of folded-looking half-squares.
 *
 * @remarks
 * Half-square tessellation split like origami: every cell is divided along a
 * diagonal (checkerboard alternating), one half gets the light facet and the
 * other the deep facet of the same hue — a shaded prism / folded-plane look.
 * A thin self-stroke keeps chip edges crisp and the tile seamless.
 */
import { bandIndex, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildTriangles(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  // Even cell count keeps the alternating diagonals continuous at the edges.
  const n = density + (density % 2);
  const offset = rand();
  const flip = rand() < 0.5 ? 0 : 1;
  const step = size / n;
  const makePolygon = (points: string, fill: string): string =>
    `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"/>`;
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const position = (i + j) / n;
      const facet = palette.facets[bandIndex(palette.facets.length, position, offset)];
      const colorA = facet.light;
      const colorB = facet.deep;
      const x = i * step;
      const y = j * step;
      const topLeft = `${fmt(x)},${fmt(y)}`;
      const topRight = `${fmt(x + step)},${fmt(y)}`;
      const bottomLeft = `${fmt(x)},${fmt(y + step)}`;
      const bottomRight = `${fmt(x + step)},${fmt(y + step)}`;
      if ((i + j + flip) % 2 === 0) {
        pieces.push(makePolygon(`${topLeft} ${topRight} ${bottomLeft}`, colorA));
        pieces.push(makePolygon(`${bottomRight} ${topRight} ${bottomLeft}`, colorB));
      } else {
        pieces.push(makePolygon(`${topLeft} ${topRight} ${bottomRight}`, colorA));
        pieces.push(makePolygon(`${topLeft} ${bottomLeft} ${bottomRight}`, colorB));
      }
    }
  }
  return pieces.join("\n    ");
}

/** The triangles pattern. */
export const triangles: Family = {
  id: "triangles",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  // Even steps keep the alternating diagonals seamless at the tile edges.
  density: { min: 2, max: 14, step: 2 },
  densityDefault: 6,
  controls: [],
  draw: buildTriangles,
};
