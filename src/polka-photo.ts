/**
 * Polka from a photo: the control card of demo5 as a reusable controller.
 *
 * @remarks
 * The page reads an image the user picks and turns it into a picture of dots.
 * Everything the picture is made of comes from the pattern engine, so this is
 * the same picture the studio draws — the `Slider` of the shared card, the dot
 * drawing of the polka family, the palette of the engine and the file output of
 * `./svg-file`. The one thing this page brings is the source: an image instead of
 * a gradient, read into a field by `./image-field`.
 *
 * Every element is looked up by id inside a root, so a page only has to provide
 * the markup, and the card can also be mounted into a part of a page. The card
 * shows a picture, so every control is there from the start: nothing comes and
 * goes while the user works. The image lies under the dots in the same box, and
 * a crossfade moves between the two layers — that slider is no slider of the
 * dots, so it neither redraws them nor is touched by the random buttons.
 *
 * @example
 * The whole page, with the markup already in place:
 *
 * ```ts
 * mountPolkaPhoto();
 * ```
 */
import { fieldOf, type Luminance, readLuminance } from "./image-field";
import type { JDSelectElement } from "./jd-select";
import { solidColors } from "./pattern";
import {
  drawDots,
  POLKA_LAYOUTS,
  POLKA_RANGES,
  POLKA_SHAPES,
  type PolkaLayout,
  type PolkaShape,
  polka,
} from "./pattern/polka";
import { clamp, mulberry32, palette } from "./pattern/shared";
import { Slider } from "./pattern-studio";
import { copySvg, downloadSvg, setFileStatus } from "./svg-file";

/** The sliders of the card, in the order of the markup. */
const SLIDER_KEYS = [
  "count",
  "weight",
  "floor",
  "contrast",
  "brightness",
  "wash",
  "opacity",
  "colors",
  "hue",
] as const;

/** The id of a slider of the card. */
type SliderKey = (typeof SLIDER_KEYS)[number];

/**
 * The limits of every slider of the card, in one place.
 *
 * @remarks
 * The three sliders the dots themselves use are taken from the polka family, so
 * this page and the studio cannot offer the same picture at two different limits.
 */
const RANGES = {
  // How many columns of dots the picture takes.
  count: { min: 6, max: 90, step: 1 },
  weight: POLKA_RANGES.weight,
  floor: POLKA_RANGES.floor,
  contrast: { min: 0, max: 1, step: 0.01 },
  brightness: { min: 0, max: 1, step: 0.01 },
  wash: POLKA_RANGES.wash,
  opacity: { min: 0.1, max: 1, step: 0.05 },
  colors: { min: 1, max: 8, step: 1 },
  hue: { min: 0, max: 360, step: 1 },
} as const;

/** The words the layout chooser shows for its options. */
const LAYOUT_TEXTS: Record<PolkaLayout, string> = {
  grid: "Grid",
  hex: "Hex",
  scatter: "Scatter",
};

/** The words the shape chooser shows for its options. */
const SHAPE_TEXTS: Record<PolkaShape, string> = {
  dot: "Dot",
  square: "Square",
  hexagon: "Hexagon",
};

/** What the picture area says before an image has been picked. */
const PLACEHOLDER = "Pick an image — it comes back as dots.";

/** The layout and the shape a card starts with. */
const FIRST_LAYOUT: PolkaLayout = "grid";
const FIRST_SHAPE: PolkaShape = "dot";

/**
 * The elements this card drives, found once.
 */
interface PhotoUi {
  stage: HTMLElement | null;
  fileInput: HTMLInputElement | null;
  source: HTMLImageElement | null;
  layoutSelect: JDSelectElement | null;
  shapeSelect: JDSelectElement | null;
  seedInput: HTMLInputElement | null;
  seedRandomButton: HTMLButtonElement | null;
  randomButton: HTMLButtonElement | null;
  downloadButton: HTMLButtonElement | null;
  copyButton: HTMLButtonElement | null;
  status: HTMLElement | null;
  sliders: Record<SliderKey, Slider>;
  /** The crossfade between the two layers. It is not a slider of the dots. */
  blendSlider: Slider;
}

function find<T extends Element>(root: ParentNode, id: string): T | null {
  return root.querySelector<T>(`#${id}`);
}

function createUi(root: ParentNode): PhotoUi {
  const sliders = {} as Record<SliderKey, Slider>;
  for (const key of SLIDER_KEYS) {
    sliders[key] = new Slider(root, key);
  }
  return {
    stage: find(root, "pattern-bg"),
    fileInput: find<HTMLInputElement>(root, "photo-file"),
    source: find<HTMLImageElement>(root, "photo-source"),
    layoutSelect: find<JDSelectElement>(root, "layout"),
    shapeSelect: find<JDSelectElement>(root, "shape"),
    seedInput: find<HTMLInputElement>(root, "seed"),
    seedRandomButton: find<HTMLButtonElement>(root, "seed-random"),
    randomButton: find<HTMLButtonElement>(root, "photo-random"),
    downloadButton: find<HTMLButtonElement>(root, "photo-download"),
    copyButton: find<HTMLButtonElement>(root, "photo-copy"),
    status: find(root, "photo-status"),
    sliders,
    blendSlider: new Slider(root, "blend"),
  };
}

