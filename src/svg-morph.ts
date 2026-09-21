import { gsap } from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

// Register once so gsap.to(..., { morphSVG }) works on every instance.
gsap.registerPlugin(MorphSVGPlugin);

interface MorphIcon {
  id: string;
  path: string;
}

interface SpriteMorphConfig {
  spriteHref: string;
  icons?: string; // comma-separated icon IDs, or 'all'
  duration?: number; // morph duration in seconds
  ease?: string; // GSAP ease
  width?: number; // SVG width
  height?: number; // SVG height
  fill?: string; // fill color
  autoplay?: boolean; // start automatically
  loop?: boolean; // loop infinitely
  direction?: "forward" | "reverse" | "alternate";
  startIndex?: number; // starting icon index
  /** MorphSVGPlugin style: "linear" (default) or "rotational" */
  morphType?: "linear" | "rotational";
  /** pause in seconds after a morph completes before the next one starts */
  hold?: number;
  /** animation speed multiplier: 1 = normal, 2 = double speed, 0.5 = half */
  speed?: number;
  /** start paused / pause live (like pressing the pause button) */
  paused?: boolean;
  /** show the built-in play/pause/prev/next buttons */
  controls?: boolean;
  /** show the current-icon label (debug info) */
  debug?: boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    "svg-morph": SpriteMorphElement;
  }
}

class SpriteMorphElement extends HTMLElement {
  private shadow: ShadowRoot;
  private svg: SVGSVGElement | null = null;
  private morphPath: SVGPathElement | null = null;
  private label: HTMLDivElement | null = null;
  private config: SpriteMorphConfig = {
    spriteHref: "",
    duration: 2.5,
    ease: "power2.inOut",
    width: 300,
    height: 300,
    fill: "#00d4ff",
    autoplay: true,
    loop: true,
    direction: "forward",
    startIndex: 0,
    morphType: "linear",
    hold: 0.6,
    speed: 1,
    paused: false,
    controls: false,
    debug: false,
  };
  private icons: MorphIcon[] = [];
  private currentIndex = 0;
  private animationId: gsap.core.Tween | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private isPlaying = false;
  private spriteLoaded = false;

  static get observedAttributes() {
    return [
      "sprite-href",
      "icons",
      "duration",
      "ease",
      "width",
      "height",
      "fill",
      "autoplay",
      "loop",
      "direction",
      "start-index",
      "type",
      "hold",
      "speed",
      "paused",
      "controls",
      "debug",
    ];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
  }

  connectedCallback() {
    this.parseAttributes();
    void this.loadSprite().then(() => {
      // Always show the start icon — also without autoplay, so that a manual
      // mode (autoplay="false") is not an empty SVG but the first icon.
      this.currentIndex = Math.min(this.config.startIndex ?? 0, this.icons.length - 1);
      this.showCurrentIcon();
      if (this.config.autoplay) {
        this.play();
      }
    });
  }

  disconnectedCallback() {
    this.pause();
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    this.updateConfig(name, value);
  }

  private parseAttributes() {
    const attrs: Record<string, string | null> = {};
    this.getAttributeNames().forEach((name) => {
      attrs[name] = this.getAttribute(name);
    });

    this.config = {
      spriteHref: attrs["sprite-href"] || "",
      icons: attrs["icons"] || undefined,
      duration: attrs["duration"] ? parseFloat(attrs["duration"]) : 2.5,
      ease: attrs["ease"] || "power2.inOut",
      width: attrs["width"] ? parseInt(attrs["width"]) : 300,
      height: attrs["height"] ? parseInt(attrs["height"]) : 300,
      fill: attrs["fill"] || "#00d4ff",
      autoplay: attrs["autoplay"] !== "false",
      loop: attrs["loop"] !== "false",
      direction: (attrs["direction"] as SpriteMorphConfig["direction"]) || "forward",
      startIndex: attrs["start-index"] ? parseInt(attrs["start-index"]) : 0,
      morphType: attrs["type"] === "rotational" ? "rotational" : "linear",
      hold: attrs["hold"] ? parseFloat(attrs["hold"]) : 0.6,
      speed: attrs["speed"] ? parseFloat(attrs["speed"]) : 1,
      paused: attrs["paused"] === "true",
      // boolean attribute: <svg-morph controls> or controls="true"
      controls: attrs["controls"] != null && attrs["controls"] !== "false",
      debug: attrs["debug"] != null && attrs["debug"] !== "false",
    };

    this.applyControls();
    this.applyDebug();
  }

