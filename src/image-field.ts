/**
 * Turning an image the user picked into a field the dots can follow.
 *
 * @remarks
 * The polka pattern of `./pattern` traces a field: a function that says how
 * strong a source is at a place on the picture. A gradient or a figure builds
 * such a field in closed form, an image cannot — its brightness is only known
 * pixel by pixel. So the image is read once into a grid of brightness values,
 * and this module hands out a field that reads that grid. From there on the dots
 * of the polka pattern do their usual work: this is the same picture a gradient
 * makes, with a photograph as its source.
 *
 * The grid is sampled in the browser, because that is the only place a picture
 * can be opened: a canvas draws the image, and the pixels it hands back are
 * turned into brightness here. The size of the grid is chosen by the page
 * through the working edge, so a big photo does not cost more than a small one.
 */

import type { Field } from "./pattern/polka";
import { clamp } from "./pattern/shared";

/** How much of the red, green and blue a pixel contributes to its brightness. */
const RED = 0.2126;
const GREEN = 0.7152;
const BLUE = 0.0722;

/** How bright a pixel counts: a middle tone of a middle strength. */
const HALF = 0.5;

/** The brightest cell of the grid is 1, the darkest 0. */
const FULL = 1;

/**
 * The brightness of an image, sampled on a grid of cells.
 */
export interface Luminance {
  /** The brightness of every cell, row by row, from 0 (dark) to 1 (light). */
  cells: number[];
  /** How many cells one row has. */
  columns: number;
  /** How many rows of cells there are. */
  rows: number;
  /** The width of the original image in px, so a picture can keep its shape. */
  width: number;
  /** The height of the original image in px, so a picture can keep its shape. */
  height: number;
}

/**
 * How the image is read before the dots see it.
 */
export interface ImageTone {
  /** How hard the bright and the dark parts are pulled apart, 0..1. */
  contrast: number;
  /** How much the whole image is shifted, 0..1; below the middle it darkens. */
  brightness: number;
}

/**
 * Reads an image file into a grid of brightness values.
 *
 * @remarks
 * The image is drawn onto a canvas of at most `workingEdge` px on its longest
 * side, so the grid stays small no matter how large the photo is. A dot of the
 * picture covers many cells, and the field is read between them, so a small grid
 * loses nothing the dots could show.
 *
 * @param file - The image the user picked.
 * @param workingEdge - The longest side the grid is sampled at, in px.
 * @returns The brightness of the image and the size it has.
 */
export async function readLuminance(file: File, workingEdge = 320): Promise<Luminance> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, workingEdge / Math.max(image.width, image.height));
    const columns = Math.max(1, Math.round(image.width * scale));
    const rows = Math.max(1, Math.round(image.height * scale));
    const context = drawAt(image, columns, rows);
    const { data } = context.getImageData(0, 0, columns, rows);
    const cells: number[] = [];
    for (let pixel = 0; pixel < columns * rows; pixel += 1) {
      const at = pixel * 4;
      cells.push((RED * data[at] + GREEN * data[at + 1] + BLUE * data[at + 2]) / 255);
    }
    return { cells, columns, rows, width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The field of a grid of brightness, with the tone of the page put on top.
 *
 * @remarks
 * A place on the picture is read between the four cells around it, so the dots
 * see a smooth picture and not the steps of the grid. The brightness shifts the
 * whole field up or down, the contrast pulls the middle apart, and what falls
 * outside 0..1 is cut off, which is how a faint part of a photo becomes empty
 * paper instead of a wash of equal dots.
 *
 * @param luminance - The brightness of the image.
 * @param tone - How the image should read.
 * @returns The field the dots follow.
 */
export function fieldOf(luminance: Luminance, tone: ImageTone): Field {
  const { cells, columns, rows } = luminance;
  const shift = tone.brightness - HALF;
  const spread = tone.contrast * 2;

  return (u, v) => {
    // The place is read in cell units, between the four cells around it.
    const x = clamp(u, 0, 1) * (columns - 1);
    const y = clamp(v, 0, 1) * (rows - 1);
    const left = Math.floor(x);
    const top = Math.floor(y);
    const right = Math.min(left + 1, columns - 1);
    const bottom = Math.min(top + 1, rows - 1);
    const across = x - left;
    const down = y - top;
    const topLeft = cells[top * columns + left];
    const topRight = cells[top * columns + right];
    const bottomLeft = cells[bottom * columns + left];
    const bottomRight = cells[bottom * columns + right];
    const upper = topLeft + (topRight - topLeft) * across;
    const lower = bottomLeft + (bottomRight - bottomLeft) * across;
    const value = upper + (lower - upper) * down;

    return clamp((value + shift - HALF) * spread + HALF, 0, FULL);
  };
}

/**
 * Loads an image from a URL, so the pixels can be read.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("The image could not be read.")), {
      once: true,
    });
    image.src = url;
  });
}

/**
 * Draws an image onto a canvas of the given size and hands back its context.
 */
function drawAt(image: HTMLImageElement, columns: number, rows: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot read an image into a canvas.");
  context.drawImage(image, 0, 0, columns, rows);
  return context;
}
