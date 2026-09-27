/**
 * `<jd-select>` — a `<select>` rebuilt as a web component, so that the whole
 * of it can be styled while its API and its events stay the ones of the
 * original.
 *
 * @remarks
 * A native `<select>` draws its options as a popup of the browser or of the
 * operating system. That popup lives outside the page: no CSS reaches it, so it
 * comes out light while the page is dark, and its size is not the page's to
 * choose. This element owns the list instead, so trigger, options, scrollbar
 * and the state of the selection are ordinary elements in a shadow root — and
 * therefore ordinary CSS.
 *
 * What stays the same is the contract. The properties are the ones of a
 * `<select>` (`value`, `selectedIndex`, `options`, `selectedOptions`), the
 * events are the ones of a `<select>` (`input` and `change` whenever the
 * selection changes), and the element takes part in a form the way the original
 * does (`name`, `required`, and the value in the `FormData`).
 *
 * The keyboard follows the combobox pattern of the ARIA practices: the focus
 * stays on the trigger, and the option it is on is named by
 * `aria-activedescendant`.
 *
 * @example
 * ```html
 * <jd-select name="family" label="Pattern" required>
 *   <jd-option value="dots" description="A regular grid of dots">Dots</jd-option>
 *   <jd-option value="rings" description="Thin rings, open">Rings</jd-option>
 * </jd-select>
 * ```
 *
 * ```js
 * select.addEventListener("change", () => {
 *   console.log(select.value);
 * });
 * ```
 *
 * @remarks
 * The options are its children, and the element reads them as they are, also
 * when they are added later. To say which option it starts with, give the
 * element a `value` or mark an option `selected`; with neither, the first
 * option is selected, as a native `<select>` does.
 */

declare global {
  interface HTMLElementTagNameMap {
    "jd-select": JDSelectElement;
    "jd-option": JDOptionElement;
  }
}

/** How many elements are alive, to give each one its own ids. */
let elements = 0;

// --- Styles ----------------------------------------------------------------

/**
 * The style of the element, in its shadow root.
 *
 * @remarks
 * Every color is a hook the page can set from outside — `--jd-select-accent`
 * for the hue, `--jd-select-text` for the words, and so on — with the page's
 * own tokens behind it and a dark default behind those, so the element also
 * works on a page that defines none of them. The `--_` names below are internal
 * and only exist to keep the rules readable.
 */
