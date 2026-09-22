// Importing the module registers the <svg-morph> custom element via
// customElements.define(), so we can use it below.
import "./svg-morph";

// The sprite is read at runtime: swapping sprite.svg in public/ is enough,
// this demo page then adapts automatically to whatever symbols it contains.
const SPRITE_HREF = "./sprite.svg";

interface CardButton {
  label: string;
  action: (morph: HTMLElementTagNameMap["svg-morph"]) => void;
}

interface CardConfig {
  title: string;
  description: string;
  /** Icon IDs to pass to the component, or null to load all sprite symbols. */
  icons: string[] | null;
  /** Extra attributes for the <svg-morph> element. */
  attributes: Record<string, string>;
  /** Markup shown in the <code> block below the card. */
  note: string;
  /** Optional buttons wired to the component via its JS API. */
  buttons?: CardButton[];
}

// Read all symbol IDs currently present in the sprite.
async function loadIconIds(href: string): Promise<string[]> {
  const response = await fetch(href);
  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return Array.from(doc.querySelectorAll("symbol[id]")).map((symbol) => symbol.id);
}

// Pick `count` icon IDs, cycling when the sprite has fewer symbols.
function pickIcons(icons: readonly string[], count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(icons[i % icons.length]);
  }
  return result;
}

// Render the complete <svg-morph> element for a card from its icon selection
// and extra attributes, so the code block below always shows valid HTML the
// user can copy.
function markupNote(icons: string[] | null, attributes: Record<string, string>): string {
  const parts: string[] = [`sprite-href="${SPRITE_HREF}"`];
  if (icons) {
    parts.push(`icons="${icons.join(",")}"`);
  }
  for (const [name, value] of Object.entries(attributes)) {
    parts.push(`${name}="${value}"`);
  }
  return `<svg-morph ${parts.join(" ")}></svg-morph>`;
}

function createButton(
  config: CardButton,
  morph: HTMLElementTagNameMap["svg-morph"],
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = config.label;
  button.addEventListener("click", () => config.action(morph));
  return button;
}

function createCard(config: CardConfig): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = config.title;
  card.append(title);

  const description = document.createElement("p");
  description.textContent = config.description;
  card.append(description);

  const example = document.createElement("div");
  example.className = "example";

  const morph = document.createElement("svg-morph");
  morph.setAttribute("sprite-href", SPRITE_HREF);
  morph.setAttribute("width", "200");
  morph.setAttribute("height", "200");
  // Show the built-in controls and icon label on every demo card so the
  // whole feature set is visible at a glance.
  morph.setAttribute("controls", "true");
  morph.setAttribute("debug", "true");
  for (const [name, value] of Object.entries(config.attributes)) {
    morph.setAttribute(name, value);
  }
  if (config.icons) {
    morph.setAttribute("icons", config.icons.join(","));
  }
  example.append(morph);
  card.append(example);

  if (config.buttons) {
    const controls = document.createElement("div");
    controls.className = "controls";
    for (const buttonConfig of config.buttons) {
      controls.append(createButton(buttonConfig, morph));
    }
    card.append(controls);
  }

  const note = document.createElement("code");
  note.textContent = config.note;
  card.append(note);

  return card;
}

