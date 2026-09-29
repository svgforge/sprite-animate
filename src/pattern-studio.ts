/**
 * The Pattern Studio: the control card of demo3 as a reusable controller.
 *
 * @remarks
 * The module is the UI and nothing else. It looks up the markup, keeps the
 * settings, drives the controls and the presets, and shows what the pattern
 * engine returns — it never draws a pattern itself, so the drawing in
 * `./pattern` stays free of the page. The names, descriptions and canvas of a
 * pattern live here, because this is where they are shown, and so do the labels
 * of the controls a pattern brings for itself.
 *
 * The card has two kinds of fields: the sliders every pattern shares, which are
 * in the markup, and the controls of the active pattern, which the studio builds
 * from what that pattern declares. So a pattern brings its own controls into a
 * card it did not have to know about.
 *
 * Every element is looked up by id inside a root, so a page only has to provide
 * the markup, and the studio can also be mounted into a part of a page.
 *
 * The parts, each readable on its own:
 * - `Slider` — one slider of the card, with its readout,
 * - `StudioUi` — the elements the studio drives, found once,
 * - `PatternStudio` — the settings, the background, the presets and the wiring.
 *
 * The family chooser is a `<jd-select>` from `./jd-select`, which brings its
 * own list; the studio only fills its options and reads and writes its value.
 *
 * @example
 * The whole page, with the markup already in place:
 *
 * ```ts
 * mountPatternStudio();
 * ```
 *
 * @example
 * Driven from code instead of the card:
 *
 * ```ts
 * const studio = mountPatternStudio();
 * studio.setFamily("waves");
 * studio.randomize();
 * const svg = generateStandaloneSvg(studio.currentSettings, canvas);
 * ```
 */
import type { JDOptionElement, JDSelectElement } from "./jd-select";
import {
  type Canvas,
  type ChoiceControl,
  type Control,
  DEFAULT_SETTINGS,
  FAMILIES,
  FAMILY_BY_ID,
  type Family,
  type FamilyId,
  generatePattern,
  generateStandaloneSvg,
  type PatternSettings,
  type RangeControl,
  readExtra,
} from "./pattern";
import {
  type PatternTilesElement,
  type PatternTilesRemoveDetail,
  type PatternTilesSelectDetail,
  tilesDetail,
} from "./pattern-tiles";
import {
  countPresetsInFile,
  defaultPresets,
  type Preset,
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
} from "./presets";
import { copySvg, downloadSvg, setFileStatus } from "./svg-file";

const PRESET_STORAGE_KEY = "sprite-amimate.pattern-studio.presets";

/**
 * The words the control card shows for a pattern. The engine knows only the
 * numeric side of a pattern, so the texts live here with the code that renders
 * them. A Record over the pattern ids makes a missing text a compile error.
 */
const FAMILY_TEXTS: Record<
  FamilyId,
  { label: string; description: string; density: string; size: string }
> = {
  dots: {
    label: "Dots / halftone",
    description: "Two staggered dot grids with a halftone-like size wash.",
    density: "Dots per row",
    size: "Tile size",
  },
  triangles: {
    label: "Triangles / tessellation",
    description: "Half-square triangles in a checkerboard prism tessellation.",
    density: "Cells per row",
    size: "Tile size",
  },
  waves: {
    label: "Waves / topography",
    description: "Stacked sine waves with individual phases and line colors.",
    density: "Wave lines",
    size: "Tile size",
  },
  chevrons: {
    label: "Chevrons / stripes",
    description: "Chevron arrows in a herringbone weave with a diagonal color flow.",
    density: "Arrows per row",
    size: "Tile size",
  },
  bullseye: {
    label: "Concentric / bullseye",
    description: "Concentric rings centered at the tile quarter points.",
    density: "Rings per bullseye",
    size: "Tile size",
  },
  rhombus: {
    label: "Rhombus / lattice",
    description: "Diamond outlines with filled diamonds on alternating nodes.",
    density: "Diamonds per row",
    size: "Tile size",
  },
  handdrawn: {
    label: "Hand-drawn",
    description: "Imperfect rings, triangles, squiggles and dabs — like doodles.",
    density: "Shapes per tile",
    size: "Tile size",
  },
  polka: {
    label: "Polka picture",
    description: "A single picture: a gradient or a figure resolved into dots.",
    density: "Dots per row",
    size: "Picture size",
  },
};

