/**
 * `<pattern-tiles>` — the saved patterns as a grid of small previews.
 *
 * @remarks
 * A pattern is fully decided by its settings, so a tile needs nothing but the
 * settings of a saved pattern to draw it. The element renders the previews
 * itself, from the same engine the page background comes from, and keeps the
 * list sorted, so what is on the tiles always matches what is stored.
 *
 * A tile is the pattern and nothing else: its name comes up on hover, and the
 * two actions — load a pattern and delete it — are on the tile itself. Picking
 * one is reported through the `select` event, deleting through `remove`; the
 * element never changes or discards a pattern itself, that is the caller's
 * business.
 *
 * @example
 * ```html
 * <pattern-tiles></pattern-tiles>
 * ```
 *
 * ```ts
 * const tiles = document.querySelector("pattern-tiles");
 * tiles.presets = presets;
 * tiles.addEventListener("select", (event) => {
 *   studio.applyPreset(tilesDetail<PatternTilesSelectDetail>(event).preset);
 * });
 * ```
 *
 * @remarks
 * Like every other element here, the tiles take the colors of the page through
 * custom properties: `--pattern-tiles-accent` for the hue, `--pattern-tiles-size`
 * for the smallest tile, and so on. Everything else has a dark default, so the
 * element also works on a page that sets none of them.
 */
import { generateThumbnail } from "./pattern";
import { type Preset, sortPresets } from "./presets";

declare global {
  interface HTMLElementTagNameMap {
    "pattern-tiles": PatternTilesElement;
  }
}

// --- Styles ----------------------------------------------------------------

/**
 * The style of the element, in its shadow root.
 *
 * @remarks
 * The page reset does not reach into a shadow root, so the parts get the
 * border-box sizing and the button reset from here. The `--_` names below are
 * internal and only exist to keep the rules readable.
 */
const STYLES = `
  :host {
    display: block;
    font-family: inherit;

    --_accent: var(--pattern-tiles-accent, var(--accent, #00d4ff));
    --_text: var(--pattern-tiles-text, var(--text, #eee));
    --_muted: var(--pattern-tiles-text-muted, var(--text-muted, #888));
    --_border: var(--pattern-tiles-border, var(--border, rgba(255, 255, 255, 0.1)));
    --_hover: var(--pattern-tiles-surface-hover, var(--surface-hover, rgba(255, 255, 255, 0.06)));
    --_field: var(--pattern-tiles-tile-background, rgba(0, 0, 0, 0.35));
    --_size: var(--pattern-tiles-size, 64px);
  }

  :host,
  :host *,
  :host *::before,
  :host *::after {
    box-sizing: border-box;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--_size), 1fr));
    gap: 0.5rem;
  }

  /* The tile is the frame; the open button covers all of it, and the name and
     the delete button lie over that. */
  .tile {
    position: relative;
    border: 1px solid var(--_border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--_field);
  }

  .tile.is-active {
    border-color: var(--_accent);
    box-shadow: 0 0 0 1px var(--_accent);
  }

  .tile-open {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: none;
    background: none;
    color: var(--_text);
    font: inherit;
    cursor: pointer;
  }

  .tile-open:focus-visible {
    /* Inside the tile, because the tile clips what is drawn outside of it. */
    outline: 2px solid var(--_accent);
    outline-offset: -2px;
  }

  .tile-thumb {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tile:hover .tile-thumb {
    filter: brightness(1.15) saturate(1.2);
  }

  /* The name and the delete button only show while the tile is in use, so the
     patterns are what the list is about. */
  .tile-name,
  .tile-remove {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .tile:hover .tile-name,
  .tile:hover .tile-remove,
  .tile:focus-within .tile-name,
  .tile:focus-within .tile-remove {
    opacity: 1;
  }

  .tile-name {
    position: absolute;
    inset: auto 0 0 0;
    padding: 0.9rem 0.3rem 0.25rem;
    font-size: 0.65rem;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* The name lies over the pattern, so it brings its own contrast. */
    background: linear-gradient(180deg, rgba(0, 0, 0, 0%), rgba(0, 0, 0, 0.85));
    pointer-events: none;
  }

  .tile-remove {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 1px solid var(--_border);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: var(--_text);
    font: inherit;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
  }

  .tile-remove:hover {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }

  .empty {
    margin: 0;
    font-size: 0.8rem;
    color: var(--_muted);
  }

  /* Nothing to hover on: the name stays, or the tiles would be nameless. */
  @media (hover: none) {
    .tile-name,
    .tile-remove {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile-name,
    .tile-remove {
      transition: none;
    }
  }
`;

// --- Events ----------------------------------------------------------------

/** What a `select` event carries: the pattern the user picked. */
export interface PatternTilesSelectDetail {
  preset: Preset;
}

/** What a `remove` event carries: the name of the pattern to delete. */
export interface PatternTilesRemoveDetail {
  name: string;
}

