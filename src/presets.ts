// src/presets.ts
//
// Preset handling for the Pattern Studio (demo3). A preset is a named
// snapshot of the pattern settings. This module is pure (no DOM, no storage):
// it validates, sanitizes and serializes presets, so the exported files and
// the localStorage content always stay in a known shape.

import { FAMILY_BY_ID, type FamilyId, type PatternSettings } from "./patterns";

export interface Preset {
  name: string;
  settings: PatternSettings;
}

export const PRESET_FILE_VERSION = 1;

// Sort presets by name, so list and export have a stable order.
export function sortPresets(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => a.name.localeCompare(b.name));
}

// Insert a preset or replace an existing one with the same name.
export function upsertPreset(presets: Preset[], preset: Preset): Preset[] {
  const withoutName = presets.filter((entry) => entry.name !== preset.name);
  return [...withoutName, preset];
}

export function removePreset(presets: Preset[], name: string): Preset[] {
  return presets.filter((entry) => entry.name !== name);
}

// Serialize presets for storage and export.
export function serializePresets(presets: Preset[]): string {
  return JSON.stringify({ version: PRESET_FILE_VERSION, presets: sortPresets(presets) }, null, 2);
}

// Parse exported JSON into presets. Unknown values are dropped, out-of-range
// values are clamped. Returns null when nothing usable could be read.
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
