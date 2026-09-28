/**
 * Random closed paths for the endless morph demo.
 *
 * @remarks
 * The morph demo shows one shape after another, so every shape is a closed path
 * of the same kind: a ring of points around a centre. That common ground is what
 * lets MorphSVGPlugin move one shape into the next.
 *
 * Four looks are available, and every shape picks one of them at random:
 *
 * - `blob` — a soft, organic silhouette: the points lie close to the rim and are
 *   joined by smooth curves.
 * - `polygon` — a spiky star: long and short points alternate, joined by
 *   straight lines.
 * - `silhouette` — an irregular outline: every point lands anywhere between the
 *   centre and the rim, so the shape is sometimes almost round and sometimes
 *   shrunk to a crag.
 * - `islands` — two or three separate blobs, each with its own place and its own
 *   size, so the shape is a small group instead of one single outline.
 *
 * Every shape also gets its own overall size, so a small one after a large one
 * reads as something new even before the outline is looked at closely.
 *
 * This module is pure — it computes a `d` string and never touches the DOM.
 *
 * @example
 * ```ts
 * const d = randomPath();                    // a random look
 * const blob = randomPath({ style: "blob" }); // a named one
 * ```
 */

/** The looks a random path can have. */
export const PATH_STYLES = ["blob", "polygon", "silhouette", "islands"] as const;

/** One of the looks a random path can have. */
export type PathStyle = (typeof PATH_STYLES)[number];

/** A point of a path, in the coordinate system of the viewBox. */
interface Point {
  x: number;
  y: number;
}

/** How the random paths are drawn. */
export interface RandomPathOptions {
  /** The look to draw. One of the four is picked when this is left out. */
  style?: PathStyle;
  /** Side length of the square the path is drawn in. */
  size?: number;
}

const FULL_TURN = Math.PI * 2;

/**
 * Picks one of the four looks at random.
 *
 * @returns The picked look.
 */
export function randomPathStyle(): PathStyle {
  const index = Math.floor(Math.random() * PATH_STYLES.length);
  return PATH_STYLES[index] ?? "blob";
}

/**
 * Draws a random closed path.
 *
 * @remarks
 * The points sit on even steps around a circle, each with its own radius, and
 * the radius of a step is what gives the shape its look. The base radius of that
 * circle is drawn at random as well, so shapes differ in size and not only in
 * outline. Nothing here is seeded, so two calls never promise the same shape.
 *
 * @param options - The look and the size of the square to draw in.
 * @returns The path as a `d` string, ready for a `path` element.
 */
export function randomPath(options: RandomPathOptions = {}): string {
  const style = options.style ?? randomPathStyle();
  const size = options.size ?? 400;
  const centre = size / 2;
  // A size of its own for every shape: from a tenth of the square up to nearly
  // its full half, so a large shape is followed by a small one from time to time.
  const base = size * (0.1 + 0.32 * Math.random());
  if (style === "islands") {
    // Several separate blobs, each with its own place and its own size.
    return islandPath(centre, size);
  }
  if (style === "blob") {
    // Few points, all near the rim, joined smoothly: an organic silhouette.
    const count = 7 + Math.floor(Math.random() * 5);
    return smoothPath(ring(count, () => 0.78 + 0.22 * Math.random(), centre, base));
  }
  if (style === "polygon") {
    // Long and short points alternate, joined by straight lines: a spiky star.
    const count = 5 + Math.floor(Math.random() * 4);
    const spikes = ring(
      count,
      (index) => (index % 2 === 0 ? 1 : 0.4 + 0.2 * Math.random()),
      centre,
      base,
    );
    return angularPath(spikes);
  }
  // Every radius is anywhere between a quarter of the rim and the rim itself:
  // the same ring, wildly irregular.
  const count = 6 + Math.floor(Math.random() * 5);
  return angularPath(ring(count, () => 0.25 + 0.75 * Math.random(), centre, base));
}