/**
 * The words for a control a pattern brings for itself, by the control's key.
 */
const CONTROL_TEXTS: Record<string, string> = {
  source: "Source",
  layout: "Dot layout",
  shape: "Dot shape",
  weight: "Dot weight",
  floor: "Smallest dot",
  angle: "Gradient angle",
  softness: "Edge softness",
  wash: "Soften",
};

/**
 * The words for a value a pattern offers in a chooser, by the value itself.
 */
const CHOICE_TEXTS: Record<string, { label: string; description?: string }> = {
  // What the dots of a polka picture trace. The source angle turns all of them.
  linear: {
    label: "Gradient across",
    description: "A gradient running from one edge to the other, turned by the gradient angle.",
  },
  radial: {
    label: "Radial gradient",
    description: "A gradient from the middle out to the rim, bright in the centre.",
  },
  circle: {
    label: "Disc",
    description: "A filled circle in the middle, the dots fading out at its rim.",
  },
  ring: {
    label: "Ring",
    description: "A bright rim around an empty middle.",
  },
  heart: {
    label: "Heart",
    description: "A heart: two lobes above, a point below.",
  },
  wave: {
    label: "Waves",
    description: "Diagonal stripes, so the picture reads as movement.",
  },
  // How those dots are placed.
  grid: { label: "Grid" },
  hex: { label: "Hex" },
  scatter: { label: "Scatter" },
  // How those dots are shaped. The values are not the layouts: a dot and a
  // hexagon sit in the same lattice as the grid and the hex layout.
  dot: { label: "Dot" },
  square: { label: "Square" },
  hexagon: { label: "Hexagon" },
};

interface FieldSpec {
  key: SliderKey;
  // Whether the randomize button touches this slider. Opacity is left out on
  // purpose: it decides how strongly the pattern reads against the page, not
  // what the pattern is.
  random: boolean;
}

/**
 * The sliders every pattern shares, in the order of the markup. Input and
 * readout ids follow the key, so a new parameter is one line here plus one field
 * in the HTML: the wiring, the syncing and the randomize pass all read this
 * single list.
 *
 * @remarks
 * Every pattern gets the same sliders, none of them hidden — a control that comes
 * and goes would make switching between two patterns a small surprise. The
 * controls a pattern brings for itself are not in here: the pattern declares
 * those itself, and the card is built from that declaration.
 */
const FIELDS: FieldSpec[] = [
  { key: "count", random: true },
  { key: "size", random: true },
  { key: "opacity", random: false },
  { key: "colors", random: true },
  { key: "hue", random: true },
  { key: "rotation", random: true },
];

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * The size an exported pattern file is opened at. The engine leaves the size
 * and the backdrop to the caller, because only the page knows them.
 */
const EXPORT_SIZE = { width: 800, height: 600 };

/**
 * The canvas for an exported pattern file. The backdrop is taken from the
 * stylesheet, so the file looks like the page and the two cannot drift apart.
 */
function exportCanvas(): Canvas {
  const page = getComputedStyle(document.documentElement);
  const background = page.getPropertyValue("--bg").trim();
  return { ...EXPORT_SIZE, background: background || "transparent" };
}

// --- Controls --------------------------------------------------------------

/**
 * Id of a slider of the control card.
 *
 * @remarks
 * The id of a slider is also the id of its input and of its readout in the
 * markup, so the card and this type cannot drift apart.
 */
export type SliderKey = "count" | "size" | "opacity" | "colors" | "hue" | "rotation";

/**
 * Looks an element up by id inside a root, so a page only has to provide the
 * markup. Returns null when the id is not there, which every control tolerates.
 */
function find<T extends Element>(root: ParentNode, id: string): T | null {
  return root.querySelector<T>(`#${id}`);
}

/**
 * One slider of the control card and the readout next to it. It knows nothing
 * about the settings: it reports what the user did and shows what it is told.
 */
export class Slider {
  readonly input: HTMLInputElement | null;
  private readonly readout: HTMLOutputElement | null;