  private updateConfig(name: string, value: string) {
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof SpriteMorphConfig;
    const oldValue = this.config[key];

    switch (key) {
      case "duration":
      case "width":
      case "height":
      case "startIndex":
      case "hold":
      case "speed":
        (this.config[key] as number) = parseFloat(value);
        break;
      case "autoplay":
      case "loop":
      case "paused":
      case "controls":
      case "debug":
        (this.config[key] as boolean) = value !== "false";
        break;
      default:
        (this.config[key] as string) = value;
    }

    // Rebuild if sprite href changed
    if (key === "spriteHref" && oldValue !== value) {
      this.spriteLoaded = false;
      this.icons = [];
      void this.loadSprite();
    }

    // Apply speed live to the currently running tween (GSAP timeScale)
    if (key === "speed") {
      const speed = this.config.speed ?? 1;
      if (this.animationId) {
        this.animationId.timeScale(Math.max(0.01, speed));
      }
    }

    // Toggle the built-in controls live
    if (key === "controls" || key === "paused") {
      this.applyControls();
    }

    // Toggle the debug label live
    if (key === "debug") {
      this.applyDebug();
    }

    // Toggle playback live
    if (key === "paused") {
      if (value !== "false") {
        this.pause();
      } else if (this.spriteLoaded && this.icons.length >= 2) {
        this.play();
      }
    }

    // Update visual properties immediately
    if (key === "fill" && this.morphPath) {
      this.morphPath.setAttribute("fill", value);
    }
    if ((key === "width" || key === "height") && this.svg) {
      this.svg.setAttribute("width", String(this.config.width));
      this.svg.setAttribute("height", String(this.config.height));
    }
  }

  private async loadSprite() {
    if (!this.config.spriteHref) {
      this.reportError("No sprite-href provided");
      return;
    }

    try {
      const response = await fetch(this.config.spriteHref);
      if (!response.ok) {
        this.reportError(`Failed to load sprite (${response.status}): ${this.config.spriteHref}`);
        return;
      }
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");

      // DOMParser reports invalid XML via a <parsererror> element.
      if (doc.querySelector("parsererror")) {
        this.reportError(`Invalid SVG sprite: ${this.config.spriteHref}`);
        return;
      }

      // Determine which icons to load
      let iconIds: string[] = [];
      if (this.config.icons) {
        iconIds = this.config.icons
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        // Get all symbols from sprite
        const symbols = doc.querySelectorAll("symbol[id]");
        iconIds = Array.from(symbols).map((s) => s.id);
      }

      this.icons = iconIds
        .map((id) => {
          const symbol = doc.getElementById(id);
          if (!symbol) return null;

          // Get ALL path elements from the symbol and combine them
          const paths = symbol.querySelectorAll("path");
          const combinedPath = Array.from(paths)
            .map((p) => p.getAttribute("d"))
            .filter(Boolean)
            .join(" ");

          return combinedPath ? { id, path: combinedPath } : null;
        })
        .filter((i): i is MorphIcon => i !== null);

      // Inject sprite into shadow DOM for <use> references
      const spriteContainer = document.createElement("div");
      spriteContainer.style.display = "none";
      spriteContainer.innerHTML = text;
      this.shadow.appendChild(spriteContainer);

      this.spriteLoaded = true;
      console.log(`[svg-morph] Loaded ${this.icons.length} icons from ${this.config.spriteHref}`);

      if (this.icons.length === 0) {
        this.reportError("No usable icons found in sprite");
      }
    } catch (err) {
      this.reportError("Failed to load sprite", err);
    }
  }

