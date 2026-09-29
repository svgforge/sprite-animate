/**
 * The pattern engine of the Pattern Studio.
 *
 * @remarks
 * This module is the list of patterns and the three documents they are rendered
 * into. Every pattern draws itself in its own file beside this one, so a pattern
 * is added by writing a file and adding it to {@link FAMILIES} below; the studio,
 * the presets and the export all work with that one list.
 *
 * The engine is pure — no DOM, no page, no user-facing texts — so the drawing can
 * be read, changed and tested on its own. The words the control card shows for a
 * pattern live with the UI, in `./pattern-studio`.
 *
 * A tile repeats without a visible seam: the grid-based patterns draw inside
 * their cells, so nothing crosses the border, and the hand-drawn pattern wraps
 * every shape around the tile edges. Rotation is applied to the whole field and
 * snapped to the angles that keep a tile seamless (e.g. 90° for waves and
 * chevrons, any angle for hand-drawn glyphs). A picture is drawn once and fills
 * the box it is put into; it brings its own backdrop, and the same rotation
 * turns it about its middle.
 *
 * @example
 * A pattern as a document that fills the box it is put into:
 *
 * ```ts
 * const svg = generatePattern({ ...DEFAULT_SETTINGS, family: "waves" });
 * ```
 */
import { bullseye } from "./bullseye";
import { chevrons } from "./chevrons";
import { dots } from "./dots";
import { handdrawn } from "./handdrawn";
import { polka } from "./polka";
import { rhombus } from "./rhombus";
import { clamp, fmt, mulberry32, palette } from "./shared";
import { triangles } from "./triangles";
import type { Canvas, Family, FamilyId, PatternSettings } from "./types";
import { waves } from "./waves";

export type {
  Canvas,
  ChoiceControl,
  Control,
  Facet,
  Family,
  FamilyId,
  FamilyInput,
  Palette,
  PatternSettings,
  Range,
  RangeControl,
} from "./types";

/**
 * All patterns, in the order they are offered in.
 */
export const FAMILIES: Family[] = [
  dots,
  triangles,
  waves,
  chevrons,
  bullseye,
  rhombus,
  handdrawn,
  polka,
];

/**
 * The same patterns by id, for settings that name one.
 */
export const FAMILY_BY_ID: ReadonlyMap<FamilyId, Family> = new Map(
  FAMILIES.map((family) => [family.id, family]),
);

/**
 * The pattern a fresh page starts with: the dots pattern, mid density, a cool
 * hue.
 */
export const DEFAULT_SETTINGS: PatternSettings = {
  family: "dots",
  seed: 1337,
  size: 240,
  density: 8,
  opacity: 1,
  colors: 3,
  hue: 190,
  rotation: 0,
  extra: {},
};

/**
 * The values of the controls a pattern brings for itself, checked against what
 * that pattern declares.
 *
 * @remarks
 * This is the one place that reads the control values, so a number is always
 * inside the range its own control offers, a choice is always one of the offered
 * values, and a value that is missing falls back to the control's start. A card
 * that builds its controls from the pattern, the engine that draws it and a
 * preset that is read back all go through here, so they cannot disagree.
 *
 * @param family - The pattern the values belong to.
 * @param extra - The values as they come in; anything unexpected is replaced.
 * @returns One entry per control of the pattern, in the order the pattern lists.
 */
export function readExtra(
  family: Family,
  extra: Record<string, unknown> | undefined,
): Record<string, number | string> {
  const clean: Record<string, number | string> = {};
  for (const control of family.controls) {
    const given = extra?.[control.key];
    if (control.kind === "range") {
      const number = typeof given === "number" && Number.isFinite(given) ? given : control.start;
      clean[control.key] = clamp(number, control.range.min, control.range.max);
      continue;
    }
    clean[control.key] =
      typeof given === "string" && control.values.includes(given) ? given : control.start;
  }
  return clean;
}

/**
 * Draws a pattern once: its family, the size it is drawn at and the shapes that
 * make it up. Shared by all three documents, so they cannot drift apart.
 */
function build(settings: PatternSettings): { family: Family; size: number; content: string } {
  const family = FAMILY_BY_ID.get(settings.family) ?? FAMILIES[0];
  const size = clamp(Math.round(settings.size), family.size.min, family.size.max);
  const density = clamp(Math.round(settings.density), family.density.min, family.density.max);
  const content = family.draw({
    rand: mulberry32(settings.seed),
    size,
    density,
    palette: palette(settings),
    extra: readExtra(family, settings.extra),
  });
  return { family, size, content };
}

/**
 * A picture, drawn once: it fills the box it is put into and crops what hangs
 * over, the way a background image does. A square box is not cropped at all.
 *
 * @param rotation - Degrees the picture is turned by, about its own middle. Like
 *   the rotation of a tile field, it belongs to the whole picture, so it is
 *   applied here and not by the pattern.
 */
function picture(
  content: string,
  edge: number,
  width: string,
  height: string,
  rotation: number,
): string {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${edge} ${edge}" preserveAspectRatio="xMidYMid slice">`,
  ];
  if (rotation === 0) {
    lines.push(`  ${content}`);
  } else {
    const turn = `rotate(${rotation} ${edge / 2} ${edge / 2})`;
    lines.push(`  <g transform="${turn}">`, `  ${content}`, "  </g>");
  }
  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * Renders a pattern as an SVG document that fills whatever box it is put into,
 * so it can be dropped into a page as a background as it is.
 *
 * @param settings - The pattern to draw.
 * @returns The SVG markup of the pattern.
 *
 * @example
 * ```ts
 * element.innerHTML = generatePattern(settings);
 * ```
 */