/**
 * The Polka photo card: it reads the image, keeps the settings, redraws the
 * picture and hands it out as a file.
 */
export class PolkaPhoto {
  private readonly ui: PhotoUi;

  // What the dots follow, and the name the file gets. Both are set as soon as
  // the user has picked an image; before that there is nothing to draw.
  private luminance: Luminance | null = null;
  private imageName = "";
  private previewUrl = "";
  // The dots of the picture as they were drawn last, so the file can be written
  // from the same drawing the page shows.
  private content = "";
  private size = { width: 0, height: 0 };

  constructor(root: ParentNode = document) {
    this.ui = createUi(root);
  }

  /**
   * Puts the card to work: it fills the layout chooser, sets the limits of the
   * sliders and listens to every control.
   */
  start(): void {
    const { sliders, layoutSelect, shapeSelect } = this.ui;
    for (const key of SLIDER_KEYS) {
      const slider = sliders[key];
      const range = RANGES[key];
      slider.setRange(range.min, range.max, range.step);
      // The markup carries the value the card starts at, and the readout takes
      // it from the slider; from then on a drag writes itself into the readout.
      slider.sync();
      slider.onInput(() => {
        slider.sync();
        this.render();
      });
    }
    this.wireBlend();
    this.fillLayouts();
    this.fillShapes();
    layoutSelect?.addEventListener("change", () => this.render());
    shapeSelect?.addEventListener("change", () => this.render());
    this.ui.fileInput?.addEventListener("change", () => void this.readChosenImage());
    this.ui.seedInput?.addEventListener("input", () => this.render());
    this.ui.seedRandomButton?.addEventListener("click", () => {
      this.setSeed(randomSeed());
    });
    this.ui.randomButton?.addEventListener("click", () => this.randomize());
    this.ui.downloadButton?.addEventListener("click", () => this.download());
    this.ui.copyButton?.addEventListener("click", () => void this.copy());
    this.showPlaceholder();
  }

  // --- The image ------------------------------------------------------------

  /**
   * Reads the image the user picked and draws it as dots.
   */
  private async readChosenImage(): Promise<void> {
    const file = this.ui.fileInput?.files?.[0];
    if (!file) return;
    this.setStatus(`Reading ${file.name}…`);
    try {
      this.luminance = await readLuminance(file);
      this.imageName = fileName(file.name);
      this.showSource(file);
      this.render();
      this.setStatus(`${this.imageName}.svg — change the dots until it fits.`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "The image could not be read.");
    }
  }

  /**
   * Shows the image itself under the dots, so the two can be compared.
   */
  private showSource(file: File): void {
    const source = this.ui.source;
    if (!source) return;
    // The old URL is given back first, so picking image after image does not
    // keep a picture in memory for every one of them.
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
    source.src = this.previewUrl;
  }

  // --- The crossfade --------------------------------------------------------

  /**
   * Moves the crossfade between the two layers: 0 shows the image alone, 100
   * the dots alone.
   */
  private wireBlend(): void {
    const { blendSlider } = this.ui;
    // The crossfade is no slider of the dots: it is not drawn again, it only
    // says how strongly each of the two layers is seen.
    blendSlider.onInput(() => {
      blendSlider.sync();
      this.setBlend(blendSlider.value);
    });
    blendSlider.sync();
    this.setBlend(blendSlider.value);
  }

  /**
   * Fades the two layers into each other: the image takes one part, the dots the
   * other, so both add up to one.
   */
  private setBlend(value: number): void {
    const dots = clamp(value, 0, 100) / 100;
    const { source, stage } = this.ui;
    if (source) source.style.opacity = String(1 - dots);
    if (stage) stage.style.opacity = String(dots);
  }

  // --- The picture ----------------------------------------------------------

  /**
   * Draws the dots again: every control of the card ends up here.
   */
  render(): void {
    const stage = this.ui.stage;
    if (!stage) return;
    const luminance = this.luminance;
    if (!luminance) {
      this.showPlaceholder();
      return;
    }
    const { sliders, layoutSelect, shapeSelect } = this.ui;
    const size = pictureSize(luminance);
    const layout = (layoutSelect?.value ?? FIRST_LAYOUT) as PolkaLayout;
    const shape = (shapeSelect?.value ?? FIRST_SHAPE) as PolkaShape;
    const colors = palette({
      hue: sliders.hue.value,
      colors: sliders.colors.value,
      opacity: sliders.opacity.value,
    });
    const field = fieldOf(luminance, {
      contrast: sliders.contrast.value,
      brightness: sliders.brightness.value,
    });

    this.size = size;
    this.content = drawDots(field, {
      width: size.width,
      height: size.height,
      layout,
      shape,
      columns: sliders.count.value,
      weight: sliders.weight.value,
      floor: sliders.floor.value,
      wash: sliders.wash.value,
      palette: colors,
      rand: mulberry32(this.seed()),
    });
    stage.innerHTML = pictureDocument(this.content, size, "100%", "100%");
  }