  constructor(root: ParentNode, key: string) {
    this.input = find<HTMLInputElement>(root, key);
    this.readout = find<HTMLOutputElement>(root, `${key}-readout`);
  }

  get value(): number {
    return Number.parseFloat(this.input?.value ?? "0");
  }

  set value(value: number) {
    if (!this.input) return;
    this.input.value = String(value);
    if (this.readout) this.readout.textContent = String(value);
  }

  onInput(handler: (value: number) => void): void {
    const input = this.input;
    if (!input) return;
    input.addEventListener("input", () => {
      handler(this.value);
    });
  }

  /**
   * Writes what the input says into the readout, for when the user has moved the
   * slider by hand.
   */
  sync(): void {
    this.value = this.value;
  }

  /**
   * Every family counts in its own units, so it brings the range of the density
   * slider with it.
   */
  setRange(min: number, max: number, step: number): void {
    if (!this.input) return;
    this.input.min = String(min);
    this.input.max = String(max);
    this.input.step = String(step);
  }

  /**
   * A random value from this slider's own range, on a valid step. Reading the
   * range off the element is what lets the density follow its family.
   */
  randomValue(): number {
    if (!this.input) return 0;
    const min = Number.parseFloat(this.input.min);
    const max = Number.parseFloat(this.input.max);
    const step = Number.parseFloat(this.input.step) || 1;
    const steps = Math.floor((max - min) / step);
    return min + Math.floor(Math.random() * (steps + 1)) * step;
  }
}

// --- Studio UI -------------------------------------------------------------

/**
 * The elements the studio drives, found once. Grouping them keeps the studio
 * methods free of lookups and puts the markup contract in one place.
 */
interface StudioUi {
  background: HTMLElement | null;
  patternSelect: JDSelectElement | null;
  patternDescription: HTMLElement | null;
  densityLabel: HTMLElement | null;
  sizeLabel: HTMLElement | null;
  // Where the controls of the active pattern are built.
  patternFields: HTMLElement | null;
  seedInput: HTMLInputElement | null;
  randomSeedButton: HTMLButtonElement | null;
  randomizeButton: HTMLButtonElement | null;
  randomizeInPlaceButton: HTMLButtonElement | null;
  downloadButton: HTMLButtonElement | null;
  copyButton: HTMLButtonElement | null;
  fileStatus: HTMLElement | null;
  presetNameInput: HTMLInputElement | null;
  presetSaveButton: HTMLButtonElement | null;
  presetTiles: PatternTilesElement | null;
  presetExportButton: HTMLButtonElement | null;
  presetImportButton: HTMLButtonElement | null;
  presetFileInput: HTMLInputElement | null;
  presetStatus: HTMLElement | null;
  sliders: Record<SliderKey, Slider>;
}

function createUi(root: ParentNode): StudioUi {
  const sliders = {} as Record<SliderKey, Slider>;
  for (const field of FIELDS) {
    sliders[field.key] = new Slider(root, field.key);
  }

  return {
    background: find(root, "pattern-bg"),
    patternSelect: find<JDSelectElement>(root, "pattern"),
    patternDescription: find(root, "pattern-desc"),
    densityLabel: find(root, "density-label"),
    sizeLabel: find(root, "size-label"),
    patternFields: find(root, "pattern-fields"),
    seedInput: find<HTMLInputElement>(root, "seed"),
    randomSeedButton: find<HTMLButtonElement>(root, "seed-random"),
    randomizeButton: find<HTMLButtonElement>(root, "randomize-all"),
    randomizeInPlaceButton: find<HTMLButtonElement>(root, "randomize-in-place"),
    downloadButton: find<HTMLButtonElement>(root, "pattern-download"),
    copyButton: find<HTMLButtonElement>(root, "pattern-copy"),
    fileStatus: find(root, "pattern-file-status"),
    presetNameInput: find<HTMLInputElement>(root, "preset-name"),
    presetSaveButton: find<HTMLButtonElement>(root, "preset-save"),
    presetTiles: find<PatternTilesElement>(root, "preset-list"),
    presetExportButton: find<HTMLButtonElement>(root, "preset-export"),
    presetImportButton: find<HTMLButtonElement>(root, "preset-import"),
    presetFileInput: find<HTMLInputElement>(root, "preset-file"),
    presetStatus: find(root, "preset-status"),
    sliders,
  };
}

