/**
 * Hand-drawn: a repeating tile of imperfect, organic doodles.
 *
 * @remarks
 * Wobbly rings, wobbly triangles, squiggly lines and short dabs. Every shape is
 * placed inside the tile and then the whole tile is wrapped around its edges, so
 * the repeat stays seamless.
 */
import { clamp, fmt, wrapTile } from "./shared";
import type { Family, FamilyInput } from "./types";

function handDrawnRing(
  cx: number,
  cy: number,
  size: number,
  ink: string,
  width: number,
  rand: () => number,
): string {
  const segments = 14;
  const points: string[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const radius = size * (0.8 + rand() * 0.5);
    points.push(`${fmt(cx + Math.cos(theta) * radius)},${fmt(cy + Math.sin(theta) * radius)}`);
  }
  const d = `M ${points.join(" L ")} Z`;
  return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function handDrawnTriangle(
  cx: number,
  cy: number,
  size: number,
  angle: number,
  ink: string,
  width: number,
  rand: () => number,
): string {
  const baseAngle = angle * (Math.PI / 180);
  const points: string[] = [];
  for (let i = 0; i < 3; i++) {
    const theta = baseAngle + (i * Math.PI * 2) / 3;
    const radius = size * (0.7 + rand() * 0.5);
    points.push(`${fmt(cx + Math.cos(theta) * radius)},${fmt(cy + Math.sin(theta) * radius)}`);
  }
  const d = `M ${points.join(" L ")} Z`;
  return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function handDrawnSquiggle(
  cx: number,
  cy: number,
  size: number,
  angle: number,
  ink: string,
  width: number,
  rand: () => number,
): string {
  const length = size * 3;
  const direction = angle * (Math.PI / 180);
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  const nx = -dy;
  const ny = dx;
  const segments = 10;
  const points: string[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const along = (t - 0.5) * length;
    const wobble = Math.sin(t * Math.PI * 4 + rand() * Math.PI) * size * 0.7;
    points.push(`${fmt(cx + dx * along + nx * wobble)},${fmt(cy + dy * along + ny * wobble)}`);
  }
  const d = `M ${points.join(" L ")}`;
  return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${fmt(width)}" stroke-linecap="round"/>`;
}

function handDrawnDab(
  cx: number,
  cy: number,
  size: number,
  angle: number,
  fill: string,
  width: number,
): string {
  const direction = angle * (Math.PI / 180);
  const length = size * 2.2;
  const x2 = cx + Math.cos(direction) * length;
  const y2 = cy + Math.sin(direction) * length;
  return `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${fill}" stroke-width="${fmt(width + 1.5)}" stroke-linecap="round"/>`;
}

function buildHandDrawn(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const pieces: string[] = [];
  for (let i = 0; i < density; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const glyphSize = size * (0.02 + rand() * 0.09);
    const angle = rand() * 360;
    const width = clamp(0.8 + rand() * 1.8, 0.6, 3.2);
    const roll = rand();
    if (roll < 0.3) {
      const ink = palette.inks[Math.floor(rand() * palette.inks.length)];
      pieces.push(handDrawnRing(cx, cy, glyphSize, ink, width, rand));
    } else if (roll < 0.55) {
      const ink = palette.inks[Math.floor(rand() * palette.inks.length)];
      pieces.push(handDrawnTriangle(cx, cy, glyphSize, angle, ink, width, rand));
    } else if (roll < 0.85) {
      const ink = palette.inks[Math.floor(rand() * palette.inks.length)];
      pieces.push(handDrawnSquiggle(cx, cy, glyphSize, angle, ink, width, rand));
    } else {
      const fill = palette.fills[Math.floor(rand() * palette.fills.length)];
      pieces.push(handDrawnDab(cx, cy, glyphSize, angle, fill, width));
    }
  }
  return wrapTile(pieces.join("\n    "), size);
}

/** The hand-drawn pattern. */
export const handdrawn: Family = {
  id: "handdrawn",
  kind: "tile",
  size: { min: 40, max: 400, step: 10 },
  density: { min: 8, max: 140, step: 1 },
  densityDefault: 40,
  controls: [],
  draw: buildHandDrawn,
};