/**
 * Lays out two or three separate blobs around a centre.
 *
 * @remarks
 * Every island is a closed ring of its own with its own size, placed somewhere
 * around the centre — so the result is a small group of shapes, not one single
 * outline. The islands are written as separate subpaths in one `d` string, which
 * keeps them a single path element and lets MorphSVGPlugin move all of them at
 * once.
 *
 * @param centre - The middle the islands are placed around.
 * @param size - Side length of the square the islands are drawn in.
 * @returns The path as a `d` string, with one closed subpath per island.
 */
function islandPath(centre: number, size: number): string {
  const count = 2 + Math.floor(Math.random() * 2);
  let d = "";
  for (let index = 0; index < count; index += 1) {
    // Each island sits somewhere around the centre, at its own distance, and is
    // smaller than a single shape would be, so the group stays inside the square.
    const angle = Math.random() * FULL_TURN;
    const distance = size * (0.1 + 0.14 * Math.random());
    const base = size * (0.09 + 0.08 * Math.random());
    const points = ring(
      5 + Math.floor(Math.random() * 4),
      () => 0.7 + 0.3 * Math.random(),
      0,
      base,
    );
    const island = points.map((point) => ({
      x: round(centre + Math.cos(angle) * distance + point.x),
      y: round(centre + Math.sin(angle) * distance + point.y),
    }));
    d += smoothPath(island);
  }
  return d;
}

/**
 * Lays out the points of a ring: even steps around a circle, each with the
 * radius the given function asks for.
 *
 * @param count - How many points the ring has.
 * @param radius - The radius of a step, as a share of the base radius.
 * @param centre - The centre of the ring.
 * @param base - The radius a share of 1 stands for.
 * @returns The points of the ring.
 */
function ring(
  count: number,
  radius: (index: number) => number,
  centre: number,
  base: number,
): Point[] {
  const points: Point[] = [];
  const step = FULL_TURN / count;
  for (let index = 0; index < count; index += 1) {
    // The step is jittered a little, so the ring is not a perfect wheel.
    const jitter = (Math.random() - 0.5) * 0.6 * step;
    const angle = index * step + jitter;
    const distance = base * radius(index);
    points.push({
      x: round(centre + Math.cos(angle) * distance),
      y: round(centre + Math.sin(angle) * distance),
    });
  }
  return points;
}

/**
 * Rounds a coordinate to a tenth, so that the path stays short to read.
 *
 * @param value - The coordinate to round.
 * @returns The rounded coordinate.
 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Joins the points of a ring with straight lines.
 *
 * @param points - The points to join.
 * @returns The path as a `d` string.
 */
function angularPath(points: Point[]): string {
  const [first] = points;
  if (!first) return "";
  let d = `M ${first.x} ${first.y}`;
  for (const point of points.slice(1)) d += ` L ${point.x} ${point.y}`;
  return `${d} Z`;
}

/**
 * Joins the points of a ring with one smooth curve per point, which uses the
 * point as the control of the curve between its two neighbours.
 *
 * @remarks
 * The curve runs from the midpoint of a step to the midpoint of the next one and
 * only bows out to the point between them, so every point is passed through and
 * nothing has to be calculated to keep the shape seamless at the closing step.
 *
 * @param points - The points to join.
 * @returns The path as a `d` string.
 */
function smoothPath(points: Point[]): string {
  // The midpoints are averaged from the points, so they are rounded as well —
  // otherwise the path carries full float precision out of the division.
  const midpoints = points.map((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    return { x: round((point.x + next.x) / 2), y: round((point.y + next.y) / 2) };
  });
  const first = midpoints[0];
  if (!first) return "";
  let d = `M ${first.x} ${first.y}`;
  for (const [index, point] of points.entries()) {
    const next = midpoints[(index + 1) % midpoints.length] ?? point;
    d += ` Q ${point.x} ${point.y} ${next.x} ${next.y}`;
  }
  return `${d} Z`;
}
