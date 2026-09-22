// src/patterns.ts
//
// Seamless SVG pattern generators for the Pattern Studio (demo3).
//
// Every family draws one tile that repeats without visible seams:
// - grid-based families draw inside their cells, nothing crosses the border,
// - the hand-drawn family wraps every shape around the tile edges.
//
// Rotation is applied per family and snapped to the angles that keep the
// tile seamless (e.g. 90° for waves/chevrons, any angle for hand-drawn glyphs).

export type FamilyId =
  | "dots"
  | "triangles"
  | "waves"
  | "chevrons"
  | "bullseye"
  | "rhombus"
  | "handdrawn";

export interface PatternSettings {
  family: FamilyId;
  seed: number;
  density: number;
  size: number; // tile size in px
  opacity: number; // element alpha 0..1
  colors: number; // number of distinct hues 1..8
  hue: number; // base hue 0..360
  rotation: number; // global rotation in degrees
}

export interface FamilyInput {
  rand: () => number;
  tile: number;
  density: number;
  fills: string[];
  inks: string[];
  facets: Facet[];
}

export interface Family {
  id: FamilyId;
  label: string;
  description: string;
  densityLabel: string;
  densityMin: number;
  densityMax: number;
  densityStep: number;
  densityDefault: number;
  build: (input: FamilyInput) => string;
}

// Deterministic PRNG (mulberry32): the same seed always produces the same
// sequence, so a seed fully defines a pattern.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Round a number to two decimals for clean SVG output.
function fmt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

// Convert HSL (0..360, percent, percent) to an rgba() string. The generic
// rgba() form is supported by every renderer (browsers and preview tools).
function color(hue: number, sat: number, light: number, alpha: number): string {
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number;
  let g: number;
  let b: number;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255);
  const alphaRounded = Math.round(alpha * 100) / 100;
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alphaRounded})`;
}

// The color palette. `fills` are softer (surfaces), `inks` are vivid
// (strokes), `facets` are the light/deep pairs used by the triangle family to
// create a shaded, faceted look. Hues spread evenly from the base hue.
export interface Facet {
  light: string;
  deep: string;
}

function palette(settings: PatternSettings): { fills: string[]; inks: string[]; facets: Facet[] } {
  const count = clamp(Math.round(settings.colors), 1, 8);
  const fills: string[] = [];
  const inks: string[] = [];
  const facets: Facet[] = [];
  for (let index = 0; index < count; index++) {
    const hue = Math.round(settings.hue + (index * 360) / count) % 360;
    const fade = index === 0 ? settings.opacity : settings.opacity * 0.8;
    fills.push(color(hue, 70, 62, fade));
    inks.push(color(hue, 85, 72, settings.opacity));
    facets.push({
      // Light facet: pale and desaturated, like a plane turned toward light.
      light: color(hue, 55, 74, fade),
      // Deep facet: saturated and darker, like a plane turned away.
      deep: color(hue, 82, 46, settings.opacity),
    });
  }
  return { fills, inks, facets };
}

// Map a normalized, tile-periodic position to a palette index. `position`
// must grow by a whole number when the tile index wraps (e.g. (i + j) / n),
// so the assignment repeats exactly with the tile and no color seam appears
// at the tile edges. `offset` (seed-driven) shifts the bands without breaking
// the periodicity.
function bandIndex(count: number, position: number, offset: number): number {
  const wrapped = (((position + offset) % 1) + 1) % 1;
  return Math.min(count - 1, Math.floor(wrapped * count));
}

// Pick a color from the palette at a tile-periodic position (see bandIndex).
function bandColor(list: string[], position: number, offset: number): string {
  return list[bandIndex(list.length, position, offset)];
}

// --- Dots / halftone ---------------------------------------------------------
//
// Two staggered dot grids: dots on the cell centers plus smaller dots offset
// by a quarter cell. Both stay fully inside their cells — no dot sits on the
// tile boundary — so the tile repeats cleanly. The dot size swells and shrinks
// in one full sine period across the tile (a halftone-like gradient) and the
// palette is assigned in tile-periodic bands.

function buildDots(input: FamilyInput): string {
  const { tile, density, fills, rand } = input;
  const n = clamp(Math.round(density), 4, 24);
  const step = tile / n;
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
      const mainColor = bandColor(fills, position, offset);
      const subColor = bandColor(fills, position + 0.5, offset);
      pieces.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(mainRadius * swell)}" fill="${mainColor}"/>`,
        `<circle cx="${fmt(subX)}" cy="${fmt(subY)}" r="${fmt(subRadius)}" fill="${subColor}"/>`,
      );
    }
  }
  return pieces.join("\n    ");
}