  /**
   * What the picture area shows before an image has been picked.
   */
  private showPlaceholder(): void {
    const stage = this.ui.stage;
    if (!stage) return;
    stage.innerHTML = `<p class="photo-placeholder">${PLACEHOLDER}</p>`;
  }

  // --- The file -------------------------------------------------------------

  /**
   * Downloads the picture as an SVG file, named after the image it came from.
   */
  private download(): void {
    if (!this.luminance) return;
    const name = `polka-${this.imageName}.svg`;
    downloadSvg(name, this.standaloneSvg());
    this.setStatus(`Downloaded ${name}.`);
  }

  /**
   * Puts the picture on the clipboard as an SVG file.
   */
  private async copy(): Promise<void> {
    if (!this.luminance) return;
    const copied = await copySvg(this.standaloneSvg());
    this.setStatus(
      copied ? "SVG copied to clipboard." : "Clipboard unavailable — use Download SVG instead.",
    );
  }

  /**
   * The picture as a standalone file: the size of the image itself, and solid
   * colors, so a graphics editor shows the dots the way the page does.
   */
  private standaloneSvg(): string {
    return solidColors(
      pictureDocument(this.content, this.size, String(this.size.width), String(this.size.height)),
    );
  }

  // --- The card -------------------------------------------------------------

  /**
   * Fills the layout chooser with the layouts the polka family declares.
   */
  private fillLayouts(): void {
    const select = this.ui.layoutSelect;
    if (!select) return;
    select.replaceChildren();
    for (const layout of POLKA_LAYOUTS) {
      const option = document.createElement("jd-option");
      option.value = layout;
      option.textContent = LAYOUT_TEXTS[layout];
      select.append(option);
    }
    select.value = FIRST_LAYOUT;
  }

  /**
   * Fills the shape chooser with the shapes the polka family declares.
   */
  private fillShapes(): void {
    const select = this.ui.shapeSelect;
    if (!select) return;
    select.replaceChildren();
    for (const shape of POLKA_SHAPES) {
      const option = document.createElement("jd-option");
      option.value = shape;
      option.textContent = SHAPE_TEXTS[shape];
      select.append(option);
    }
    select.value = FIRST_SHAPE;
  }

  /**
   * Draws the same image again with a new seed and new dots: the picture stays,
   * everything the dots do with it is drawn afresh.
   *
   * @remarks
   * The opacity is left alone, because it says how strongly the picture should
   * read against the page, not what the picture is.
   */
  randomize(): void {
    for (const key of SLIDER_KEYS) {
      if (key === "opacity") continue;
      const slider = this.ui.sliders[key];
      slider.value = slider.randomValue();
    }
    this.setSeed(randomSeed());
    this.render();
  }

  /**
   * The seed of the stamp, which the user can also type in.
   */
  private seed(): number {
    return Number.parseInt(this.ui.seedInput?.value ?? "0", 10) || 0;
  }

  private setSeed(seed: number): void {
    if (this.ui.seedInput) this.ui.seedInput.value = String(seed);
    this.render();
  }

  /**
   * Reports what happened on the status line of the card.
   */
  private setStatus(message: string): void {
    setFileStatus(this.ui.status, message);
  }
}

/**
 * The size of the picture: it keeps the shape of the image, and its longest
 * side stays inside the size range the polka family declares, so a huge photo
 * is scaled down and a tiny one is not blown up into blocks.
 */
function pictureSize(luminance: Luminance): { width: number; height: number } {
  const longest = Math.max(luminance.width, luminance.height);
  const scale = clamp(longest, polka.size.min, polka.size.max) / longest;
  return {
    width: Math.max(1, Math.round(luminance.width * scale)),
    height: Math.max(1, Math.round(luminance.height * scale)),
  };
}

/**
 * The picture as an SVG document — at the size it is shown at, or at the size it
 * is opened at.
 */
function pictureDocument(
  content: string,
  size: { width: number; height: number },
  open: string,
  openHeight: string,
): string {
  const { width, height } = size;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${open}" height="${openHeight}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`,
    content,
    "</svg>",
  ].join("\n");
}

/**
 * The file name of an image, without the ending and without the characters a
 * download may not carry.
 */
function fileName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .toLowerCase() || "image"
  );
}

/**
 * A start value for the seed.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Creates a card over a piece of markup and starts it.
 *
 * @param root - The markup to look the elements up in.
 * @returns The card, for a page that wants to drive it.
 */
export function mountPolkaPhoto(root: ParentNode = document): PolkaPhoto {
  const card = new PolkaPhoto(root);
  card.start();
  return card;
}
