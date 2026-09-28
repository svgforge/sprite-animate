/**
 * The Pattern Studio: the control card of demo3 as a reusable controller.
 *
 * @remarks
 * The module is the UI and nothing else. It looks up the markup, keeps the
 * settings, drives the controls and the presets, and shows what the pattern
 * engine returns — it never draws a pattern itself, so the drawing in
 * `./pattern` stays free of the page. The names, descriptions and canvas of a
 * family live here, because this is where they are shown.
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
import type { JDSelectElement } from "./jd-select";
import {
  type Canvas,
  DEFAULT_SETTINGS,
  FAMILIES,
  FAMILY_BY_ID,
  type FamilyId,
  generatePattern,
  generateStandaloneSvg,
  type PatternSettings,
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

const PRESET_STORAGE_KEY = "sprite-amimate.pattern-studio.presets";

/**
 * The words the control card shows for a family. The engine knows only the
 * numeric side of a family, so the texts live here with the code that renders
 * them. A Record over the family ids makes a missing text a compile error.
 */
const FAMILY_TEXTS: Record<FamilyId, { label: string; description: string; density: string }> = {
  dots: {
    label: "Dots / halftone",
    description: "Two staggered dot grids with a halftone-like size wash.",
    density: "Dots per row",
  },
  triangles: {
    label: "Triangles / tessellation",
    description: "Half-square triangles in a checkerboard prism tessellation.",
    density: "Cells per row",
  },
  waves: {
    label: "Waves / topography",
    description: "Stacked sine waves with individual phases and line colors.",
    density: "Wave lines",
  },
  chevrons: {
    label: "Chevrons / stripes",
    description: "Chevron arrows in a herringbone weave with a diagonal color flow.",
    density: "Arrows per row",
  },
  bullseye: {
    label: "Concentric / bullseye",
    description: "Concentric rings centered at the tile quarter points.",
    density: "Rings per bullseye",
  },
  rhombus: {
    label: "Rhombus / lattice",
    description: "Diamond outlines with filled diamonds on alternating nodes.",
    density: "Diamonds per row",
  },
  handdrawn: {
    label: "Hand-drawn",
    description: "Imperfect rings, triangles, squiggles and dabs — like doodles.",
    density: "Shapes per tile",
  },
};

interface FieldSpec {
  key: SliderKey;
  // Whether the randomize button touches this slider. Opacity is left out on
  // purpose: it decides how strongly the pattern reads against the page, not
  // what the pattern is.
  random: boolean;
}

