/**
 * Chevrons / stripes: a repeating tile of bold chevron arrows.
 *
 * @remarks
 * Rows alternate their direction like a herringbone weave, colors flow in
 * tile-periodic bands, and every arrow sits fully inside its cell — so the tile
 * repeats without seams.
 */
import { bandColor, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildChevrons(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  // Even row count keeps the alternating row rhythm continuous at the edges.
  const n = density + (density % 2);
  const step = size / n;
  const offset = rand();
  const rowFlip = rand() < 0.5 ? 1 : -1;
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Arrow size stays below the cell size so nothing crosses a cell edge.
      const arrow = step * (0.5 + rand() * 0.22);
      const half = arrow / 2;
      const back = half * 0.55;
      const direction = (j % 2 === 0 ? 1 : -1) * rowFlip;
      const cx = (i + 0.5) * step;
      const tipX = cx + direction * half;
      const backX = cx - direction * half;
      const notchX = cx - direction * back;
      const cyTop = (j + 0.5) * step - half * 0.95;
      const cyMid = (j + 0.5) * step;
      const cyBottom = (j + 0.5) * step + half * 0.95;
      const color = bandColor(palette.fills, (i + j) / n, offset);
      const points = [
        `${fmt(backX)},${fmt(cyTop)}`,
        `${fmt(tipX)},${fmt(cyMid)}`,
        `${fmt(backX)},${fmt(cyBottom)}`,
        `${fmt(notchX)},${fmt(cyMid)}`,
      ].join(" ");
      pieces.push(`<polygon points="${points}" fill="${color}"/>`);
    }
  }
  return pieces.join("\n    ");
}

/** The chevrons pattern. */
export const chevrons: Family = {
  id: "chevrons",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  // Even steps keep the alternating row rhythm seamless at the tile edges.
  density: { min: 2, max: 12, step: 2 },
  densityDefault: 8,
  controls: [],
  draw: buildChevrons,
};
