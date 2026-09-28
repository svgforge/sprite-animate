/**
 * Polka art: a picture made of dots.
 *
 * @remarks
 * The other patterns in this directory draw one seamless tile that repeats
 * forever. This one is the opposite: it draws a single picture of a fixed size,
 * where every dot is placed once. A gradient or a figure is resolved into a
 * brightness field first, and each dot takes its size and its color from the
 * field at its own place — so the dots do not just fill a rectangle, they trace
 * the source.
 *
 * The picture brings its own controls — what the dots trace, how they are placed
 * and how they are shaped — and its own backdrop, because a picture is meant to
 * be looked at and not to disappear into a page.
 *
 * What the seed works on is the single dot: every dot is stamped a little
 * differently than the field asks for, so the same figure comes out as a new
 * picture with every seed.
 */
import { clamp, color, fmt } from "./shared";
import type { Family, FamilyInput } from "./types";

/** What the dots trace: a gradient running across the picture, or a figure. */
const SOURCES = ["linearLeft", "linearAngle", "radial", "circle", "ring", "heart", "wave"] as const;

/** One of the things the dots can trace. */
type Source = (typeof SOURCES)[number];

/** How the dots of a picture are placed. */
const LAYOUTS = ["grid", "hex", "scatter"] as const;

/** One of the ways the dots can be placed. */
type Layout = (typeof LAYOUTS)[number];

/** The range of every control of this picture, in one place. */
const RANGES = {
  weight: { min: 0.05, max: 0.9, step: 0.05 },
  floor: { min: 0, max: 4, step: 0.1 },
  angle: { min: 0, max: 360, step: 1 },
  softness: { min: 0, max: 0.3, step: 0.01 },
  wash: { min: 0, max: 8, step: 0.1 },
};

/**
 * How far a single dot may differ from the size and the tone its place in the
 * field asks for, counted as a share of it: the hand-stamped look, and the only
 * thing the seed works on in a grid.
 */
const STAMP_RANGE = 0.3;

/**
 * A brightness field, and nothing else.
 *
 * @remarks
 * A field is a function from a place on the picture to a number between 0 and 1,
 * telling how strong the source is there. Everything the drawing needs to know
 * about a gradient or a figure is in there, so a new source is one function.
 */
type Field = (u: number, v: number) => number;

/** How a source turns the settings into the field it draws. */
type FieldBuilder = (settings: { angle: number; softness: number }) => Field;

const FULL_TURN = Math.PI * 2;

/** Distance from the middle of the picture: 0 in the centre, 1 at a corner. */
function radius(u: number, v: number): number {
  return Math.hypot(u - 0.5, v - 0.5) / Math.SQRT1_2;
}

/**
 * How strong something is at a signed distance from its edge.
 *
 * @remarks
 * This is the shape of every soft edge in this file: a figure is one ramp, and a
 * blurred dot field is a sum of ramps. The fade is a smoothstep, so the dots
 * shrink into the edge instead of stopping at it.
 *
 * @param beyond - How far past the edge the place lies. Negative means inside.
 * @param width - Width of the fade, as a share of the picture. 0 is a hard edge.
 * @returns 1 at the edge and inside it, 0 once the fade is spent.
 */