// --- Pattern studio --------------------------------------------------------

// The studio owns the settings, paints the background and keeps the control
// card and the presets in sync with them.
/**
 * The Pattern Studio: the settings, the control card, the presets and the
 * background, all kept in step with each other.
 *
 * @remarks
 * A studio is created with {@link PatternStudio.constructor | constructor} and
 * put to work with {@link PatternStudio.start | start}. Everything after that
 * is optional: a page that only shows the card can leave the rest alone.
 *
 * @example
 * ```ts
 * const studio = new PatternStudio();
 * studio.start();
 * ```
 */
export class PatternStudio {
  private readonly ui: StudioUi;

  private settings: PatternSettings = { ...DEFAULT_SETTINGS };

  // The controls of the active pattern, as they were built into the card.
  private controls: Control[] = [];
  private rangeControls = new Map<string, Slider>();
  private choiceControls = new Map<string, JDSelectElement>();

  // The saved presets, and the one the current settings came from.
  private presets: Preset[] = [];
  private activePresetName: string | null = null;

  /**
   * Creates a studio over a piece of markup.
   *
   * @remarks
   * Nothing is drawn and nothing is connected yet — that is what
   * {@link PatternStudio.start | start} does. Elements that are not in the
   * markup are simply skipped, so a partial card still works.
   *
   * @param root - The markup to look the elements up in. Defaults to the whole
   *   document.
   */
  constructor(root: ParentNode = document) {
    this.ui = createUi(root);
  }

  /**
   * The settings as they stand.
   *
   * @returns A copy, so a caller cannot change the studio behind its back.
   */
  get currentSettings(): PatternSettings {
    // The control values are a bag of their own, and they are handed out as a
    // copy of that as well.
    return { ...this.settings, extra: { ...this.settings.extra } };
  }

  /**
   * Puts the studio to work: reads the stored presets, fills the pattern select,
   * connects the card and paints the first pattern.
   *
   * @remarks
   * Safe to call once per studio. Calling it again would connect the listeners
   * a second time, so the listeners of a control would then run twice per click.
   */
  start(): void {
    this.loadPresets();
    this.fillPatternSelect();
    this.applyFamily();
    this.connect();
    this.render();
    this.renderPresetList();
  }

  /**
   * Paints the pattern and pushes the settings back into the card.
   *
   * @remarks
   * Every change goes through here, which is what keeps the sliders, the
   * readouts, the background and the preset list from drifting apart: there is
   * one place that shows the settings, and it shows them from the settings.
   */
  render(): void {
    if (this.ui.background) {
      this.ui.background.innerHTML = generatePattern(this.settings);
    }

    if (this.ui.seedInput) {
      this.ui.seedInput.value = String(this.settings.seed);
    }
    for (const field of FIELDS) {
      this.ui.sliders[field.key].value = this.readSlider(field.key);
    }
    for (const [key, slider] of this.rangeControls) {
      slider.value = Number(this.settings.extra[key] ?? 0);
    }
    for (const [key, select] of this.choiceControls) {
      select.value = String(this.settings.extra[key] ?? "");
    }

    // Let the dialog accent follow the current hue. On <html> it inherits down
    // into every part of the page.
    document.documentElement.style.setProperty(
      "--pattern-accent",
      `hsl(${this.settings.hue} 90% 65%)`,
    );
  }

  /**
   * Switches to another pattern and resets the numbers that belong to it.
   *
   * @param id - The family to draw with.
   */
  setFamily(id: FamilyId): void {
    this.markChanged();
    this.settings.family = id;
    this.applyFamily();
    this.render();
  }

  /**
   * Takes over a complete set of settings, for example from a preset or a file.
   *
   * @remarks
   * Unlike {@link PatternStudio.setFamily | setFamily} this keeps the numbers
   * that come with the settings, so loading a preset restores them instead of
   * overwriting them with the defaults of the pattern.
   *
   * @param settings - The settings to take over.
   */
  applySettings(settings: PatternSettings): void {
    Object.assign(this.settings, settings);
    this.applyFamily(false);
    this.render();
  }