// --- Triangles / tessellation -------------------------------------------------
//
// Half-square tessellation split like origami: every cell is divided along a
// diagonal (checkerboard alternating), one half gets the light facet and the
// other the deep facet of the same hue — a shaded prism / folded-plane look.
// A thin self-stroke keeps chip edges crisp and the tile seamless.

function buildTriangles(input: FamilyInput): string {
  const { tile, density, facets, rand } = input;
  // Even cell count keeps the alternating diagonals continuous at the edges.
  const n = clamp(Math.round(density) + (Math.round(density) % 2), 2, 14);
  const offset = rand();
  const flip = rand() < 0.5 ? 0 : 1;
  const step = tile / n;
  const makePolygon = (points: string, fill: string): string =>
    `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"/>`;
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const position = (i + j) / n;
      const facet = facets[bandIndex(facets.length, position, offset)];
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

// --- Waves / topography --------------------------------------------------------
//
// Stacked sine waves, each with its own phase and amplitude. The wave count
// divides the tile, and every line completes full cycles across the tile, so
// the pattern is seamless in both directions.

function buildWaves(input: FamilyInput): string {
  const { tile, density, inks, rand } = input;
  const lines = clamp(Math.round(density), 3, 30);
  const spacing = tile / lines;
  const cycles = 2;
  const angular = (Math.PI * 2 * cycles) / tile;
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
    const color = bandColor(inks, i / lines, offset);
    const points: string[] = [];
    for (let s = 0; s <= segments; s++) {
      const along = (s / segments) * tile;
      const wave = Math.sin(along * angular + phase) * amplitude;
      points.push(`${fmt(along)},${fmt(base + wave)}`);
    }
    pieces.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"/>`,
    );
  }
  return pieces.join("\n    ");
}

// --- Chevrons / stripes --------------------------------------------------------
//
// Bold chevron arrows ("›") on a grid. Rows alternate their direction like a
// herringbone weave, colors flow in tile-periodic bands, and every arrow sits
// fully inside its cell — so the tile repeats without seams.

function buildChevrons(input: FamilyInput): string {
  const { tile, density, fills, rand } = input;
  // Even row count keeps the alternating row rhythm continuous at the edges.
  const n = clamp(Math.round(density) + (Math.round(density) % 2), 2, 12);
  const step = tile / n;
  const offset = rand();
  const rowFlip = rand() < 0.5 ? 1 : -1;
  const pieces: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Arrow size stays below the cell size so nothing crosses a cell edge.
      const size = step * (0.5 + rand() * 0.22);
      const half = size / 2;
      const back = half * 0.55;
      const direction = (j % 2 === 0 ? 1 : -1) * rowFlip;
      const cx = (i + 0.5) * step;
      const tipX = cx + direction * half;
      const backX = cx - direction * half;
      const notchX = cx - direction * back;
      const cyTop = (j + 0.5) * step - half * 0.95;
      const cyMid = (j + 0.5) * step;
      const cyBottom = (j + 0.5) * step + half * 0.95;
      const color = bandColor(fills, (i + j) / n, offset);
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

// --- Concentric / bullseye -------------------------------------------------------
//
// Concentric rings centered at the quarter points of the tile. The ring radius
// stays below half the center spacing, so neighboring bullseyes never overlap.

function buildBullseye(input: FamilyInput): string {
  const { tile, density, inks, fills, rand } = input;
  const rings = clamp(Math.round(density), 1, 10);
  const centersPerAxis = 2;
  const step = tile / centersPerAxis;
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
        const color = bandColor(inks, (i + j) / centersPerAxis + r / rings, offset);
        pieces.push(
          `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r * ringStep)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}"/>`,
        );
      }
      const dotColor = bandColor(fills, (i + j) / centersPerAxis, offset);
      pieces.push(
        `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dotRadius)}" fill="${dotColor}"/>`,
      );
    }
  }
  return pieces.join("\n    ");
}

// --- Rhombus / lattice ------------------------------------------------------------
//
// Diamond outlines on a grid with filled diamonds on every other node — a
// woven lattice look.