function falloff(beyond: number, width: number): number {
  if (beyond <= 0) return 1;
  if (width <= 0) return 0;
  if (beyond >= width) return 0;
  const t = beyond / width;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The sources, each building its field from the settings.
 *
 * @remarks
 * A builder only reads the settings its own source cares about, so the angle
 * reaches the angled gradient and the softness reaches the figures, and nothing
 * else has to know about either of them.
 */
const FIELDS: Record<Source, FieldBuilder> = {
  // A gradient running from the left edge to the right edge.
  linearLeft: () => (u) => u,
  // The same gradient, turned by the angle the settings ask for.
  linearAngle: ({ angle }) => {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // The projection of the square onto the direction runs from its smallest
    // corner value to its largest. Mapping that span onto 0..1 keeps the whole
    // gradient in the picture, whatever the angle is.
    const low = Math.min(0, cos) + Math.min(0, sin);
    const high = Math.max(0, cos) + Math.max(0, sin);
    return (u, v) => clamp((u * cos + v * sin - low) / (high - low), 0, 1);
  },
  // A gradient from the middle out to the rim, bright in the centre.
  radial: () => (u, v) => clamp(1 - radius(u, v), 0, 1),
  // A filled disc in the middle.
  circle:
    ({ softness }) =>
    (u, v) =>
      falloff(radius(u, v) - 0.62, softness),
  // A bright rim around an empty middle.
  ring:
    ({ softness }) =>
    (u, v) =>
      falloff(Math.abs(radius(u, v) - 0.52) - 0.18, softness),
  // A heart, from the classic two-circles-and-a-point equation.
  heart:
    ({ softness }) =>
    (u, v) => {
      // The heart is scaled to the picture, with the top of the lobes up.
      const x = (u - 0.5) * 2.1;
      const y = (0.52 - v) * 2.1;
      const a = x * x + y * y - 1;
      // The equation is zero on the outline, negative inside it and positive
      // outside. Taking the cube root spreads that out into a number that stands
      // for a distance, so falloff gets a place to fade over.
      return falloff(Math.cbrt(a * a * a - x * x * y * y * y), softness);
    },
  // Diagonal stripes, so the field reads as movement rather than as a disc.
  wave: () => (u, v) => (0.5 + 0.5 * Math.sin((u + v) * FULL_TURN * 1.5)) ** 1.5,
};

/**
 * Where the dots sit on the picture.
 *
 * @remarks
 * A grid gives a regular polka look, a hex grid brings its rows closer together
 * and offsets every other row so the dots nest, and a scatter jitters every dot a
 * little so the picture loosens up. All three walk the same columns, so the
 * density means roughly the same thing in each of them.
 */
function dotPlaces(
  layout: Layout,
  density: number,
  rand: () => number,
): { u: number; v: number }[] {
  const step = 1 / density;
  const hex = layout === "hex";
  // In a honeycomb the rows sit closer together than in a square grid: the
  // vertical distance of a cell is its diagonal, √3/2 of its side. Filling the
  // picture that way needs a few more rows, so they are spread over the whole
  // height again and every row is the same distance from the next.
  const rows = hex ? Math.ceil(density / (Math.sqrt(3) / 2)) : density;
  const places: { u: number; v: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < density; column += 1) {
      let u = (column + 0.5) * step;
      let v = (row + 0.5) / rows;
      if (hex && row % 2 === 1) {
        // Every other row is pushed half a step sideways, which is what puts the
        // dots of two rows in the dents of each other.
        u += step * 0.5;
      }
      if (layout === "scatter") {
        // The jitter stays inside the cell, so no two dots cross over and the
        // picture keeps its density.
        u += (rand() - 0.5) * step * 0.7;
        v += (rand() - 0.5) * step * 0.7;
      }
      // A hex row can push a dot past the rim; wrapping keeps the picture full.
      if (u > 1) u -= 1;
      places.push({ u, v });
    }
  }
  return places;
}

/** The controls of this picture, read back in the types they are declared with. */
function controlsOf(input: FamilyInput): {
  source: Source;
  layout: Layout;
  weight: number;
  floor: number;
  angle: number;
  softness: number;
  wash: number;
} {
  // The engine has checked every value against the controls this family
  // declares, so the casts only recover the types that were lost on the way in.
  const extra = input.extra;
  return {
    source: extra.source as Source,
    layout: extra.layout as Layout,
    weight: extra.weight as number,
    floor: extra.floor as number,
    angle: extra.angle as number,
    softness: extra.softness as number,
    wash: extra.wash as number,
  };
}

