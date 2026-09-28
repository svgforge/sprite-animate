/**
 * The parts every pattern file needs: the random source, the color helpers and
 * the palette the settings resolve to.
 *
 * @remarks
 * These are the pieces the engine in `index.ts` builds the settings out of before
 * a pattern ever draws. A pattern file uses them for its own drawing and defines
 * nothing else that another file would need.
 */
import type { Facet, Palette, PatternSettings } from "./types";

/**
 * Deterministic PRNG (mulberry32): the same seed always produces the same
 * sequence, so a seed fully defines a pattern.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round a number to two decimals for clean SVG output. */
export function fmt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Convert HSL (0..360, percent, percent) to an rgba() string. The generic
 * rgba() form is supported by every renderer (browsers and preview tools).
 */
export function color(hue: number, sat: number, light: number, alpha: number): string {
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

/**
 * The palette the settings resolve to: as many bands as asked for, spread evenly
 * around the color circle, plus a backdrop tone for a pattern that brings one.
 */
export function palette(settings: PatternSettings): Palette {
  const count = clamp(Math.round(settings.colors), 1, 8);
  const bands: number[] = [];
  const fills: string[] = [];
  const inks: string[] = [];
  const facets: Facet[] = [];
  for (let index = 0; index < count; index++) {
    const hue = Math.round(settings.hue + (index * 360) / count) % 360;
    const fade = index === 0 ? settings.opacity : settings.opacity * 0.8;
    bands.push(hue);
    fills.push(color(hue, 70, 62, fade));
    inks.push(color(hue, 85, 72, settings.opacity));
    facets.push({
      // Light facet: pale and desaturated, like a plane turned toward light.
      light: color(hue, 55, 74, fade),
      // Deep facet: saturated and darker, like a plane turned away.
      deep: color(hue, 82, 46, settings.opacity),
    });
  }
  const first = bands[0] ?? 0;
  return { bands, fills, inks, facets, paper: color(first, 40, 8, 1), opacity: settings.opacity };
}

/**
 * Map a normalized, tile-periodic position to a palette index. `position`
 * must grow by a whole number when the tile index wraps (e.g. (i + j) / n),
 * so the assignment repeats exactly with the tile and no color seam appears
 * at the tile edges. `offset` (seed-driven) shifts the bands without breaking
 * the periodicity.
 */
export function bandIndex(count: number, position: number, offset: number): number {
  const wrapped = (((position + offset) % 1) + 1) % 1;
  return Math.min(count - 1, Math.floor(wrapped * count));
}

/** Pick a color from the palette at a tile-periodic position (see bandIndex). */
export function bandColor(list: string[], position: number, offset: number): string {
  return list[bandIndex(list.length, position, offset)];
}

/**
 * Duplicate the tile content around its eight neighbors. Shapes that cross a
 * tile edge reappear on the opposite side, which makes the repeat seamless.
 */
export function wrapTile(content: string, tile: number): string {
  const pieces = [content];
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      if (dx === 0 && dy === 0) continue;
      pieces.push(`<g transform="translate(${dx} ${dy})">${content}</g>`);
    }
  }
  return pieces.join("\n    ");
}