export function generatePattern(settings: PatternSettings): string {
  const { family, size, content } = build(settings);
  if (family.kind === "picture") {
    return picture(content, size, "100%", "100%", settings.rotation);
  }
  // Rotation rotates the whole periodic field (patternTransform), so it stays
  // seamless at any angle for every tile pattern.
  const rotationAttr =
    settings.rotation === 0
      ? ""
      : ` patternTransform="rotate(${settings.rotation} ${size / 2} ${size / 2})"`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">',
    "  <defs>",
    `    <pattern id="art" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${rotationAttr}>`,
    `    ${content}`,
    "    </pattern>",
    "  </defs>",
    '  <rect width="100%" height="100%" fill="url(#art)"/>',
    "</svg>",
  ].join("\n");
}

/**
 * How many pattern repeats a thumbnail shows across its width.
 *
 * @remarks
 * A preview that shows less than a full repeat is a crop that says little about
 * the pattern, and one that shows many only reads as noise. Two repeats is the
 * range in which the structure of a pattern is recognizable at a glance. A
 * picture is not a repeat, so its preview is the picture itself.
 */
const THUMBNAIL_REPEATS = 2;

/**
 * Renders a pattern as a small square preview, for a tile in a list of presets.
 *
 * @remarks
 * The preview of a tile is a scaled-down window onto the same pattern, not a
 * smaller pattern: the document keeps its size and the field behind it is scaled,
 * so a thumbnail looks like the background it stands for. Scaling and rotating
 * the whole field keeps the tile seamless, the same way the live background does.
 *
 * @param settings - The pattern to draw.
 * @param size - Edge length of the square in px. Defaults to 72.
 * @returns The SVG markup of the preview.
 *
 * @example
 * ```ts
 * image.src = `data:image/svg+xml,${encodeURIComponent(generateThumbnail(settings))}`;
 * ```
 */
export function generateThumbnail(settings: PatternSettings, size = 72): string {
  const { family, size: edge, content } = build(settings);
  if (family.kind === "picture") {
    return picture(content, edge, String(size), String(size), settings.rotation);
  }
  const zoom = size / (edge * THUMBNAIL_REPEATS);
  const rotation = settings.rotation === 0 ? "" : ` rotate(${settings.rotation})`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    "  <defs>",
    `    <pattern id="thumb" patternUnits="userSpaceOnUse" width="${edge}" height="${edge}" patternTransform="scale(${fmt(zoom)})${rotation}">`,
    `    ${content}`,
    "    </pattern>",
    "  </defs>",
    `  <rect width="${size}" height="${size}" fill="url(#thumb)"/>`,
    "</svg>",
  ].join("\n");
}

/** Split an rgba() color into a solid rgb() color plus its alpha. */
function splitRgba(value: string): { rgb: string; alpha: number } | null {
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (!match) return null;
  return { rgb: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: Number(match[4]) };
}

/**
 * Replace rgba() fills and strokes with their solid rgb() color plus an
 * explicit fill-/stroke-opacity attribute. Editors like Inkscape render
 * rgba() colors as black, so exported files must use the split form.
 *
 * @param markup - The markup to rewrite.
 * @returns The markup with every color split into color and opacity.
 */
export function solidColors(markup: string): string {
  return markup.replace(/<[^>]+>/g, (tag) => {
    let output = tag;
    for (const [attr, opacityAttr] of [
      ["fill", "fill-opacity"],
      ["stroke", "stroke-opacity"],
    ] as const) {
      output = output.replace(new RegExp(`${attr}="(rgba\\([^"]+\\))"`), (match, value: string) => {
        const split = splitRgba(value);
        if (!split) return match;
        const opacity = split.alpha < 1 ? ` ${opacityAttr}="${split.alpha}"` : "";
        return `${attr}="${split.rgb}"${opacity}`;
      });
    }
    return output;
  });
}

/**
 * Renders a pattern as a self-contained SVG file: a fixed viewport so editors
 * like Inkscape open it at a real size, a backdrop behind the pattern, and solid
 * colors that every editor renders correctly.
 *
 * @remarks
 * In a browser an `rgba()` fill is fine, but the SVG editors that people open
 * such a file in handle it differently, so the alpha is moved out of the color
 * into an explicit `fill-opacity` / `stroke-opacity` attribute. A picture brings
 * its own backdrop, so it is nested into the canvas instead of tiled across it.
 *
 * @param settings - The pattern to draw.
 * @param canvas - Size and backdrop of the document.
 * @returns The SVG markup of the file.
 */
export function generateStandaloneSvg(settings: PatternSettings, canvas: Canvas): string {
  const { family, size, content } = build(settings);
  const { width, height, background } = canvas;
  const initial = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${background}"/>`,
  ];
  if (family.kind === "picture") {
    // The picture is nested into the canvas, so it is indented along with it.
    const nested = picture(content, size, String(width), String(height), settings.rotation).split(
      "\n",
    );
    initial.push(...nested.map((line) => `  ${line}`));
  } else {
    const rotationAttr =
      settings.rotation === 0
        ? ""
        : ` patternTransform="rotate(${settings.rotation} ${size / 2} ${size / 2})"`;
    initial.push(
      "  <defs>",
      `    <pattern id="art" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${rotationAttr}>`,
      `    ${content}`,
      "    </pattern>",
      "  </defs>",
      `  <rect width="${width}" height="${height}" fill="url(#art)"/>`,
    );
  }
  initial.push("</svg>");
  return solidColors(initial.join("\n"));
}