  /**
   * Draws a new pattern at random, down to the pattern itself.
   *
   * @remarks
   * The pattern comes first, because it brings the ranges and the controls of
   * everything below it; then everything {@link PatternStudio.randomizeInPlace |
   * randomizeInPlace} draws. The opacity stays as it is here as well: it says how
   * strongly the pattern should read against the page, not what it is.
   */
  randomize(): void {
    this.setFamily(FAMILIES[Math.floor(Math.random() * FAMILIES.length)].id);
    this.randomizeInPlace();
  }

  /**
   * Draws a new pattern at random and keeps the pattern it is.
   *
   * @remarks
   * The seed, the shared sliders that opt in and the controls of the pattern
   * itself are drawn anew; every number is read from the range its own control
   * offers. The pattern stays as it is, because a button that changed the family
   * under the pointer would be a surprise while working on one.
   */
  randomizeInPlace(): void {
    this.settings.seed = randomSeed();
    for (const field of FIELDS) {
      if (!field.random) continue;
      this.writeSlider(field.key, this.ui.sliders[field.key].randomValue());
    }
    for (const control of this.controls) {
      if (control.kind === "range") {
        this.settings.extra[control.key] =
          this.rangeControls.get(control.key)?.randomValue() ?? control.start;
        continue;
      }
      const value = control.values[Math.floor(Math.random() * control.values.length)];
      this.settings.extra[control.key] = value ?? control.start;
    }
    this.render();
  }

  // --- Pattern file --------------------------------------------------------

  /**
   * The picture as a standalone file.
   */
  private standaloneSvg(): string {
    return generateStandaloneSvg(this.settings, exportCanvas());
  }

  /**
   * Downloads the current pattern as an SVG file.
   */
  downloadSvg(): void {
    const name = `${this.settings.family}.svg`;
    downloadSvg(name, this.standaloneSvg());
    this.setFileStatus(`Downloaded ${name}.`);
  }

  /**
   * Puts the current pattern as an SVG file on the clipboard.
   *
   * @remarks
   * Only the pattern ends up on the clipboard; where it is written is reported
   * through the status line of the file buttons.
   */
  async copySvg(): Promise<void> {
    const copied = await copySvg(this.standaloneSvg());
    this.setFileStatus(
      copied ? "SVG copied to clipboard." : "Clipboard unavailable — use Download SVG instead.",
    );
  }

  // --- Presets -------------------------------------------------------------

  /**
   * Loads a preset and marks it as the one the current settings came from.
   *
   * @param preset - The preset to load.
   */
  applyPreset(preset: Preset): void {
    this.applySettings({ ...preset.settings, extra: { ...preset.settings.extra } });
    this.activePresetName = preset.name;
    this.renderPresetList();
    this.setStatus(`Loaded preset "${preset.name}".`);
  }

  /**
   * Saves the current settings as a preset.
   *
   * @remarks
   * A preset of the same name is replaced, so saving twice under one name
   * updates it.
   *
   * @param name - Name to save under. Without one the name field of the card is
   *   used, and failing that a generated name, so a save always has a name.
   */
  savePreset(name?: string): void {
    const given = (name ?? this.ui.presetNameInput?.value ?? "").trim();
    const presetName = given || `Preset ${this.presets.length + 1}`;
    const updated = this.presets.some((preset) => preset.name === presetName);
    const preset: Preset = { name: presetName, settings: this.currentSettings };
    this.presets = upsertPreset(this.presets, preset);
    this.persistPresets();
    this.renderPresetList();
    if (this.ui.presetNameInput) this.ui.presetNameInput.value = "";
    this.setStatus(updated ? `Preset "${presetName}" updated.` : `Preset "${presetName}" saved.`);
  }

  /**
   * Deletes a preset.
   *
   * @param name - Name of the preset to delete.
   */
  deletePreset(name: string): void {
    this.presets = removePreset(this.presets, name);
    this.persistPresets();
    this.renderPresetList();
    this.setStatus(`Preset "${name}" deleted.`);
  }