/**
 * Draws the picture: the dots, the backdrop they stand on, and the filter that
 * softens them.
 *
 * @remarks
 * Every dot takes its size and its color from the field at its own place: where
 * the field is strong, the dot is large and takes a vivid tone of a hue further
 * along the palette; where it is weak, the dot shrinks to the floor radius and
 * fades back. A dot on a field that has faded away is left out entirely, so a
 * weak part of the source stays open instead of turning into a wash of equal
 * dots. The result is a gradient or a figure, resolved into dots.
 */
function drawPolka(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const controls = controlsOf(input);
  const field = FIELDS[controls.source](controls);
  const places = dotPlaces(controls.layout, density, rand);
  // Everything from here on is in px, because that is what the markup uses.
  const step = size / density;
  // A dot never falls below the floor, so the biggest one has to be at least as
  // big — a fine grid must not end up smaller than the floor radius.
  const maxRadius = Math.max(controls.floor, step * 0.5 * controls.weight);
  const dots: string[] = [];

  for (const place of places) {
    const strength = clamp(field(place.u, place.v), 0, 1);
    if (strength <= 0) continue;
    // Every dot is stamped a little differently than its place in the field
    // asks for, in size as well as in tone. That is what the seed works on: the
    // field still decides the figure, but which dot sits where and how firmly
    // it was pressed down is a new picture every time.
    const stamp = 1 + (rand() - 0.5) * STAMP_RANGE;
    const radius = (controls.floor + (maxRadius - controls.floor) * strength) * stamp;
    // The field picks the hue: a weak dot takes the first band of the palette,
    // the strongest the last, so the picture runs through the whole palette.
    const band =
      palette.bands[
        Math.min(palette.bands.length - 1, Math.floor(strength * palette.bands.length))
      ];
    // The dots also brighten with the field, and the strongest ones carry the
    // full alpha while the weak ones fade back.
    const sat = 40 + 50 * strength;
    const light = (30 + 50 * strength) * stamp;
    const alpha = palette.opacity * (0.35 + 0.65 * strength);
    const cx = place.u * size;
    const cy = place.v * size;
    dots.push(
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(radius)}" fill="${color(band, sat, light, alpha)}"/>`,
    );
  }

  // The filter is always declared, so the picture stays valid markup; it is only
  // referenced when the settings ask for a wash.
  const soften = controls.wash > 0 ? ` filter="url(#soften)"` : "";
  const defs = [
    "  <defs>",
    '    <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">',
    `      <feGaussianBlur stdDeviation="${fmt(controls.wash)}"/>`,
    "    </filter>",
    "  </defs>",
  ].join("\n");
  // The backdrop is the deep tone of the picture's own first hue, so the dots
  // always have something to stand out against. It is laid down oversized, by
  // the corner-to-corner measure of the picture: a turned picture is a turned
  // square, and only the bigger one still covers the box at every angle.
  const cover = Math.SQRT2;
  const backX = -((cover - 1) * size) / 2;
  const backdrop = `<rect x="${fmt(backX)}" y="${fmt(backX)}" width="${fmt(size * cover)}" height="${fmt(size * cover)}" fill="${palette.paper}"${soften}/>`;

  return [
    defs,
    backdrop,
    `  <g${soften}>`,
    dots.length > 0 ? `    ${dots.join("\n    ")}` : "",
    "  </g>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/** The polka pattern. */
export const polka: Family = {
  id: "polka",
  kind: "picture",
  size: { min: 160, max: 1200, step: 10 },
  density: { min: 6, max: 90, step: 1 },
  densityDefault: 28,
  controls: [
    { kind: "choice", key: "source", values: SOURCES, start: "linearLeft" },
    { kind: "choice", key: "layout", values: LAYOUTS, start: "grid" },
    { kind: "range", key: "weight", range: RANGES.weight, start: 0.55 },
    { kind: "range", key: "floor", range: RANGES.floor, start: 0.6 },
    { kind: "range", key: "angle", range: RANGES.angle, start: 0 },
    { kind: "range", key: "softness", range: RANGES.softness, start: 0.08 },
    { kind: "range", key: "wash", range: RANGES.wash, start: 0 },
  ],
  draw: drawPolka,
};