function buildRhombus(input: FamilyInput): string {
  const { tile, density, inks, fills, rand } = input;
  const n = clamp(Math.round(density), 2, 12);
  const step = tile / n;
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
      const ink = bandColor(inks, position, offset);
      pieces.push(
        `<polygon points="${top} ${right} ${bottom} ${left}" fill="none" stroke="${ink}" stroke-width="${fmt(strokeWidth)}" stroke-linejoin="round"/>`,
      );
      if (rand() < 0.45) {
        const fillTop = `${fmt(cx)},${fmt(cy - fillDiamond)}`;
        const fillRight = `${fmt(cx + fillDiamond)},${fmt(cy)}`;
        const fillBottom = `${fmt(cx)},${fmt(cy + fillDiamond)}`;
        const fillLeft = `${fmt(cx - fillDiamond)},${fmt(cy)}`;
        const fill = bandColor(fills, position + 0.5, offset);
        pieces.push(
          `<polygon points="${fillTop} ${fillRight} ${fillBottom} ${fillLeft}" fill="${fill}"/>`,
        );
      }
    }
  }
  return pieces.join("\n    ");
}

// --- Hand drawn lines and shapes -------------------------------------------------
//
// Imperfect, organic doodles: wobbly rings, wobbly triangles, squiggly lines
// and short dabs. Every shape is placed inside the tile and then the whole
// tile is wrapped around its edges, so the repeat stays seamless.

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
  const { tile, density } = input;
  const count = clamp(Math.round(density), 8, 140);
  const pieces: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = input.rand() * tile;
    const cy = input.rand() * tile;
    const size = tile * (0.02 + input.rand() * 0.09);
    const angle = input.rand() * 360;
    const width = clamp(0.8 + input.rand() * 1.8, 0.6, 3.2);
    const roll = input.rand();
    if (roll < 0.3) {
      const ink = input.inks[Math.floor(input.rand() * input.inks.length)];
      pieces.push(handDrawnRing(cx, cy, size, ink, width, input.rand));
    } else if (roll < 0.55) {
      const ink = input.inks[Math.floor(input.rand() * input.inks.length)];
      pieces.push(handDrawnTriangle(cx, cy, size, angle, ink, width, input.rand));
    } else if (roll < 0.85) {
      const ink = input.inks[Math.floor(input.rand() * input.inks.length)];
      pieces.push(handDrawnSquiggle(cx, cy, size, angle, ink, width, input.rand));
    } else {
      const fill = input.fills[Math.floor(input.rand() * input.fills.length)];
      pieces.push(handDrawnDab(cx, cy, size, angle, fill, width));
    }
  }
  return wrapTile(pieces.join("\n    "), tile);
}

// Duplicate the tile content around its eight neighbors. Shapes that cross a
// tile edge reappear on the opposite side, which makes the repeat seamless.
function wrapTile(content: string, tile: number): string {
  const pieces = [content];
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      if (dx === 0 && dy === 0) continue;
      pieces.push(`<g transform="translate(${dx} ${dy})">${content}</g>`);
    }
  }
  return pieces.join("\n    ");
}

export const FAMILIES: Family[] = [
  {
    id: "dots",
    label: "Dots / halftone",
    description: "Two staggered dot grids with a halftone-like size wash.",
    densityLabel: "Dots per row",
    densityMin: 4,
    densityMax: 24,
    densityStep: 1,
    densityDefault: 8,
    build: buildDots,
  },
  {
    id: "triangles",
    label: "Triangles / tessellation",
    description: "Half-square triangles in a checkerboard prism tessellation.",
    densityLabel: "Cells per row",
    densityMin: 2,
    densityMax: 14,
    // Even steps keep the alternating diagonals seamless at the tile edges.
    densityStep: 2,
    densityDefault: 6,
    build: buildTriangles,
  },
  {
    id: "waves",
    label: "Waves / topography",
    description: "Stacked sine waves with individual phases and line colors.",
    densityLabel: "Wave lines",
    densityMin: 3,
    densityMax: 30,
    densityStep: 1,
    densityDefault: 12,
    build: buildWaves,
  },
  {
    id: "chevrons",
    label: "Chevrons / stripes",
    description: "Chevron arrows in a herringbone weave with a diagonal color flow.",
    densityLabel: "Arrows per row",
    densityMin: 2,
    densityMax: 12,
    // Even steps keep the alternating row rhythm seamless at the tile edges.
    densityStep: 2,
    densityDefault: 8,
    build: buildChevrons,
  },
  {
    id: "bullseye",
    label: "Concentric / bullseye",
    description: "Concentric rings centered at the tile quarter points.",
    densityLabel: "Rings per bullseye",
    densityMin: 1,
    densityMax: 10,
    densityStep: 1,
    densityDefault: 4,
    build: buildBullseye,
  },
  {
    id: "rhombus",
    label: "Rhombus / lattice",
    description: "Diamond outlines with filled diamonds on alternating nodes.",
    densityLabel: "Diamonds per row",
    densityMin: 2,
    densityMax: 12,
    densityStep: 1,
    densityDefault: 6,
    build: buildRhombus,
  },
  {
    id: "handdrawn",
    label: "Hand-drawn",
    description: "Imperfect rings, triangles, squiggles and dabs — like doodles.",
    densityLabel: "Shapes per tile",
    densityMin: 8,
    densityMax: 140,
    densityStep: 1,
    densityDefault: 40,
    build: buildHandDrawn,
  },
];