  /**
   * Writes all saved presets to a JSON file, so they can be kept or moved to
   * another browser.
   */
  exportPresets(): void {
    if (this.presets.length === 0) {
      this.setStatus("Nothing to export yet — save a preset first.");
      return;
    }
    const blob = new Blob([serializePresets(this.presets)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pattern-presets.json";
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(
      `Exported ${this.presets.length} preset${this.presets.length === 1 ? "" : "s"}.`,
    );
  }

  /**
   * Adds the presets of a JSON file to the saved ones.
   *
   * @remarks
   * Presets of a name that already exists are replaced, the rest are added, and
   * a file the preset format does not recognize is refused — what was stored
   * before stays untouched in that case.
   *
   * @param file - The file to read.
   */
  async importPresets(file: File): Promise<void> {
    try {
      const text = await file.text();
      const imported = parsePresets(text);
      if (!imported) {
        this.setStatus("Invalid preset file — no usable presets found.");
        return;
      }
      let added = 0;
      let updated = 0;
      for (const preset of imported) {
        const exists = this.presets.some((entry) => entry.name === preset.name);
        this.presets = upsertPreset(this.presets, preset);
        if (exists) updated++;
        else added++;
      }
      this.persistPresets();
      this.renderPresetList();
      this.setStatus(
        `Imported ${imported.length} preset${imported.length === 1 ? "" : "s"} (${added} new, ${updated} updated).`,
      );
    } catch {
      this.setStatus("Could not read the file.");
    }
  }

  // --- Settings <-> card ---------------------------------------------------

  /**
   * The sliders do not all drive a setting of the same name — the density is
   * counted in the unit of the pattern, so its slider is called `count` — and
   * the two counts are whole numbers. This is the only place that knows about
   * either of that.
   */
  private readSlider(key: SliderKey): number {
    if (key === "count") return this.settings.density;
    return this.settings[key];
  }

  private writeSlider(key: SliderKey, value: number): void {
    if (key === "count") {
      this.settings.density = Math.round(value);
      return;
    }
    if (key === "colors") {
      this.settings.colors = Math.round(value);
      return;
    }
    this.settings[key] = value;
  }

  /** The family the settings name, falling back to the first one. */
  private family(): Family {
    return FAMILY_BY_ID.get(this.settings.family) ?? FAMILIES[0];
  }

  /**
   * Puts the active pattern onto the card: its words, the range of the two
   * sliders whose numbers belong to it, and the controls it brings.
   *
   * @param reset - Restores the defaults of the pattern, which is what switching
   *   to another pattern does - loading a preset keeps the numbers it brings.
   */
  private applyFamily(reset = true): void {
    const family = this.family();
    const text = FAMILY_TEXTS[family.id];
    if (this.ui.patternSelect) this.ui.patternSelect.value = family.id;
    if (this.ui.patternDescription) this.ui.patternDescription.textContent = text.description;
    if (this.ui.densityLabel) this.ui.densityLabel.textContent = text.density;
    if (this.ui.sizeLabel) this.ui.sizeLabel.textContent = text.size;
    this.ui.sliders.count.setRange(family.density.min, family.density.max, family.density.step);
    this.ui.sliders.size.setRange(family.size.min, family.size.max, family.size.step);

    if (reset) this.settings.density = family.densityDefault;
    this.settings.extra = readExtra(family, reset ? undefined : this.settings.extra);
    this.buildControls(family);
  }

  /**
   * Builds the controls the active pattern brings for itself into the card.
   *
   * @remarks
   * A range control becomes a slider and a choice control becomes a chooser, the
   * same way the shared fields of the card are built — only that the pattern
   * decides which ones there are. They are built again whenever another pattern
   * is chosen, because every pattern brings its own.
   */
  private buildControls(family: Family): void {
    this.controls = [...family.controls];
    this.rangeControls.clear();
    this.choiceControls.clear();
    const host = this.ui.patternFields;
    if (!host) return;
    host.replaceChildren(...this.controls.map((control) => this.buildControl(control)));
  }

  /** One field of the card, for one control of the active pattern. */
  private buildControl(control: Control): HTMLElement {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.setAttribute("for", control.key);
    label.textContent = CONTROL_TEXTS[control.key] ?? control.key;
    field.append(label);
    if (control.kind === "range") {
      field.append(this.buildRangeControl(field, control));
      return field;
    }
    field.append(this.buildChoiceControl(control));
    return field;
  }

  /** The slider of a range control, wired to the settings of the pattern. */
  private buildRangeControl(field: HTMLElement, control: RangeControl): HTMLInputElement {
    const readout = document.createElement("output");
    readout.id = `${control.key}-readout`;
    readout.setAttribute("for", control.key);
    const input = document.createElement("input");
    input.type = "range";
    input.id = control.key;
    input.min = String(control.range.min);
    input.max = String(control.range.max);
    input.step = String(control.range.step);
    field.append(readout, input);
    const slider = new Slider(field, control.key);
    slider.onInput((value) => {
      this.writeExtra(control.key, value);
    });
    this.rangeControls.set(control.key, slider);
    return input;
  }

  /** The chooser of a choice control, wired to the settings of the pattern. */
  private buildChoiceControl(control: ChoiceControl): JDSelectElement {
    const select = document.createElement("jd-select");
    select.id = control.key;
    select.replaceChildren(
      ...control.values.map((value) =>
        this.makeOption(
          value,
          CHOICE_TEXTS[value]?.label ?? value,
          CHOICE_TEXTS[value]?.description,
        ),
      ),
    );
    select.addEventListener("change", () => {
      this.writeExtra(control.key, select.value);
    });
    this.choiceControls.set(control.key, select);
    return select;
  }

  /** A change to a control of the active pattern, into the settings. */
  private writeExtra(key: string, value: number | string): void {
    this.markChanged();
    this.settings.extra[key] = value;
    this.render();
  }

  /**
   * Puts one `<jd-option>` per pattern into the pattern chooser.
   *
   * @remarks
   * The chooser takes its options from the markup the way a native select does;
   * it draws its own list and keeps the current one chosen. The patterns and
   * their texts are joined here, because the engine knows only the numeric side.
   */
  private fillPatternSelect(): void {
    const select = this.ui.patternSelect;
    if (!select) return;
    const options = FAMILIES.map((family) => {
      const text = FAMILY_TEXTS[family.id];
      return this.makeOption(family.id, text.label, text.description);
    });
    select.replaceChildren(...options);
  }

  private makeOption(value: string, label: string, description?: string): JDOptionElement {
    const option = document.createElement("jd-option");
    option.value = value;
    if (description) option.setAttribute("description", description);
    option.textContent = label;
    return option;
  }

  /** A manual edit means the settings no longer match the active preset. */
  private markChanged(): void {
    if (this.activePresetName === null) return;
    this.activePresetName = null;
    if (this.ui.presetTiles) this.ui.presetTiles.active = null;
  }

  // --- Wiring --------------------------------------------------------------

  /**
   * Every listener of the card in one place, so it is obvious what reacts to
   * what.
   */
  private connect(): void {
    const ui = this.ui;

    // The chooser speaks the words of a native select: it fires `change` when
    // the user picks something, and stays quiet when the value is set from
    // script - which is how the pattern defaults and the presets work.
    ui.patternSelect?.addEventListener("change", () => {
      const chosen = ui.patternSelect?.value ?? "";
      if (FAMILY_BY_ID.has(chosen as FamilyId)) this.setFamily(chosen as FamilyId);
    });

    const seedInput = ui.seedInput;
    if (seedInput) {
      seedInput.addEventListener("input", () => {
        const value = Number.parseInt(seedInput.value, 10);
        if (Number.isNaN(value)) return;
        this.markChanged();
        this.settings.seed = value >>> 0;
        this.render();
      });
    }

    ui.randomSeedButton?.addEventListener("click", () => {
      this.markChanged();
      this.settings.seed = randomSeed();
      this.render();
    });

    for (const field of FIELDS) {
      const key = field.key;
      ui.sliders[key].onInput((value) => {
        this.markChanged();
        this.writeSlider(key, value);
        this.render();
      });
    }

    ui.randomizeButton?.addEventListener("click", () => {
      this.randomize();
    });

    ui.randomizeInPlaceButton?.addEventListener("click", () => {
      this.randomizeInPlace();
    });

    ui.downloadButton?.addEventListener("click", () => {
      this.downloadSvg();
    });

    ui.copyButton?.addEventListener("click", () => {
      void this.copySvg();
    });

    ui.presetSaveButton?.addEventListener("click", () => {
      this.savePreset();
    });

    // The tiles only report what was picked or deleted; the studio keeps the
    // presets and knows what to do with either.
    const presetTiles = ui.presetTiles;
    if (presetTiles) {
      presetTiles.addEventListener("select", (event) => {
        const { preset } = tilesDetail<PatternTilesSelectDetail>(event);
        this.applyPreset(preset);
      });
      presetTiles.addEventListener("remove", (event) => {
        const { name } = tilesDetail<PatternTilesRemoveDetail>(event);
        this.deletePreset(name);
      });
    }

    ui.presetExportButton?.addEventListener("click", () => {
      this.exportPresets();
    });

    ui.presetImportButton?.addEventListener("click", () => {
      ui.presetFileInput?.click();
    });

    const presetFileInput = ui.presetFileInput;
    if (presetFileInput) {
      presetFileInput.addEventListener("change", () => {
        const file = presetFileInput.files?.[0];
        presetFileInput.value = "";
        if (file) void this.importPresets(file);
      });
    }
  }

  // --- Preset storage ------------------------------------------------------

  /**
   * The stored presets of this browser, as they stand, when this build could not
   * read all of them.
   *
   * @remarks
   * Stored data is the only copy of a saved pattern, so it is never written over
   * with a shorter list: the presets that could not be read would be gone for
   * good. As long as this is set, saving and deleting say so instead of storing
   * anything.
   */
  private unreadablePresets: string | null = null;

  private loadPresets(): void {
    try {
      const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
      // A browser that has never stored presets starts with the ones the project
      // ships — and keeps them like any other preset, so that deleting them
      // really empties the list instead of bringing them back on the next visit.
      if (!raw) {
        this.presets = defaultPresets();
        this.persistPresets();
        return;
      }
      this.presets = parsePresets(raw) ?? [];
      const stored = countPresetsInFile(raw);
      if (stored !== null && this.presets.length < stored) this.unreadablePresets = raw;
    } catch {
      // Without storage the shipped presets are still worth showing, they just
      // cannot be kept.
      this.presets = defaultPresets();
      this.setStatus("Storage unavailable — export your presets to keep them.");
    }
    if (this.unreadablePresets !== null) {
      this.setStatus(
        `Presets are stored in this browser, but this page could only read part of them — "${PRESET_STORAGE_KEY}" was left exactly as it is.`,
      );
    }
  }

  private persistPresets(): void {
    if (this.unreadablePresets !== null) {
      this.setStatus("Nothing stored — the stored presets were left untouched.");
      return;
    }
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, serializePresets(this.presets));
    } catch {
      this.setStatus("Storage unavailable — export your presets to keep them.");
    }
  }

  /**
   * Hands the tiles the saved patterns and the one the settings came from.
   *
   * @remarks
   * The tiles draw themselves from the settings: a pattern is fully decided by
   * them, so a pattern that was saved before the tiles existed shows up as a
   * preview like any other, with nothing to bring along and nothing to re-save.
   */
  private renderPresetList(): void {
    const tiles = this.ui.presetTiles;
    if (!tiles) return;
    tiles.presets = this.presets;
    tiles.active = this.activePresetName;
  }

  // --- Status lines --------------------------------------------------------

  private setStatus(message: string): void {
    const status = this.ui.presetStatus;
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }

  private setFileStatus(message: string): void {
    setFileStatus(this.ui.fileStatus, message);
  }
}

/**
 * Creates a studio over a piece of markup and starts it.
 *
 * @remarks
 * This is what the demo entry calls. A page that wants to drive the studio
 * itself takes the returned instance and uses its methods.
 *
 * @param root - The markup to look the elements up in. Defaults to the whole
 *   document.
 * @returns The started studio.
 */
export function mountPatternStudio(root: ParentNode = document): PatternStudio {
  const studio = new PatternStudio(root);
  studio.start();
  return studio;
}
