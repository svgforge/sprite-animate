// Demo3 — Pattern Studio.
//
// Renders a seamless SVG pattern as a full-screen fixed background. Pick one
// of the pattern families, then tweak seed / density / size / opacity / color
// / hue / rotation with the controls — the background re-renders immediately.
// Settings can be saved as named presets (localStorage) and exported /
// imported as a JSON file. The generators live in ./patterns, the preset
// logic and serialization in ./presets.

import {
  DEFAULT_SETTINGS,
  FAMILIES,
  FAMILY_BY_ID,
  type FamilyId,
  generatePattern,
  generateStandaloneSvg,
  type PatternSettings,
} from "./patterns";
import {
  type Preset,
  parsePresets,
  removePreset,
  serializePresets,
  sortPresets,
  upsertPreset,
} from "./presets";

const PRESET_STORAGE_KEY = "sprite-amimate.pattern-studio.presets";

const bg = document.getElementById("pattern-bg");
const seedInput = document.getElementById("seed") as HTMLInputElement | null;
const seedRandomBtn = document.getElementById("seed-random") as HTMLButtonElement | null;
const seedReadout = document.getElementById("seed-readout");
const patternSelect = document.getElementById("pattern") as HTMLSelectElement | null;
const familyDesc = document.getElementById("family-desc");
const densityLabel = document.getElementById("density-label");

const presetNameInput = document.getElementById("preset-name") as HTMLInputElement | null;
const presetSaveBtn = document.getElementById("preset-save") as HTMLButtonElement | null;
const presetList = document.getElementById("preset-list");
const presetExportBtn = document.getElementById("preset-export") as HTMLButtonElement | null;
const presetImportBtn = document.getElementById("preset-import") as HTMLButtonElement | null;
const presetFileInput = document.getElementById("preset-file") as HTMLInputElement | null;
const presetStatus = document.getElementById("preset-status");

const patternDownloadBtn = document.getElementById("pattern-download") as HTMLButtonElement | null;
const patternCopyBtn = document.getElementById("pattern-copy") as HTMLButtonElement | null;
const patternFileStatus = document.getElementById("pattern-file-status");

const sliders = {
  count: document.getElementById("count") as HTMLInputElement | null,
  size: document.getElementById("size") as HTMLInputElement | null,
  opacity: document.getElementById("opacity") as HTMLInputElement | null,
  colors: document.getElementById("colors") as HTMLInputElement | null,
  hue: document.getElementById("hue") as HTMLInputElement | null,
  rotation: document.getElementById("rotation") as HTMLInputElement | null,
} as const;

const readouts = {
  count: document.getElementById("count-readout"),
  size: document.getElementById("size-readout"),
  opacity: document.getElementById("opacity-readout"),
  colors: document.getElementById("colors-readout"),
  hue: document.getElementById("hue-readout"),
  rotation: document.getElementById("rotation-readout"),
} as const;

// Slider-controlled fields (seed has its own input).
type SliderKey = "count" | "size" | "opacity" | "colors" | "hue" | "rotation";
const SLIDER_KEYS: SliderKey[] = ["count", "size", "opacity", "colors", "hue", "rotation"];

const settings: PatternSettings = { ...DEFAULT_SETTINGS };

// Loaded presets plus the name of the preset the current settings came from.
let presets: Preset[] = [];
let activePresetName: string | null = null;

function fillPatternSelect(): void {
  if (!patternSelect) return;
  for (const family of FAMILIES) {
    const option = document.createElement("option");
    option.value = family.id;
    option.textContent = family.label;
    patternSelect.appendChild(option);
  }
  patternSelect.value = settings.family;
}

// Apply the current family to the UI: adjust the density slider range and
// label. When `resetDensity` is true the density is reset to the family
// default (used when switching family); preset loads keep their stored density.
function applyFamily(resetDensity = true): void {
  const family = FAMILY_BY_ID.get(settings.family) ?? FAMILIES[0];
  if (patternSelect) patternSelect.value = family.id;
  if (familyDesc) familyDesc.textContent = family.description;
  if (densityLabel) densityLabel.textContent = family.densityLabel;
  const slider = sliders.count;
  if (slider) {
    slider.min = String(family.densityMin);
    slider.max = String(family.densityMax);
    slider.step = String(family.densityStep);
  }
  if (resetDensity) settings.density = family.densityDefault;
}

function syncInputs(): void {
  if (seedInput) seedInput.value = String(settings.seed);
  if (seedReadout) seedReadout.textContent = String(settings.seed);
  for (const key of SLIDER_KEYS) {
    const slider = sliders[key];
    const readout = readouts[key];
    // The "count" slider drives `density`, which varies per family.
    const value = key === "count" ? settings.density : settings[key];
    if (slider) slider.value = String(value);
    if (readout) readout.textContent = String(value);
  }
}

function render(): void {
  if (!bg) return;
  bg.innerHTML = generatePattern(settings);
  syncInputs();
  // Let the dialog accent follow the current pattern hue.
  document.documentElement.style.setProperty("--pattern-accent", `hsl(${settings.hue} 90% 65%)`);
}

// A manual edit means the settings no longer match the active preset.
function markChanged(): void {
  if (activePresetName === null) return;
  activePresetName = null;
  if (!presetList) return;
  presetList.querySelectorAll(".preset-item.active").forEach((element) => {
    element.classList.remove("active");
  });
}

function update(key: SliderKey, value: number): void {
  markChanged();
  if (key === "count") {
    settings.density = Math.round(value);
  } else if (key === "colors") {
    settings.colors = Math.round(value);
  } else {
    settings[key] = value;
  }
  render();
}

