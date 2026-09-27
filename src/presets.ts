/**
 * Preset handling for the Pattern Studio.
 *
 * @remarks
 * A preset is a named snapshot of a pattern's settings. This module is pure — no
 * DOM, no storage — and it validates, sanitizes and serializes, so that what
 * comes back out of localStorage and what comes in through an imported file is
 * always in the shape this module defines. Where the presets are kept, and what
 * the page says about them, is the UI's business.
 *
 * @example
 * ```ts
 * const presets = parsePresets(text) ?? [];
 * const stored = JSON.stringify(serializePresets(presets));
 * ```
 */
import { FAMILY_BY_ID, type FamilyId, type PatternSettings } from "./pattern";

/**
 * A named pattern, as it is stored and as it is exported.
 */
export interface Preset {
  /** Name the preset is listed and saved under. */
  name: string;
  /** The pattern the preset stands for. */
  settings: PatternSettings;
}

/**
 * Version of the preset file format, written into every export so that a later
 * format can be told apart from this one.
 */
export const PRESET_FILE_VERSION = 1;

/**
 * Returns the presets sorted by name, so that a list and an export file have a
 * stable order.
 *
 * @param presets - The presets to sort.
 * @returns A new, sorted array; the input is left as it is.
 */
export function sortPresets(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds a preset, or replaces the one that already goes by the same name.
 *
 * @param presets - The presets to add to.
 * @param preset - The preset to add or replace.
 * @returns A new array; the input is left as it is.
 */
export function upsertPreset(presets: Preset[], preset: Preset): Preset[] {
  const withoutName = presets.filter((entry) => entry.name !== preset.name);
  return [...withoutName, preset];
}

/**
 * Returns the presets without the one of the given name.
 *
 * @param presets - The presets to filter.
 * @param name - Name of the preset to drop.
 * @returns A new array; the input is left as it is.
 */
export function removePreset(presets: Preset[], name: string): Preset[] {
  return presets.filter((entry) => entry.name !== name);
}

/**
 * Serializes presets into the JSON of the preset file, for storage and export.
 *
 * @param presets - The presets to write.
 * @returns The file content, pretty-printed and sorted by name.
 */
export function serializePresets(presets: Preset[]): string {
  return JSON.stringify({ version: PRESET_FILE_VERSION, presets: sortPresets(presets) }, null, 2);
}

/**
 * Reads presets out of the JSON of a preset file.
 *
 * @remarks
 * Nothing is trusted here: a preset that is not a preset is dropped, values that
 * are out of range are clamped, and a family that no longer exists falls back to
 * a family that does. This is what makes an imported or restored file safe to
 * use.
 *
 * @param json - The file content.
 * @returns The presets that could be read, or `null` if there were none.
 */
export function parsePresets(json: string): Preset[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const list = (parsed as { presets?: unknown }).presets;
  if (!Array.isArray(list)) return null;
  const presets: Preset[] = [];
  for (const entry of list) {
    const preset = sanitizePreset(entry);
    if (preset) presets.push(preset);
  }
  return presets.length > 0 ? presets : null;
}

function sanitizePreset(entry: unknown): Preset | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  const raw = record.settings;
  if (typeof raw !== "object" || raw === null) return null;
  const values = raw as Record<string, unknown>;
  const family = FAMILY_BY_ID.get(values.family as FamilyId);
  if (!family) return null;
  return {
    name,
    settings: {
      family: family.id,
      seed: roundInt(values.seed, 0, 0xffffffff),
      density: clampNumber(values.density, family.densityMin, family.densityMax),
      size: clampNumber(values.size, 40, 400),
      opacity: clampNumber(values.opacity, 0.1, 1),
      colors: roundInt(values.colors, 1, 8),
      hue: wrapDegrees(values.hue),
      rotation: wrapDegrees(values.rotation),
    },
  };
}

function clampNumber(value: unknown, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

function roundInt(value: unknown, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function wrapDegrees(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return ((Math.round(number) % 360) + 360) % 360;
}