/**
 * The sliders of the control card, in the order of the markup. Input and
 * readout ids follow the key, so a new parameter is one line here plus one
 * field in the HTML: the wiring, the syncing and the randomize pass all read
 * this single list.
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

/**
 * Copy text to the clipboard via the async Clipboard API, falling back to the
 * legacy execCommand path when it is unavailable.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
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

  constructor(root: ParentNode, key: SliderKey) {
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
  familySelect: JDSelectElement | null;
  familyDescription: HTMLElement | null;
  densityLabel: HTMLElement | null;
  seedInput: HTMLInputElement | null;
  randomSeedButton: HTMLButtonElement | null;
  randomizeButton: HTMLButtonElement | null;
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
    familySelect: find<JDSelectElement>(root, "pattern"),
    familyDescription: find(root, "family-desc"),
    densityLabel: find(root, "density-label"),
    seedInput: find<HTMLInputElement>(root, "seed"),
    randomSeedButton: find<HTMLButtonElement>(root, "seed-random"),
    randomizeButton: find<HTMLButtonElement>(root, "randomize-all"),
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
    return { ...this.settings };
  }

  /**
   * Puts the studio to work: reads the stored presets, fills the family select,
   * connects the card and paints the first pattern.
   *
   * @remarks
   * Safe to call once per studio. Calling it again would connect the listeners
   * a second time, so the listeners of a control would then run twice per click.
   */
  start(): void {
    this.loadPresets();
    this.fillFamilySelect();
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

    // Let the dialog accent follow the current pattern hue. On <html> it
    // inherits down into every part of the page.
    document.documentElement.style.setProperty(
      "--pattern-accent",
      `hsl(${this.settings.hue} 90% 65%)`,
    );
  }

  /**
   * Switches to another family and resets the density to that family's default.
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
   * Unlike {@link PatternStudio.setFamily | setFamily} this keeps the density
   * that comes with the settings, so loading a preset restores it instead of
   * overwriting it with the family default.
   *
   * @param settings - The settings to take over.
   */
  applySettings(settings: PatternSettings): void {
    Object.assign(this.settings, settings);
    this.applyFamily(false);
    this.render();
  }

  /**
   * Draws a new pattern at random.
   *
   * @remarks
   * The family comes first, because it defines the range of the density slider;
   * then the seed and every field that opts in — all of them read from the range
   * their own slider offers. The opacity is left alone on purpose: it says how
   * strongly the pattern should read against the page, not what it is.
   */
  randomize(): void {
    this.markChanged();

    const family = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
    this.settings.family = family.id;
    this.applyFamily();

    this.settings.seed = randomSeed();
    for (const field of FIELDS) {
      if (!field.random) continue;
      this.writeSlider(field.key, this.ui.sliders[field.key].randomValue());
    }

    this.render();
  }

  // --- Pattern file --------------------------------------------------------

  /**
   * The pattern as a standalone file, on the canvas the page asks for.
   */
  private standaloneSvg(): string {
    return generateStandaloneSvg(this.settings, exportCanvas());
  }

  /**
   * Downloads the current pattern as an SVG file.
   */
  downloadSvg(): void {
    const blob = new Blob([this.standaloneSvg()], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pattern.svg";
    link.click();
    URL.revokeObjectURL(url);
    this.setFileStatus("Downloaded pattern.svg.");
  }

  /**
   * Puts the current pattern as an SVG file on the clipboard.
   *
   * @remarks
   * Only the pattern ends up on the clipboard; where it is written is reported
   * through the status line of the file buttons.
   */
  async copySvg(): Promise<void> {
    const copied = await writeClipboard(this.standaloneSvg());
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
    this.applySettings({ ...preset.settings });
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
    this.presets = upsertPreset(this.presets, {
      name: presetName,
      settings: this.currentSettings,
    });
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
   * The sliders do not all drive a setting of the same name: the density slider
   * writes `density`, whose range comes from the family, and the two counts are
   * whole numbers. This is the only place that knows about it.
   */
  private readSlider(key: SliderKey): number {
    if (key === "count") return this.settings.density;
    return this.settings[key];
  }

  private writeSlider(key: SliderKey, value: number): void {
    if (key === "count") {
      this.settings.density = Math.round(value);
    } else if (key === "colors") {
      this.settings.colors = Math.round(value);
    } else {
      this.settings[key] = value;
    }
  }

  /**
   * Apply the current family to the card: its texts and the range of the density
   * slider. `resetDensity` restores the family default, which is what switching
   * the family does - loading a preset keeps its stored density.
   */
  private applyFamily(resetDensity = true): void {
    const family = FAMILY_BY_ID.get(this.settings.family) ?? FAMILIES[0];
    const text = FAMILY_TEXTS[family.id];
    if (this.ui.familySelect) this.ui.familySelect.value = family.id;
    if (this.ui.familyDescription) this.ui.familyDescription.textContent = text.description;
    if (this.ui.densityLabel) this.ui.densityLabel.textContent = text.density;
    this.ui.sliders.count.setRange(family.densityMin, family.densityMax, family.densityStep);

    if (resetDensity) this.settings.density = family.densityDefault;
  }

  /**
   * Puts one `<jd-option>` per family into the chooser.
   *
   * @remarks
   * The families and their texts are joined here, because the engine knows
   * only the numeric side of a family. The chooser takes them from its markup
   * the way a native select does; it draws its own list and keeps the current
   * one chosen.
   */
  private fillFamilySelect(): void {
    const select = this.ui.familySelect;
    if (!select) return;
    const options = FAMILIES.map((family) => {
      const text = FAMILY_TEXTS[family.id];
      const option = document.createElement("jd-option");
      option.value = family.id;
      option.setAttribute("description", text.description);
      option.textContent = text.label;
      return option;
    });
    select.replaceChildren(...options);
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
    // script - which is how the family default and the presets work.
    ui.familySelect?.addEventListener("change", () => {
      const chosen = ui.familySelect?.value ?? "";
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
    const status = this.ui.fileStatus;
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
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