/**
 * The detail of an event of the tiles.
 *
 * @remarks
 * The events are the element's own, so the type of their detail is not part of
 * the events a caller knows by name. This reads it, once, where the tiles are
 * listened to.
 *
 * @param event - The event that was fired.
 * @returns The detail it carries.
 */
export function tilesDetail<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

/**
 * A saved picture as the source of an image.
 *
 * @remarks
 * A data URL needs no file and no second request, and the same settings always
 * give the same URL, which the browser then holds in its image cache.
 */
function previewUrl(preset: Preset): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateThumbnail(preset.settings))}`;
}

// --- Tiles -----------------------------------------------------------------

/**
 * `<pattern-tiles>` — a list of saved patterns, each one a preview of itself.
 *
 * @remarks
 * See the module comment above for what it is for and how to use it.
 */
class PatternTilesElement extends HTMLElement {
  static observedAttributes = ["active"];

  private readonly grid: HTMLElement;
  private readonly empty: HTMLElement;
  private items: Preset[] = [];
  private current: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="grid" part="grid"></div>
      <p class="empty" part="empty">No presets yet — save one above.</p>
    `;
    this.grid = shadow.querySelector(".grid") as HTMLElement;
    this.empty = shadow.querySelector(".empty") as HTMLElement;
    this.grid.addEventListener("click", (event) => {
      this.onClick(event);
    });
  }

  connectedCallback(): void {
    // The markup may name the active pattern before the presets arrive.
    this.current = this.getAttribute("active");
    this.draw();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "active") {
      this.active = value;
    }
  }

  /** The patterns to show, as they are stored. */
  get presets(): Preset[] {
    return [...this.items];
  }

  /**
   * Hands the tiles the patterns to show; the grid is drawn from them, sorted by
   * name so that a tile keeps its place while the list changes.
   */
  set presets(presets: Preset[]) {
    this.items = sortPresets(presets);
    this.draw();
  }

  /** The name of the pattern the current settings came from. */
  get active(): string | null {
    return this.current;
  }

  /**
   * Puts the active state on the tile of that pattern, and on no other.
   *
   * @param name - Name of the pattern, or `null` when the settings match none.
   */
  set active(name: string | null) {
    this.current = name;
    this.markActive();
  }

  // --- Drawing -------------------------------------------------------------

  private draw(): void {
    this.grid.replaceChildren(...this.items.map((preset) => this.drawTile(preset)));
    this.empty.hidden = this.items.length > 0;
    this.markActive();
  }

  private drawTile(preset: Preset): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.part.add("tile");

    // The name of the tile travels in `data-name`: it is what both buttons of a
    // tile are found by, and what a click is read back from.
    const open = document.createElement("button");
    open.type = "button";
    open.className = "tile-open";
    open.part.add("open");
    open.dataset.name = preset.name;
    open.setAttribute("aria-label", `Load preset ${preset.name}`);

    const thumb = document.createElement("img");
    thumb.className = "tile-thumb";
    thumb.part.add("thumb");
    // The name of the tile is on the button, so the image needs no text.
    thumb.alt = "";
    thumb.decoding = "async";
    thumb.src = previewUrl(preset);

    const name = document.createElement("span");
    name.className = "tile-name";
    name.part.add("name");
    name.textContent = preset.name;
    open.append(thumb, name);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tile-remove";
    remove.part.add("remove");
    remove.dataset.name = preset.name;
    remove.setAttribute("aria-label", `Delete preset ${preset.name}`);
    remove.textContent = "✕";

    tile.append(open, remove);
    return tile;
  }

  private markActive(): void {
    for (const open of this.grid.querySelectorAll<HTMLElement>(".tile-open")) {
      const isActive = open.dataset.name === this.current;
      open.setAttribute("aria-current", String(isActive));
      open.closest(".tile")?.classList.toggle("is-active", isActive);
    }
  }

  // --- Wiring --------------------------------------------------------------

  private onClick(event: MouseEvent): void {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-name]") : null;
    const name = target?.dataset.name;
    if (!target || !name) return;
    const preset = this.items.find((entry) => entry.name === name);
    if (!preset) return;
    if (!target.classList.contains("tile-remove")) {
      this.fireSelect(preset);
      return;
    }
    // The delete button sits on the tile and comes up on hover, so a click meant
    // for the pattern would hit it. Deleting cannot be undone, so the question
    // comes first, here where the click happened.
    if (window.confirm(`Delete preset "${name}"? This cannot be undone.`)) this.fireRemove(name);
  }

  private fireSelect(preset: Preset): void {
    this.dispatchEvent(
      new CustomEvent<PatternTilesSelectDetail>("select", {
        detail: { preset },
        bubbles: true,
      }),
    );
  }

  private fireRemove(name: string): void {
    this.dispatchEvent(
      new CustomEvent<PatternTilesRemoveDetail>("remove", {
        detail: { name },
        bubbles: true,
      }),
    );
  }
}

customElements.define("pattern-tiles", PatternTilesElement);

export { PatternTilesElement };