  // Shows a readable error in the component instead of failing silently.
  private reportError(message: string, err?: unknown) {
    this.spriteLoaded = false;
    this.icons = [];
    if (err) {
      console.error("[svg-morph]", message, err);
    } else {
      console.warn("[svg-morph]", message);
    }

    // Reuse the debug label if present, otherwise create a temporary one so
    // the error is visible even when debug isn't enabled.
    let label = this.label ?? this.shadow.querySelector<HTMLDivElement>(".svg-morph-label");
    const container = this.shadow.querySelector<HTMLElement>(".svg-morph-container");
    if (!label && container) {
      label = document.createElement("div");
      label.className = "svg-morph-label svg-morph-error";
      container.appendChild(label);
    }
    if (label) {
      label.textContent = `⚠ ${message}`;
    }
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: inline-block;
          font-family: system-ui, sans-serif;
        }
        .svg-morph-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .svg-morph-svg {
          display: block;
        }
        .svg-morph-label {
          font-size: 0.75rem;
          color: #888;
          text-align: center;
          min-height: 1em;
          width: 100%;
        }
        .svg-morph-error {
          color: #ff6b6b;
        }
        .svg-morph-controls {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .svg-morph-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          background: #333;
          color: #eee;
          border: 1px solid #555;
          border-radius: 4px;
          cursor: pointer;
        }
        .svg-morph-btn:hover { background: #444; }
        .svg-morph-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
      <div class="svg-morph-container">
        <svg class="svg-morph-svg" viewBox="0 -960 960 960"></svg>
        <!-- Label and controls are created on demand by applyDebug()/applyControls() -->
      </div>
    `;

    this.svg = this.shadow.querySelector(".svg-morph-svg")!;
    this.label = null;

    // Create morph path
    this.morphPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.svg.appendChild(this.morphPath);

    // Apply initial config
    this.svg.setAttribute("width", String(this.config.width));
    this.svg.setAttribute("height", String(this.config.height));
  }

  private applyControls() {
    const container = this.shadow.querySelector<HTMLElement>(".svg-morph-container")!;
    let controls = this.shadow.querySelector<HTMLElement>(".svg-morph-controls");

    const enabled = this.config.controls ?? false;
    if (enabled && !controls) {
      controls = document.createElement("div");
      controls.className = "svg-morph-controls";
      for (const [action, label, title] of [
        ["play", "▶", "Play"],
        ["pause", "⏸", "Pause"],
        ["prev", "⏮", "Previous"],
        ["next", "⏭", "Next"],
      ] as const) {
        const btn = document.createElement("button");
        btn.className = "svg-morph-btn";
        btn.type = "button";
        btn.title = title;
        btn.textContent = label;
        btn.addEventListener("click", () => this.handleControl(action));
        controls.appendChild(btn);
      }
      container.appendChild(controls);
    } else if (!enabled && controls) {
      controls.remove();
    }
  }

  private applyDebug() {
    const container = this.shadow.querySelector<HTMLElement>(".svg-morph-container")!;
    let label = this.shadow.querySelector<HTMLElement>(".svg-morph-label");

    const enabled = this.config.debug ?? false;
    if (enabled && !label) {
      label = document.createElement("div");
      label.className = "svg-morph-label";
      container.appendChild(label);
      this.label = container.querySelector<HTMLDivElement>(".svg-morph-label")!;
    } else if (!enabled && label) {
      label.remove();
      this.label = null;
    }
  }

  private handleControl(action: string) {
    switch (action) {
      case "play":
        this.play();
        break;
      case "pause":
        this.pause();
        break;
      case "prev":
        this.prev();
        break;
      case "next":
        this.next();
        break;
    }
  }

  private updateLabel() {
    if (!this.label || this.icons.length === 0) return;
    const current = this.icons[this.currentIndex];
    const next = this.icons[(this.currentIndex + 1) % this.icons.length];
    if (!current || !next) return;
    this.label.textContent = `${current.id} → ${next.id}`;
  }

  private morphToIndex(targetIndex: number) {
    if (!this.morphPath || this.icons.length < 2) return;

    const toIndex = targetIndex;
    const toPath = this.icons[toIndex].path;

    // MorphSVGPlugin tweens the path element's d attribute directly from its
    // current state to the target shape (type 'linear' = simple matching,
    // 'rotational' = tries to rotate points for a more organic feel).
    this.animationId = gsap.to(this.morphPath, {
      morphSVG: {
        shape: toPath,
        type: this.config.morphType,
      },
      duration: this.config.duration,
      ease: this.config.ease,
      // speed is applied as a timeScale so changing it mid-flight works
      onStart: () => this.animationId!.timeScale(Math.max(0.01, this.config.speed ?? 1)),
      onComplete: () => {
        this.currentIndex = toIndex;
        this.morphPath!.setAttribute("d", toPath);
        this.updateLabel();
        this.animationId = null;

        // Hold the target icon briefly so the morph reads as a deliberate
        // step (especially noticeable with only two icons) instead of
        // snapping straight back.
        if (this.isPlaying && this.config.loop) {
          this.holdTimer = setTimeout(() => this.scheduleNext(), (this.config.hold ?? 0.6) * 1000);
        }
      },
    });
  }

  private scheduleNext() {
    let nextIndex: number;
    const len = this.icons.length;

    if (this.config.direction === "reverse") {
      nextIndex = (this.currentIndex - 1 + len) % len;
    } else {
      nextIndex = (this.currentIndex + 1) % len;
    }

    this.morphToIndex(nextIndex);
  }

  // Render the icon at the current index into the morph path.
  private showCurrentIcon() {
    if (!this.morphPath) return;
    const icon = this.icons[this.currentIndex];
    if (icon) {
      this.morphPath.setAttribute("d", icon.path);
    }
    this.morphPath.setAttribute("fill", this.config.fill ?? "#00d4ff");
    this.updateLabel();
  }

  // Public methods
  play() {
    if (this.isPlaying || !this.spriteLoaded || this.icons.length < 2) return;

    this.isPlaying = true;
    if (!this.config.autoplay) {
      this.currentIndex = Math.min(this.config.startIndex ?? 0, this.icons.length - 1);
      this.showCurrentIcon();
    }
    this.scheduleNext();
  }

  pause() {
    this.isPlaying = false;
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.animationId) {
      this.animationId.kill();
      this.animationId = null;
    }
  }

  next() {
    this.pause();
    const nextIndex = (this.currentIndex + 1) % this.icons.length;
    this.morphToIndex(nextIndex);
  }

  prev() {
    this.pause();
    const prevIndex = (this.currentIndex - 1 + this.icons.length) % this.icons.length;
    this.morphToIndex(prevIndex);
  }

  // Jump to specific icon by index or ID
  goTo(target: number | string) {
    this.pause();
    let index: number;
    if (typeof target === "string") {
      index = this.icons.findIndex((i) => i.id === target);
      if (index === -1) return;
    } else {
      index = ((target % this.icons.length) + this.icons.length) % this.icons.length;
    }
    this.morphToIndex(index);
  }

  // Get current state
  getCurrentIcon(): string | null {
    return this.icons[this.currentIndex]?.id || null;
  }

  getIcons(): string[] {
    return this.icons.map((i) => i.id);
  }
}

customElements.define("svg-morph", SpriteMorphElement);

export { SpriteMorphElement };
