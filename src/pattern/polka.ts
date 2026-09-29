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
import type { Family, FamilyInput, Palette } from "./types";

/** What the dots trace: a gradient, or a figure. The angle turns either one. */
const SOURCES = ["linear", "radial", "circle", "ring", "heart", "wave"] as const;

/** One of the things the dots can trace. */
type Source = (typeof SOURCES)[number];

/** How the dots of a picture are placed. */
export const POLKA_LAYOUTS = ["grid", "hex", "scatter"] as const;

/** One of the ways the dots can be placed. */
export type PolkaLayout = (typeof POLKA_LAYOUTS)[number];

/** How the dots of a picture are shaped. */
export const POLKA_SHAPES = ["dot", "square", "hexagon"] as const;

/** One of the shapes a dot can have. */
export type PolkaShape = (typeof POLKA_SHAPES)[number];

/**
 * How wide a shape is, in px, when it reaches 1 px from its middle: a dot and a
 * square are twice that, a hexagon √3 times, because it stands on a corner.
 *
 * @remarks
 * The one table answers both questions the drawing asks, and it answers them the
 * same way for every shape: a weight of 1 fills a whole cell, and a floor of n
 * px makes the smallest shape n px wide.
 */
const WIDTH: Record<PolkaShape, number> = {
  dot: 2,
  square: 2,
  hexagon: Math.sqrt(3),
};

/**
 * The corners of a hexagon that reaches 1 from its middle, with one corner
 * straight up and one straight down: the way a honeycomb sits in its lattice.
 *
 * @remarks
 * Such a shape is √3 wide and 2 tall, so it fits a lattice that steps sideways
 * by a cell and downwards by √3/2 of a cell, with every other row pushed half a
 * cell to the side.
 */
const HEX_CORNERS = Array.from({ length: 6 }, (_, corner) => {
  const angle = ((90 + corner * 60) * Math.PI) / 180;
  return [Math.cos(angle), -Math.sin(angle)] as const;
});

/**
 * The range of every control this picture shares with a page of its own, so a
 * second page can offer the same sliders with the same limits.
 */
export const POLKA_RANGES = {
  // A weight of 1 makes the biggest shape touch its neighbours exactly, so past 1
  // the dots overlap and the field of dots grows into blobs.
  weight: { min: 0.05, max: 1.5, step: 0.05 },
  // The width of the smallest shape in px: a weak part of the field keeps a
  // shape of its own, instead of fading out completely. The top of the range is
  // about as wide as a cell, which is where every shape looks the same.
  floor: { min: 0, max: 8, step: 0.1 },
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
export type Field = (u: number, v: number) => number;

/** How a source turns the settings into the field it draws. */
type FieldBuilder = (settings: { softness: number }) => Field;

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
 * A builder only reads the settings its own source cares about, so the softness
 * reaches the figures and nothing else has to know about it. The angle reaches
 * no builder at all: it turns the finished field, whatever the source is.
 */
const FIELDS: Record<Source, FieldBuilder> = {
  // A gradient running from the left edge to the right edge. The angle turns it
  // like any other source.
  linear: () => (u) => u,
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
 * Turns a field about the middle of the picture, so the source leans while the
 * dots keep the grid they sit in.
 *
 * @remarks
 * The angle belongs to the field and not to a single source: a gradient runs in
 * the direction the angle names, and a disc, a ring, a heart or a set of stripes
 * tilts with it. Turning works by asking the field where it would stand if the
 * picture turned the other way, so a place that turns out of the picture counts
 * as 0 — the same as the edge of the picture, which is what a source fades out at
 * anyway.
 *
 * @param field - The field of the chosen source.
 * @param angle - Degrees to turn it by. 0 leaves the field as it is.
 * @returns The turned field.
 */
function turn(field: Field, angle: number): Field {
  if (angle === 0) return field;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return (u, v) => {
    const x = u - 0.5;
    const y = v - 0.5;
    // The place the field is asked about, with the turn taken back.
    const turnedU = 0.5 + x * cos + y * sin;
    const turnedV = 0.5 - x * sin + y * cos;
    // Outside the picture there is no source to trace, so it stays empty.
    if (turnedU < 0 || turnedU > 1 || turnedV < 0 || turnedV > 1) return 0;
    return field(turnedU, turnedV);
  };
}

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
  layout: PolkaLayout,
  columns: number,
  rows: number,
  rand: () => number,
): { u: number; v: number }[] {
  const du = 1 / columns;
  const dv = 1 / rows;
  const places: { u: number; v: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let u = (column + 0.5) * du;
      let v = (row + 0.5) * dv;
      if (layout === "hex" && row % 2 === 1) {
        // Every other row is pushed half a step sideways, which is what puts the
        // dots of two rows in the dents of each other.
        u += du * 0.5;
      }
      if (layout === "scatter") {
        // The jitter stays inside the cell, so no two dots cross over and the
        // picture keeps its density.
        u += (rand() - 0.5) * du * 0.7;
        v += (rand() - 0.5) * dv * 0.7;
      }
      // A hex row can push a dot past the rim; wrapping keeps the picture full.
      if (u > 1) u -= 1;
      places.push({ u, v });
    }
  }
  return places;
}

