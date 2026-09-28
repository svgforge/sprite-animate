/**
 * What a pattern is: the types that the pattern files and the engine share.
 *
 * @remarks
 * A pattern of the Pattern Studio lives in its own file beside this one and is
 * put together by `index.ts`, which collects them into the list the studio, the
 * presets and the renderer all work with. This module only describes what a
 * pattern brings and what it gets to draw with — it draws nothing itself.
 *
 * @example
 * ```ts
 * export const dots: Family = {
 *   id: "dots",
 *   kind: "tile",
 *   size: { min: 40, max: 400, step: 10 },
 *   density: { min: 4, max: 24, step: 1 },
 *   densityDefault: 8,
 *   controls: [],
 *   draw: buildDots,
 * };
 * ```
 */

/** Id of a pattern. Adding a pattern means adding its id here and a file beside it. */
export type FamilyId =
  | "dots"
  | "triangles"
  | "waves"
  | "chevrons"
  | "bullseye"
  | "rhombus"
  | "handdrawn"
  | "polka";

/** A closed range of numbers, with the step a control moves in. */
export interface Range {
  min: number;
  max: number;
  step: number;
}

/**
 * A control a pattern brings for itself, beyond the sliders the card shares.
 *
 * @remarks
 * A range is a slider and a choice is a list of values, and `start` is the value a
 * fresh pattern of this family begins with. The words a control is shown with are
 * presentation and belong to the UI, which reads the key and the values.
 */
export type Control = RangeControl | ChoiceControl;

/** A control a pattern brings for itself, as a slider over a range of numbers. */
export interface RangeControl {
  kind: "range";
  key: string;
  range: Range;
  start: number;
}

/** A control a pattern brings for itself, as a list of values to pick from. */
export interface ChoiceControl {
  kind: "choice";
  key: string;
  values: readonly string[];
  start: string;
}

/**
 * A pattern as the engine knows it: the ranges its numbers live in, the controls
 * it brings for itself, and the function that draws it.
 *
 * @remarks
 * A tile repeats across the page without a visible seam, a picture is drawn once
 * and fills the box it is put into. The name and the description of a pattern are
 * presentation and belong to the UI.
 */
export interface Family {
  /** Id under which the pattern is selected. */
  id: FamilyId;
  /** How the pattern covers the page: a tile repeats, a picture is drawn once. */
  kind: "tile" | "picture";
  /** Edge length of what the pattern draws — a tile edge or a picture edge. */
  size: Range;
  /** How much the pattern draws, counted in the unit of the pattern. */
  density: Range;
  /** Density a fresh pattern of this family starts with. */
  densityDefault: number;
  /** The controls this pattern adds to the card, in the order they appear. */
  controls: Control[];
  /** Draws the pattern: its shapes, at the size the engine hands over. */
  draw: (input: FamilyInput) => string;
}

/**
 * What a pattern gets to draw with: the numbers it needs, already cleaned up by
 * the engine.
 */
export interface FamilyInput {
  /** Seeded random source, returning numbers from 0 (inclusive) to 1 (exclusive). */
  rand: () => number;
  /** Edge length of what is drawn, in px. */
  size: number;
  /** How much to draw, counted in the unit of the pattern. */
  density: number;
  /** The colors the settings resolved to. */
  palette: Palette;
  /** The values of the pattern's own controls, checked against what it declares. */
  extra: Record<string, number | string>;
}

/**
 * One hue of the palette as a light and a deep tone.
 *
 * @remarks
 * The triangle pattern uses the pair to give a plane a shaded, faceted look, the
 * way one side catches the light and the other turns away.
 */
export interface Facet {
  /** Pale, desaturated tone — a plane turned toward the light. */
  light: string;
  /** Saturated, darker tone — a plane turned away. */
  deep: string;
}

/** The colors of a pattern, resolved from the settings before anything is drawn. */
export interface Palette {
  /** The hue of every band of the palette, for a pattern that mixes its own colors. */
  bands: number[];
  /** Softer colors, for surfaces. */
  fills: string[];
  /** Vivid colors, for strokes. */
  inks: string[];
  /** Light/deep pairs of each hue, for patterns that shade a plane. */
  facets: Facet[];
  /** The deepest tone of the first band — a backdrop for a pattern that brings one. */
  paper: string;
  /** The alpha every color of the palette starts from. */
  opacity: number;
}

/**
 * A pattern, as the numbers it is drawn from.
 *
 * @remarks
 * These are the pattern itself, nothing else. What a page does with the result —
 * which colors it shows, how big the pattern is on screen, which family is
 * called what — belongs to the UI and never reaches the engine.
 */
export interface PatternSettings {
  /** The family that draws the pattern. */
  family: FamilyId;
  /** Start value of the generator. The same seed always gives the same pattern. */
  seed: number;
  /** Edge length of what is drawn, in px. Rendered clamped to the range of the family. */
  size: number;
  /** How much the family draws, counted in the unit of the family. */
  density: number;
  /** Alpha the palette starts from; the other colors fade from it. 0..1. */
  opacity: number;
  /** Number of distinct hues in the palette. 1..8. */
  colors: number;
  /** Hue the palette starts at, in degrees. 0..360. */
  hue: number;
  /** Rotation of the whole field, in degrees. */
  rotation: number;
  /** The values of the family's own controls, by the control's key. */
  extra: Record<string, number | string>;
}

/**
 * The canvas a pattern is drawn onto.
 *
 * @remarks
 * The engine does not decide how large a page is or what color it has: only the
 * caller knows that, because the caller is the one that has a page.
 */
export interface Canvas {
  /** Width of the document in px. */
  width: number;
  /** Height of the document in px. */
  height: number;
  /** Color painted behind the pattern, e.g. the page background. */
  background: string;
}