async function buildDemo(): Promise<void> {
  const grid = document.getElementById("demo-grid");
  if (!grid) return;

  const icons = await loadIconIds(SPRITE_HREF);
  if (icons.length === 0) {
    grid.textContent = `No icons found in ${SPRITE_HREF}`;
    return;
  }

  const allIcons = pickIcons(icons, 4);
  const cards: CardConfig[] = [
    {
      title: "Basic (all icons, auto-play)",
      description: "Loads all symbols from sprite, morphs continuously",
      icons: null,
      attributes: {},
      note: `<svg-morph sprite-href="./sprite.svg"></svg-morph>`,
    },
    {
      title: "Specific Icons Only",
      description: "Comma-separated list of symbol IDs",
      icons: allIcons,
      attributes: { fill: "#ff6b6b" },
      note: markupNote(allIcons, { fill: "#ff6b6b" }),
    },
    {
      title: "Slow Morph (5s)",
      description: "Custom duration and easing",
      icons: pickIcons(icons, 3),
      attributes: { duration: "5", ease: "elastic.out(1, 0.5)", fill: "#4ecdc4" },
      note: markupNote(pickIcons(icons, 3), {
        duration: "5",
        ease: "elastic.out(1, 0.5)",
        fill: "#4ecdc4",
      }),
    },
    {
      title: "Manual Control (no autoplay)",
      description: "Use built-in controls or JS API",
      icons: allIcons,
      attributes: { autoplay: "false", fill: "#ffe66d" },
      note: markupNote(allIcons, { autoplay: "false", fill: "#ffe66d" }),
    },
    {
      title: "Reverse Direction",
      description: "Morphs backwards through icons",
      icons: allIcons,
      attributes: { direction: "reverse", fill: "#a855f7" },
      note: markupNote(allIcons, { direction: "reverse", fill: "#a855f7" }),
    },
    {
      title: "Start Index",
      description: "Begin from 3rd icon",
      icons: pickIcons(icons, 5),
      attributes: { "start-index": "2", fill: "#f97316" },
      note: markupNote(pickIcons(icons, 5), { "start-index": "2", fill: "#f97316" }),
    },
    {
      title: "Dynamic Attributes",
      description: "Change fill, duration via JS",
      icons: allIcons,
      attributes: {},
      note: `${markupNote(allIcons, {})}\n// morph.setAttribute("fill", "#7fdbca")`,
      buttons: [
        {
          label: "Random Color",
          action: (morph) => {
            const color = `#${Math.floor(Math.random() * 0xffffff)
              .toString(16)
              .padStart(6, "0")}`;
            morph.setAttribute("fill", color);
          },
        },
        {
          label: "Random Speed",
          action: (morph) => morph.setAttribute("duration", String(Math.random() * 3 + 0.5)),
        },
      ],
    },
    {
      title: "Morph Parameters",
      description: "Control via attributes: speed, morph type, hold pause",
      icons: allIcons,
      attributes: { autoplay: "false", fill: "#7c9cff" },
      note: `${markupNote(allIcons, { autoplay: "false", fill: "#7c9cff" })}\n// morph.setAttribute("speed", "2")`,
      buttons: [
        { label: "slow 0.25x", action: (morph) => morph.setAttribute("speed", "0.25") },
        { label: "0.5x", action: (morph) => morph.setAttribute("speed", "0.5") },
        { label: "1x", action: (morph) => morph.setAttribute("speed", "1") },
        { label: "2x", action: (morph) => morph.setAttribute("speed", "2") },
        { label: "4x", action: (morph) => morph.setAttribute("speed", "4") },
        { label: "linear", action: (morph) => morph.setAttribute("type", "linear") },
        { label: "rotational", action: (morph) => morph.setAttribute("type", "rotational") },
        { label: "hold 0s", action: (morph) => morph.setAttribute("hold", "0") },
        { label: "hold 1s", action: (morph) => morph.setAttribute("hold", "1") },
        { label: "paused on", action: (morph) => morph.setAttribute("paused", "true") },
        { label: "paused off", action: (morph) => morph.setAttribute("paused", "false") },
      ],
    },
    {
      title: "JS API Control",
      description: "Programmatic control: play, pause, goTo()",
      icons: allIcons,
      attributes: { autoplay: "false", fill: "#06b6d4" },
      note: `${markupNote(allIcons, { autoplay: "false", fill: "#06b6d4" })}\n// morph.play(); morph.goTo("check")`,
      buttons: [
        { label: "Play", action: (morph) => morph.play() },
        { label: "Pause", action: (morph) => morph.pause() },
        { label: "Next", action: (morph) => morph.next() },
        { label: "Prev", action: (morph) => morph.prev() },
        { label: "GoTo Index 2", action: (morph) => morph.goTo(2) },
        {
          label: "Get Current",
          action: (morph) => window.alert(`Current: ${morph.getCurrentIcon()}`),
        },
      ],
    },
  ];

  for (const card of cards) {
    grid.append(createCard(card));
  }
}

void buildDemo();