const STYLES = `
  :host {
    /* The list opens next to the trigger, so it is placed against the host.
       The page sets no overflow above this, so nothing clips it. */
    display: block;
    position: relative;
    font-family: inherit;

    --_accent: var(--jd-select-accent, var(--accent, #00d4ff));
    --_text: var(--jd-select-text, var(--text, #eee));
    --_muted: var(--jd-select-text-muted, var(--text-muted, #888));
    --_border: var(--jd-select-border, var(--border, rgba(255, 255, 255, 0.1)));
    --_hover: var(--jd-select-surface-hover, var(--surface-hover, rgba(255, 255, 255, 0.06)));
    --_field: var(--jd-select-background, rgba(0, 0, 0, 0.3));
    --_list: var(--jd-select-list-background, #1a1a2e);
  }

  /* The reset of the page does not reach into a shadow root, so the parts get
     the border-box sizing from here. */
  :host,
  :host *,
  :host *::before,
  :host *::after {
    box-sizing: border-box;
  }

  .jd-select-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    background: var(--_field);
    color: var(--_text);
    border: 1px solid var(--_border);
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    font-family: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .jd-select-button:hover {
    background: var(--_hover);
    border-color: color-mix(in srgb, var(--_accent) 45%, var(--_border));
  }

  .jd-select-button:focus-visible {
    outline: 2px solid var(--_accent);
    outline-offset: 2px;
  }

  .jd-select-button[aria-expanded="true"] {
    background: var(--_hover);
    border-color: color-mix(in srgb, var(--_accent) 45%, var(--_border));
  }

  :host([disabled]) .jd-select-button {
    cursor: not-allowed;
    opacity: 0.5;
  }

  :host([disabled]) .jd-select-button:hover {
    background: var(--_field);
    border-color: var(--_border);
  }

  .jd-select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jd-select-arrow {
    /* A triangle drawn from two borders, so it needs no image. */
    flex: none;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--_muted);
    transition: transform 0.15s ease;
  }

  .jd-select-button[aria-expanded="true"] .jd-select-arrow {
    transform: rotate(180deg);
  }

  .jd-select-list {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    right: 0;
    z-index: 30;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    /* A solid ground: the list has to stay readable over the pattern behind it. */
    background: var(--_list);
    border: 1px solid color-mix(in srgb, var(--_accent) 30%, var(--_border));
    border-radius: 8px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    /* The list is never taller than the room it has: \`show()\` measures the space
     in the direction it opens and hands it over as \`--_space\`. */
  max-height: min(19rem, var(--_space, 19rem));
    overflow-y: auto;
    /* The list is long enough to scroll, so the scrollbar shows too - and it
       belongs to the design. \`color-scheme\` tells the browser that this widget
       is dark, so even a scrollbar it draws itself fits the card. The two
       properties after it replace it entirely where they are understood: a
       thin thumb in the accent of the current hue over a clear track. */
    color-scheme: dark;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--_accent) 60%, transparent) transparent;
  }

  .jd-select-list[hidden] {
    display: none;
  }

  /* No room below: the list opens upwards, as a native select does. */
  :host([data-direction="up"]) .jd-select-list {
    top: auto;
    bottom: calc(100% + 0.35rem);
  }

  .jd-select-option {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.55rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .jd-select-option:hover,
  .jd-select-option.is-active {
    background: var(--_hover);
  }

  .jd-select-option[aria-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .jd-select-option[aria-selected="true"] {
    background: color-mix(in srgb, var(--_accent) 16%, transparent);
    box-shadow: inset 2px 0 0 var(--_accent);
  }

  .jd-select-option-label {
    color: var(--_text);
    font-size: 0.85rem;
  }

  .jd-select-option[aria-selected="true"] .jd-select-option-label {
    color: var(--_accent);
  }

  .jd-select-option-desc {
    color: var(--_muted);
    font-size: 0.75rem;
    line-height: 1.35;
  }

  @media (prefers-reduced-motion: reduce) {
    .jd-select-arrow {
      transition: none;
    }
  }
`;

// --- Option ----------------------------------------------------------------

/**
 * `<jd-option>` — one choice of a `<jd-select>`, written as markup.
 *
 * @remarks
 * It stands for the data of a choice and is never shown itself: the select
 * reads it and draws its own option in the shadow root, where the state of the
 * selection lives. That is why the read-out goes through the attributes and not
 * through these properties — the select may be upgraded before its options are.
 */
class JDOptionElement extends HTMLElement {
  /** The value of the choice. Without it, the text of the option is used. */
  get value(): string {
    return this.getAttribute("value") ?? labelOf(this);
  }

  set value(value: string) {
    this.setAttribute("value", value);
  }

  /** The name of the choice. Without it, the text of the option is used. */
  get label(): string {
    return labelOf(this);
  }

  set label(label: string) {
    this.setAttribute("label", label);
  }

  /** One sentence about the choice, shown under its name. */
  get description(): string {
    return this.getAttribute("description") ?? "";
  }

  set description(description: string) {
    this.setAttribute("description", description);
  }

  /** Whether the choice can be picked. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(disabled: boolean) {
    this.toggleAttribute("disabled", disabled);
  }

  /** Whether this is the chosen option. Written by the select. */
  get selected(): boolean {
    return this.hasAttribute("selected");
  }

  set selected(selected: boolean) {
    this.toggleAttribute("selected", selected);
  }
}

/**
 * The name of an option: its `label` attribute, or else its own text — the rule
 * of a native `<option>`.
 */
function labelOf(option: Element): string {
  return option.getAttribute("label") ?? option.textContent?.trim() ?? "";
}

/** The value of an option: its `value` attribute, or else its name. */
function optionValue(option: Element): string {
  return option.getAttribute("value") ?? labelOf(option);
}