export const FAMILY_BY_ID: ReadonlyMap<FamilyId, Family> = new Map(
  FAMILIES.map((family) => [family.id, family]),
);

export const DEFAULT_SETTINGS: PatternSettings = {
  family: "dots",
  seed: 1337,
  density: 8,
  size: 240,
  opacity: 0.9,
  colors: 3,
  hue: 190,
  rotation: 0,
};

// Build the tile content plus the pattern rotation transform for the given
// settings. Shared by the live background and the standalone export.
function buildTile(settings: PatternSettings): {
  tile: number;
  content: string;
  rotationAttr: string;
} {
  const rand = mulberry32(settings.seed);
  const tile = clamp(Math.round(settings.size), 40, 400);
  const family = FAMILY_BY_ID.get(settings.family) ?? FAMILIES[0];
  const { fills, inks, facets } = palette(settings);
  const content = family.build({ rand, tile, density: settings.density, fills, inks, facets });
  // Rotation rotates the whole periodic field (patternTransform), so it stays
  // seamless at any angle for every family.
  const rotationAttr =
    settings.rotation === 0
      ? ""
      : ` patternTransform="rotate(${settings.rotation} ${tile / 2} ${tile / 2})"`;
  return { tile, content, rotationAttr };
}

export function generatePattern(settings: PatternSettings): string {
  const { tile, content, rotationAttr } = buildTile(settings);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">',
    "  <defs>",
    `    <pattern id="art" patternUnits="userSpaceOnUse" width="${tile}" height="${tile}"${rotationAttr}>`,
    `    ${content}`,
    "    </pattern>",
    "  </defs>",
    '  <rect width="100%" height="100%" fill="url(#art)"/>',
    "</svg>",
  ].join("\n");
}

// Split an rgba() color into a solid rgb() color plus its alpha.
function splitRgba(value: string): { rgb: string; alpha: number } | null {
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (!match) return null;
  return { rgb: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: Number(match[4]) };
}

// Replace rgba() fills and strokes with their solid rgb() color plus an
// explicit fill-/stroke-opacity attribute. Editors like Inkscape render
// rgba() colors as black, so exported files must use the split form.
function solidColors(markup: string): string {
  return markup.replace(/<[^>]+>/g, (tag) => {
    let output = tag;
    for (const [attr, opacityAttr] of [
      ["fill", "fill-opacity"],
      ["stroke", "stroke-opacity"],
    ] as const) {
      output = output.replace(new RegExp(`${attr}="(rgba\\([^"]+\\))"`), (match, color) => {
        const split = splitRgba(color);
        if (!split) return match;
        const opacity = split.alpha < 1 ? ` ${opacityAttr}="${split.alpha}"` : "";
        return `${attr}="${split.rgb}"${opacity}`;
      });
    }
    return output;
  });
}

// A self-contained SVG file of the pattern: fixed viewport so editors like
// Inkscape open it at a real size, a dark backdrop like on the page, and
// solid colors (see solidColors) that every editor renders correctly.
export function generateStandaloneSvg(settings: PatternSettings): string {
  const { tile, content, rotationAttr } = buildTile(settings);
  const width = 800;
  const height = 600;
  const initial = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="#12121f"/>`,
    "  <defs>",
    `    <pattern id="art" patternUnits="userSpaceOnUse" width="${tile}" height="${tile}"${rotationAttr}>`,
    `    ${content}`,
    "    </pattern>",
    "  </defs>",
    `  <rect width="${width}" height="${height}" fill="url(#art)"/>`,
    "</svg>",
  ].join("\n");
  return solidColors(initial);
}