/**
 * How many rows of dots the picture takes.
 *
 * @remarks
 * The cells stay square, so the dots stay round however the picture is shaped: a
 * square grid and a scattered field take as many rows as the height asks for. A
 * honeycomb sits closer together — the vertical distance of a cell is its
 * diagonal, √3/2 of its side — so it needs more rows to fill the height, and they
 * are spread over the whole height again, which keeps every row the same distance
 * from the next.
 */
function rowsFor(layout: PolkaLayout, columns: number, width: number, height: number): number {
  const aspect = height / width;
  if (layout !== "hex") return Math.max(1, Math.round(aspect * columns));
  return Math.max(1, Math.ceil(aspect * columns * (2 / Math.sqrt(3))));
}

/**
 * The markup of one shape of the field of dots.
 *
 * @remarks
 * The number that comes in is how far the shape reaches from its middle: a dot
 * that far around, a square that far to every side, a hexagon that far out to
 * its corners. One function for all of them, so a new shape is one more case
 * here and nothing else in the drawing has to know about it.
 */
function shapeMarkup(
  shape: PolkaShape,
  cx: number,
  cy: number,
  size: number,
  fill: string,
): string {
  if (shape === "square") {
    return `<rect x="${fmt(cx - size)}" y="${fmt(cy - size)}" width="${fmt(size * 2)}" height="${fmt(size * 2)}" fill="${fill}"/>`;
  }
  if (shape === "hexagon") {
    const corners = HEX_CORNERS.map(([x, y]) => `${fmt(cx + x * size)} ${fmt(cy + y * size)}`);
    return `<polygon points="${corners.join(" ")}" fill="${fill}"/>`;
  }
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(size)}" fill="${fill}"/>`;
}

/** The controls of this picture, read back in the types they are declared with. */
function controlsOf(input: FamilyInput): {
  source: Source;
  layout: PolkaLayout;
  shape: PolkaShape;
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
    layout: extra.layout as PolkaLayout,
    shape: extra.shape as PolkaShape,
    weight: extra.weight as number,
    floor: extra.floor as number,
    angle: extra.angle as number,
    softness: extra.softness as number,
    wash: extra.wash as number,
  };
}

/** What the dots of a picture need to know, besides the field they follow. */
export interface DotOptions {
  /** The width of the picture in px. */
  width: number;
  /** The height of the picture in px. */
  height: number;
  /** How the dots are placed. */
  layout: PolkaLayout;
  /** How the dots are shaped. */
  shape: PolkaShape;
  /** How many columns of dots the picture takes. */
  columns: number;
  /** How big the strongest shape may get, as a share of a cell. */
  weight: number;
  /** How wide the smallest shape may get, in px. */
  floor: number;
  /** How far the dots are blurred, in px; 0 leaves them sharp. */
  wash: number;
  /** The colors of the picture. */
  palette: Palette;
  /** The random numbers of the seed. */
  rand: () => number;
}

/**
 * Draws a field as a picture of dots: the dots, the backdrop they stand on, and
 * the filter that softens them.
 *
 * @remarks
 * Every dot takes its size and its color from the field at its own place: where
 * the field is strong, the dot is large and takes a vivid tone of a hue further
 * along the palette; where it is weak, the dot shrinks to the floor radius and
 * fades back. A dot on a field that has faded away is left out entirely, so a
 * weak part of the source stays open instead of turning into a wash of equal
 * dots. The result is a gradient or a figure, resolved into dots.
 *
 * A page that has a field of its own — a gradient, a figure, or the brightness
 * of an image — hands it in here, and gets the same dots, the same colors and
 * the same hand-stamped look out of it.
 */