/** The sentence under the name of an option. */
function descriptionOf(option: Element): string {
  return option.getAttribute("description") ?? "";
}

// --- Select ----------------------------------------------------------------

/**
 * `<jd-select>` — a select whose list is the page's own markup again.
 *
 * @remarks
 * See the module comment above for what it is for and how to use it.
 */
class JDSelectElement extends HTMLElement {
  static formAssociated = true;

  static observedAttributes = ["value", "label", "aria-label", "disabled", "required"];

  private readonly shadow: ShadowRoot;
  private readonly button: HTMLButtonElement;
  private readonly valueText: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly listId: string;
  private readonly items: HTMLLIElement[] = [];
  private readonly internals: ElementInternals;
  private observer: MutationObserver | null = null;
  private active = 0;
  private opened = false;
  private typeAheadText = "";
  private typeAheadTimer = 0;

  constructor() {
    super();
    // Ids have to be unique inside a shadow root, so each element counts up.
    elements += 1;
    this.listId = `jd-select-${elements}`;
    this.internals = this.attachInternals();
    this.shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    this.shadow.innerHTML = `
      <style>${STYLES}</style>
      <button
        class="jd-select-button"
        part="button"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="${this.listId}"
      >
        <span class="jd-select-value" part="value"></span>
        <span class="jd-select-arrow" part="arrow" aria-hidden="true"></span>
      </button>
      <ul
        class="jd-select-list"
        part="list"
        id="${this.listId}"
        role="listbox"
        hidden
      ></ul>
    `;
    this.button = this.shadow.querySelector(".jd-select-button") as HTMLButtonElement;
    this.valueText = this.shadow.querySelector(".jd-select-value") as HTMLElement;
    this.list = this.shadow.querySelector(".jd-select-list") as HTMLUListElement;
    this.button.addEventListener("click", () => {
      this.toggle();
    });
    this.button.addEventListener("keydown", (event) => {
      this.onKeyDown(event);
    });
    this.list.addEventListener("click", (event) => {
      this.onOptionClick(event);
    });
    this.list.addEventListener("pointermove", (event) => {
      this.onOptionHover(event);
    });
    this.list.addEventListener("mousedown", (event) => {
      // The list holds no focus of its own, so the trigger keeps it.
      event.preventDefault();
    });
  }