// --- Pattern file -----------------------------------------------------------

function setFileStatus(message: string): void {
  if (!patternFileStatus) return;
  patternFileStatus.textContent = message;
  patternFileStatus.hidden = false;
}

function downloadSvg(): void {
  const blob = new Blob([generateStandaloneSvg(settings)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pattern.svg";
  link.click();
  URL.revokeObjectURL(url);
  setFileStatus("Downloaded pattern.svg.");
}

// Copy the SVG markup to the clipboard via the async Clipboard API, falling
// back to the legacy execCommand path when it is unavailable.
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

async function copySvg(): Promise<void> {
  const copied = await writeClipboard(generateStandaloneSvg(settings));
  setFileStatus(
    copied ? "SVG copied to clipboard." : "Clipboard unavailable — use Download SVG instead.",
  );
}

// --- Presets ----------------------------------------------------------------

function setStatus(message: string): void {
  if (!presetStatus) return;
  presetStatus.textContent = message;
  presetStatus.hidden = false;
}

function readStoredPresets(): void {
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return;
    presets = parsePresets(raw) ?? [];
  } catch {
    presets = [];
  }
}

function storePresets(): void {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, serializePresets(presets));
  } catch {
    setStatus("Storage unavailable — export your presets to keep them.");
  }
}

function renderPresetList(): void {
  if (!presetList) return;
  presetList.innerHTML = "";
  const sorted = sortPresets(presets);
  for (const preset of sorted) {
    const row = document.createElement("div");
    row.className = "preset-item";
    if (preset.name === activePresetName) row.classList.add("active");

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "preset-name-btn";
    loadButton.textContent = preset.name;
    loadButton.addEventListener("click", () => applyPreset(preset));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "preset-delete";
    deleteButton.textContent = "✕";
    deleteButton.setAttribute("aria-label", `Delete preset ${preset.name}`);
    deleteButton.addEventListener("click", () => {
      presets = removePreset(presets, preset.name);
      storePresets();
      renderPresetList();
      setStatus(`Preset "${preset.name}" deleted.`);
    });

    row.append(loadButton, deleteButton);
    presetList.appendChild(row);
  }
}

function applyPreset(preset: Preset): void {
  Object.assign(settings, { ...preset.settings });
  activePresetName = preset.name;
  applyFamily(false);
  render();
  renderPresetList();
  setStatus(`Loaded preset "${preset.name}".`);
}

function savePreset(): void {
  const rawName = presetNameInput ? presetNameInput.value.trim() : "";
  const name = rawName || `Preset ${presets.length + 1}`;
  const updated = presets.some((preset) => preset.name === name);
  presets = upsertPreset(presets, { name, settings: { ...settings } });
  storePresets();
  renderPresetList();
  if (presetNameInput) presetNameInput.value = "";
  setStatus(updated ? `Preset "${name}" updated.` : `Preset "${name}" saved.`);
}

function exportPresets(): void {
  if (presets.length === 0) {
    setStatus("Nothing to export yet — save a preset first.");
    return;
  }
  const blob = new Blob([serializePresets(presets)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pattern-presets.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${presets.length} preset${presets.length === 1 ? "" : "s"}.`);
}

async function importPresets(): Promise<void> {
  const file = presetFileInput?.files?.[0];
  if (presetFileInput) presetFileInput.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const imported = parsePresets(text);
    if (!imported) {
      setStatus("Invalid preset file — no usable presets found.");
      return;
    }
    let added = 0;
    let updated = 0;
    for (const preset of imported) {
      const exists = presets.some((entry) => entry.name === preset.name);
      presets = upsertPreset(presets, preset);
      if (exists) updated++;
      else added++;
    }
    storePresets();
    renderPresetList();
    setStatus(
      `Imported ${imported.length} preset${imported.length === 1 ? "" : "s"} (${added} new, ${updated} updated).`,
    );
  } catch {
    setStatus("Could not read the file.");
  }
}

if (patternSelect) {
  patternSelect.addEventListener("change", () => {
    markChanged();
    settings.family = patternSelect.value as FamilyId;
    applyFamily();
    render();
  });
}

if (seedInput) {
  seedInput.addEventListener("input", () => {
    const value = Number.parseInt(seedInput.value, 10);
    if (Number.isNaN(value)) return;
    markChanged();
    settings.seed = value >>> 0;
    render();
  });
}

if (seedRandomBtn) {
  seedRandomBtn.addEventListener("click", () => {
    markChanged();
    settings.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    render();
  });
}

for (const key of SLIDER_KEYS) {
  const slider = sliders[key];
  if (!slider) continue;
  slider.addEventListener("input", () => {
    update(key, Number.parseFloat(slider.value));
  });
}

if (presetSaveBtn) {
  presetSaveBtn.addEventListener("click", savePreset);
}

if (patternDownloadBtn) {
  patternDownloadBtn.addEventListener("click", downloadSvg);
}

if (patternCopyBtn) {
  patternCopyBtn.addEventListener("click", () => {
    void copySvg();
  });
}

if (presetExportBtn) {
  presetExportBtn.addEventListener("click", exportPresets);
}

if (presetImportBtn) {
  presetImportBtn.addEventListener("click", () => {
    presetFileInput?.click();
  });
}

if (presetFileInput) {
  presetFileInput.addEventListener("change", () => {
    void importPresets();
  });
}

readStoredPresets();
fillPatternSelect();
applyFamily();
render();
renderPresetList();

void bg;