export function drawDots(field: Field, options: DotOptions): string {
  const { width, height, layout, shape, columns, weight, floor, wash, palette, rand } = options;
  const rows = rowsFor(layout, columns, width, height);
  const places = dotPlaces(layout, columns, rows, rand);
  // Everything from here on is in px, because that is what the markup uses.
  const cell = width / columns;
  // The weight and the floor are both read as a width and turned into the reach
  // of the shape: a weight of 1 fills a whole cell, and the floor is as wide as
  // the user asked. Both are widths, so the same number means the same thing for
  // a dot, a square and a hexagon.
  const minSize = floor / WIDTH[shape];
  // A shape never falls below the floor, so the biggest one has to be at least
  // as big — a fine grid must not end up smaller than the floor.
  const maxSize = Math.max(minSize, (cell * weight) / WIDTH[shape]);
  const dots: string[] = [];

  for (const place of places) {
    const strength = clamp(field(place.u, place.v), 0, 1);
    if (strength <= 0) continue;
    // Every dot is stamped a little differently than its place in the field
    // asks for, in size as well as in tone. That is what the seed works on: the
    // field still decides the figure, but which dot sits where and how firmly
    // it was pressed down is a new picture every time. The stamp works on what
    // grows out of the floor, so it can never press a dot below it.
    const stamp = 1 + (rand() - 0.5) * STAMP_RANGE;
    const size = minSize + (maxSize - minSize) * strength * stamp;
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
    dots.push(
      shapeMarkup(shape, place.u * width, place.v * height, size, color(band, sat, light, alpha)),
    );
  }

  // The filter is always declared, so the picture stays valid markup; it is only
  // referenced when the settings ask for a wash.
  const soften = wash > 0 ? ` filter="url(#soften)"` : "";
  const defs = [
    "  <defs>",
    '    <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">',
    `      <feGaussianBlur stdDeviation="${fmt(wash)}"/>`,
    "    </filter>",
    "  </defs>",
  ].join("\n");
  // The backdrop is the deep tone of the picture's own first hue, so the dots
  // always have something to stand out against. It is laid down oversized, by
  // the corner-to-corner measure of the picture: a turned picture is a turned
  // rectangle, and only the bigger one still covers the box at every angle.
  const cover = Math.SQRT2;
  const backX = -((cover - 1) * width) / 2;
  const backY = -((cover - 1) * height) / 2;
  const backdrop = `<rect x="${fmt(backX)}" y="${fmt(backY)}" width="${fmt(width * cover)}" height="${fmt(height * cover)}" fill="${palette.paper}"${soften}/>`;

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

/**
 * Draws the picture of this family: the field of the chosen source, turned by
 * the angle, and then the dots that follow it.
 */
function drawPolka(input: FamilyInput): string {
  const { rand, size, density, palette } = input;
  const controls = controlsOf(input);
  // The angle turns the field of whichever source is chosen, so it reaches every
  // source and not only the gradient.
  const field = turn(FIELDS[controls.source](controls), controls.angle);

  return drawDots(field, {
    width: size,
    height: size,
    layout: controls.layout,
    shape: controls.shape,
    columns: density,
    weight: controls.weight,
    floor: controls.floor,
    wash: controls.wash,
    palette,
    rand,
  });
}

/** The polka pattern. */
export const polka: Family = {
  id: "polka",
  kind: "picture",
  size: { min: 160, max: 1200, step: 10 },
  density: { min: 6, max: 90, step: 1 },
  densityDefault: 28,
  controls: [
    { kind: "choice", key: "source", values: SOURCES, start: "linear" },
    { kind: "choice", key: "layout", values: POLKA_LAYOUTS, start: "grid" },
    { kind: "choice", key: "shape", values: POLKA_SHAPES, start: "dot" },
    { kind: "range", key: "weight", range: POLKA_RANGES.weight, start: 0.55 },
    { kind: "range", key: "floor", range: POLKA_RANGES.floor, start: 0.6 },
    { kind: "range", key: "angle", range: POLKA_RANGES.angle, start: 0 },
    { kind: "range", key: "softness", range: POLKA_RANGES.softness, start: 0.08 },
    { kind: "range", key: "wash", range: POLKA_RANGES.wash, start: 0 },
  ],
  draw: drawPolka,
};