  connectedCallback(): void {
    // Options can be added, removed or changed at any time; the list follows.
    this.observer = new MutationObserver(() => {
      this.drawOptions();
    });
    this.observer.observe(this, {
      childList: true,
      attributes: true,
      attributeFilter: ["selected", "disabled", "value", "label", "description"],
    });
    // A click outside closes the list. The event comes out of the shadow root
    // retargeted, so the path is what says where it really happened.
    document.addEventListener("pointerdown", this.onPointerDownOutside);
    this.drawOptions();
    this.setAccessibleName();
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = null;
    document.removeEventListener("pointerdown", this.onPointerDownOutside);
    window.clearTimeout(this.typeAheadTimer);
    this.hide();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case "value":
        // Written by the element itself when the selection changes.
        if (value === this.value) return;
        this.setSelection(this.indexOf(value ?? ""), false);
        return;
      case "label":
      case "aria-label":
        this.setAccessibleName();
        return;
      case "required":
        this.updateValidity();
        return;
      case "disabled":
        // A disabled fieldset goes through `formDisabledCallback` instead.
        this.button.disabled = this.disabled;
        return;
      default:
    }
  }

  // --- What a select has ----------------------------------------------------

  /** The value of the chosen option, or the empty string if none is chosen. */
  get value(): string {
    const option = this.options[this.selectedIndex];
    return option ? optionValue(option) : "";
  }

  set value(value: string) {
    this.setSelection(this.indexOf(value), false);
  }

  /** The position of the chosen option among the options, or -1. */
  get selectedIndex(): number {
    return this.options.findIndex((option) => option.hasAttribute("selected"));
  }

  set selectedIndex(index: number) {
    if (index < 0 || index >= this.options.length) return;
    this.setSelection(index, false);
  }

  /** The options of this select, in the order they are written in. */
  get options(): JDOptionElement[] {
    return Array.from(this.children).filter(
      (child): child is JDOptionElement => child.tagName === "JD-OPTION",
    );
  }

  /** The chosen options. A select without `multiple` has zero or one. */
  get selectedOptions(): JDOptionElement[] {
    return this.options.filter((option) => option.hasAttribute("selected"));
  }

  /** The number of options, as `HTMLSelectElement.length` counts them. */
  get length(): number {
    return this.options.length;
  }

  /** `select-one`, the value a native select reports. */
  get type(): string {
    return "select-one";
  }

  /** Whether the list is on screen. */
  get open(): boolean {
    return this.opened;
  }

  set open(open: boolean) {
    if (open) {
      this.show();
    } else {
      this.hide();
    }
  }

  /** The name this select submits under. */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  set name(name: string) {
    this.setAttribute("name", name);
  }

  /** Whether the select can be used at all. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(disabled: boolean) {
    this.toggleAttribute("disabled", disabled);
  }

  /** Whether a choice has to be made before the form goes through. */
  get required(): boolean {
    return this.hasAttribute("required");
  }

  set required(required: boolean) {
    this.toggleAttribute("required", required);
  }

  /** The form this select belongs to, or null. */
  get form(): HTMLFormElement | null {
    return this.internals.form;
  }

  /** The labels written for this select, as `HTMLSelectElement.labels` gives them. */
  get labels(): NodeList | null {
    return this.internals.labels ?? null;
  }

  /** Whether the choice that is made now is one this select accepts. */
  checkValidity(): boolean {
    return this.internals.checkValidity();
  }

  /** As `checkValidity`, and shows the message when it is not valid. */
  reportValidity(): boolean {
    return this.internals.reportValidity();
  }

  /** Opens the list, as `HTMLSelectElement.showPicker` opens the popup. */
  showPicker(): void {
    this.show();
  }

  formResetCallback(): void {
    this.setSelection(this.firstEnabled(), false);
  }

  formStateRestoreCallback(state: string | null): void {
    this.setSelection(state === null ? -1 : this.indexOf(state), false);
  }

  formDisabledCallback(disabled: boolean): void {
    this.button.disabled = disabled;
  }

  // --- Drawing --------------------------------------------------------------

  /** Builds the list of options from the children, and paints everything. */
  private drawOptions(): void {
    const options = this.options;
    this.items.length = 0;
    const items = options.map((option, index) => this.drawOption(option, index));
    this.list.replaceChildren(...items);
    this.items.push(...items);
    if (this.selectedIndex < 0) {
      // As a native select does: without a choice, the first option is it.
      this.setSelection(this.firstEnabled(), false);
      return;
    }
    this.paint();
  }

  private drawOption(option: JDOptionElement, index: number): HTMLLIElement {
    const item = document.createElement("li");
    item.id = `${this.listId}-option-${index}`;
    item.className = "jd-select-option";
    item.setAttribute("role", "option");
    item.setAttribute("part", "option");
    const label = document.createElement("span");
    label.className = "jd-select-option-label";
    label.textContent = labelOf(option);
    item.append(label);
    const description = descriptionOf(option);
    if (description !== "") {
      const note = document.createElement("span");
      note.className = "jd-select-option-desc";
      note.textContent = description;
      item.append(note);
    }
    return item;
  }

  /** Brings every part of the shadow root in line with the chosen option. */
  private paint(): void {
    const index = this.selectedIndex;
    this.items.forEach((item, position) => {
      item.setAttribute("aria-selected", String(position === index));
      item.setAttribute(
        "aria-disabled",
        String(this.options[position]?.hasAttribute("disabled") ?? false),
      );
    });
    this.valueText.textContent = index < 0 ? "" : labelOf(this.options[index]);
    this.active = index < 0 ? 0 : index;
    this.markActive();
    this.reflect(this.value);
    this.internals.setFormValue(this.value);
    this.updateValidity();
  }

  /**
   * Shows an option as the chosen one, and tells the form about it.
   *
   * @param notify Whether the change came from the user, which is when the
   * events go out. Setting a value from script changes it without a sound.
   */
  private setSelection(index: number, notify: boolean): void {
    const wanted = this.options[index];
    const changed = this.value !== (wanted ? optionValue(wanted) : "");
    this.options.forEach((option, position) => {
      option.toggleAttribute("selected", position === index);
    });
    this.paint();
    if (notify && changed) this.fireChange();
  }

  private reflect(value: string): void {
    if (this.getAttribute("value") !== value) this.setAttribute("value", value);
  }

  private fireChange(): void {
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  /**
   * Gives the trigger its name. A name on the host does not reach into the
   * shadow root, so it is copied onto the button by hand - including the text
   * of a `<label for>`, which cannot cross the boundary either.
   */
  private setAccessibleName(): void {
    this.button.setAttribute("aria-label", this.nameFromOutside());
  }

  /**
   * The name the page gives this select, strongest source first.
   *
   * @remarks
   * The attribute hooks come first, then the text of the labels - which is what
   * a native select ends up with too. An empty name is set rather than none,
   * so the chosen option in the trigger is never read as the name of the field.
   */
  private nameFromOutside(): string {
    const fromAttribute = this.getAttribute("aria-label") ?? this.getAttribute("label");
    if (fromAttribute) return fromAttribute;
    const labels = Array.from(this.labels ?? [], (label) => label.textContent?.trim() ?? "");
    return labels.filter((text) => text !== "").join(" ");
  }

  private updateValidity(): void {
    if (this.required && this.value === "") {
      const message = this.getAttribute("validation-message") ?? "Please choose an option.";
      this.internals.setValidity({ valueMissing: true }, message, this.button);
      return;
    }
    this.internals.setValidity({});
  }

  // --- Open and close -------------------------------------------------------

  private toggle(): void {
    if (this.opened) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show(): void {
    if (this.opened || this.disabled || this.options.length === 0) return;
    this.opened = true;
    this.list.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    this.place();
    // Opening starts on the chosen option, as a native select does.
    this.active = Math.max(this.selectedIndex, 0);
    this.markActive();
    this.scrollActive();
  }

  private hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.list.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    this.removeAttribute("data-direction");
    this.markActive();
  }

  /**
   * Decides which way the list opens and how tall it may be.
   *
   * @remarks
   * Below the trigger is the natural place. When there is more room above than
   * below, the list goes up instead - a native select does the same, and a
   * list that runs off the bottom of the window cannot be read. The room it
   * has is handed to the styles as `--_space`, where it caps the height, so
   * the list ends at the edge of the window in either direction.
   */
  private place(): void {
    const gap = 6; // the gap the styles leave between trigger and list
    const trigger = this.button.getBoundingClientRect();
    const below = window.innerHeight - trigger.bottom - gap;
    const above = trigger.top - gap;
    if (above > below) {
      this.setAttribute("data-direction", "up");
      this.style.setProperty("--_space", `${Math.round(above)}px`);
      return;
    }
    this.removeAttribute("data-direction");
    this.style.setProperty("--_space", `${Math.round(below)}px`);
  }

  // --- The active option ----------------------------------------------------

  private firstEnabled(): number {
    return this.options.findIndex((option) => !option.hasAttribute("disabled"));
  }

  private indexOf(value: string): number {
    return this.options.findIndex((option) => optionValue(option) === value);
  }

  /**
   * Puts the active option on the first usable one, counting from `start` in
   * the direction of `step` — `start` itself included, so the keyboard can name
   * the neighbour to move to. Disabled options are passed over; when every
   * option is disabled, the active one stays where it was.
   */
  private moveActive(start: number, step: number): void {
    const count = this.options.length;
    if (count === 0) return;
    let index = ((start % count) + count) % count;
    for (let tried = 0; tried < count; tried += 1) {
      if (!this.options[index]?.hasAttribute("disabled")) break;
      index = (index + step + count) % count;
    }
    this.active = index;
    this.markActive();
    this.scrollActive();
  }

  /** Names the active option, so a screen reader reads it while arrowing. */
  private markActive(): void {
    this.items.forEach((item, index) => {
      item.classList.toggle("is-active", index === this.active);
    });
    const item = this.items[this.active];
    if (this.opened && item) {
      this.button.setAttribute("aria-activedescendant", item.id);
      return;
    }
    this.button.removeAttribute("aria-activedescendant");
  }

  private scrollActive(): void {
    this.items[this.active]?.scrollIntoView({ block: "nearest" });
  }

  // --- The user -------------------------------------------------------------

  private onOptionClick(event: MouseEvent): void {
    const index = this.items.indexOf(closestItem(event.target) as HTMLLIElement);
    const option = this.options[index];
    if (!option || option.hasAttribute("disabled")) return;
    this.hide();
    this.setSelection(index, true);
  }

  private onOptionHover(event: PointerEvent): void {
    const index = this.items.indexOf(closestItem(event.target) as HTMLLIElement);
    if (index < 0 || index === this.active) return;
    if (this.options[index]?.hasAttribute("disabled")) return;
    this.active = index;
    this.markActive();
  }

  private onPointerDownOutside = (event: PointerEvent): void => {
    if (!this.opened) return;
    if (event.composedPath().includes(this)) return;
    this.hide();
  };

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (this.opened) this.moveActive(this.active + 1, 1);
        else this.show();
        return;
      case "ArrowUp":
        event.preventDefault();
        if (this.opened) this.moveActive(this.active - 1, -1);
        else this.show();
        return;
      case "Home":
        if (!this.opened) return;
        event.preventDefault();
        this.moveActive(0, 1);
        return;
      case "End":
        if (!this.opened) return;
        event.preventDefault();
        this.moveActive(this.options.length - 1, -1);
        return;
      case "Enter":
      case " ":
        // Handled here, so the button does not also answer with a click.
        event.preventDefault();
        if (this.opened) this.chooseActive();
        else this.show();
        return;
      case "Escape":
        if (!this.opened) return;
        // Nothing is chosen while arrowing, so closing leaves the value as it
        // was — which is what Escape is for.
        event.preventDefault();
        this.hide();
        return;
      case "Tab":
        this.hide();
        return;
      default:
    }
    if (this.opened) this.onTypeAhead(event);
  }

  private chooseActive(): void {
    const index = this.active;
    if (index < 0 || this.options[index]?.hasAttribute("disabled")) return;
    this.hide();
    this.setSelection(index, true);
  }

  /**
   * Jumps to the option whose name starts with what is being typed, the way a
   * native select does. The letters are collected for a moment, so that a
   * second word can be typed; on their own they step through the options that
   * begin with them.
   */
  private onTypeAhead(event: KeyboardEvent): void {
    if (event.key.length !== 1) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.typeAheadText += event.key.toLowerCase();
    window.clearTimeout(this.typeAheadTimer);
    this.typeAheadTimer = window.setTimeout(() => {
      this.typeAheadText = "";
    }, 600);
    // From the option after the active one, so that typing the same letter
    // again steps to the next option that begins with it.
    const start = this.active + 1;
    const count = this.options.length;
    for (let tried = 0; tried < count; tried += 1) {
      const index = (start + tried) % count;
      const option = this.options[index];
      if (!option || option.hasAttribute("disabled")) continue;
      if (labelOf(option).toLowerCase().startsWith(this.typeAheadText)) {
        this.active = index;
        this.markActive();
        this.scrollActive();
        return;
      }
    }
  }
}

/** The option an event happened on, as the closest item of the list. */
function closestItem(target: EventTarget | null): HTMLLIElement {
  const element = target instanceof Element ? target : null;
  return (element?.closest<HTMLLIElement>(".jd-select-option") ?? null) as HTMLLIElement;
}

customElements.define("jd-select", JDSelectElement);
customElements.define("jd-option", JDOptionElement);

export { JDOptionElement, JDSelectElement };
