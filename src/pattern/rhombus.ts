/**
 * Rhombus / lattice: a repeating tile of diamond outlines on a grid.
 *
 * @remarks
 * Every node gets a diamond outline, and about half of them a smaller filled
 * diamond on top of it — a woven lattice look.
 */
import { bandColor, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

function buildRhombus(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const n = density;
  const step = size / n;
  const strokeWidth = Math.max(0.5, step * 0.045);
  const offset = rand();
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * step;
      const cy = (j + 0.5) * step;
      const position = (i + j) / n;
      // Outline and fill sizes stay inside the cell → seamless.
      const outline = step * (0.38 + rand() * 0.08);
      const fillDiamond = step * (0.28 + rand() * 0.08);
      const top = `${fmt(cx)},${fmt(cy - outline)}`;
      const right = `${fmt(cx + outline)},${fmt(cy)}`;
      const bottom = `${fmt(cx)},${fmt(cy + outline)}`;
      const left = `${fmt(cx - outline)},${fmt(cy)}`;
      const ink = bandColor(palette.inks, position, offset);
      pieces.push(
        `<polygon points="${top} ${right} ${bottom} ${left}" fill="none" stroke="${ink}" stroke-width="${fmt(strokeWidth)}" stroke-linejoin="round"/>`,
      );
      if (rand() < 0.45) {
        const fillTop = `${fmt(cx)},${fmt(cy - fillDiamond)}`;
        const fillRight = `${fmt(cx + fillDiamond)},${fmt(cy)}`;
        const fillBottom = `${fmt(cx)},${fmt(cy + fillDiamond)}`;
        const fillLeft = `${fmt(cx - fillDiamond)},${fmt(cy)}`;
        const fill = bandColor(palette.fills, position + 0.5, offset);
        pieces.push(
          `<polygon points="${fillTop} ${fillRight} ${fillBottom} ${fillLeft}" fill="${fill}"/>`,
        );
      }
    }
  }
  return pieces.join("\n    ");
}

/** The rhombus pattern. */
export const rhombus: Family = {
  id: "rhombus",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  density: { min: 2, max: 12, step: 1 },
  densityDefault: 6,
  controls: [],
  draw: buildRhombus,
};
