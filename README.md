# sprite-amimate

SVG sprite morphing as a Web Component, built with **GSAP `MorphSVGPlugin`** and **RSBuild** (TypeScript).

The `<svg-morph>` component loads an SVG sprite, reads its symbols and morphs
continuously through the icon shapes — fully controllable via HTML attributes,
without writing a single line of JavaScript.

---

## Quick start

```bash
npm install
npm run dev        # Dev server on http://localhost:3000 (demo page at /demo)
npm run build      # Production build to dist/
npm run preview    # Serve the build locally
```

`npm run lint` / `npm run lint:fix` checks or auto-fixes (Biome), `npm run format`
formats the project.

---

## The `<svg-morph>` Web Component

A single morph instance:

```html
<svg-morph
  sprite-href="/sprite.svg"
  icons="arrow_forward,check"
  width="200"
  height="200"
></svg-morph>
```

With no attributes other than `sprite-href`, all symbols of the sprite are
loaded and morphed through automatically.

### Attributes

| Attribute          | Default      | Description                                                                    |
| ------------------ | ------------ | ------------------------------------------------------------------------------ |
| `sprite-href`      | — (required) | URL to the SVG sprite (a `<symbol id="…">` file).                              |
| `icons`            | *(all)*      | Comma-separated symbol IDs. Without the attribute, all symbols are used.       |
| `duration`         | `2.5`        | Duration of a single morph in seconds.                                         |
| `ease`             | `power2.inOut` | GSAP easing, e.g. `elastic.out(1, 0.5)` or `sine.inOut`.                     |
| `speed`            | `1`          | **Speed multiplier**: `0.5` = half speed, `2` = double speed.                  |
| `type`             | `linear`     | Morph style from MorphSVGPlugin: `linear` or `rotational`.                     |
| `hold`             | `0.6`        | Pause in seconds the target shape stays visible before the next morph starts. Especially useful with only 2 icons for a calm look. |
| `direction`        | `forward`    | `forward`, `reverse` or `alternate`.                                           |
| `autoplay`         | `true`       | Start the animation automatically after loading.                               |
| `loop`             | `true`       | Keep looping indefinitely.                                                     |
| `controls`         | *(off)*      | Show the built-in ▶ ⏸ ⏮ ⏭ buttons (`controls` or `controls="true"`). Hidden by default. |
| `debug`            | *(off)*      | Show the current icon label (e.g. `arrow_forward → check`) below the morph. Hidden by default. |
| `paused`           | `false`      | Live pause/play: `paused="true"` pauses, `paused="false"` resumes.             |
| `start-index`      | `0`          | Start icon (0-based, used as the starting point when playing).                 |
| `fill`             | `#00d4ff`    | Fill color of the morph path.                                                  |
| `width`/`height`   | `300`        | Display size of the SVG.                                                       |

**All attributes work live:** changes via `setAttribute()` are applied to the
running tween immediately (e.g. `speed`, `fill`, `paused`, `duration`).

The built-in control buttons are **hidden by default** — they only appear below
the morph with `controls` (or `controls="true"`).

```html
<svg-morph sprite-href="/sprite.svg" controls></svg-morph>
```

### Methods (JS API)

| Method                       | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `play()`                     | Start/resume the animation                            |
| `pause()`                    | Pause the animation                                   |
| `next()` / `prev()`          | Morph one icon forward/backward (pauses while doing so) |
| `goTo(index \| id)`          | Morph directly to an icon                             |
| `getCurrentIcon()`           | Current icon ID (or `null`)                           |
| `getIcons()`                 | List of all loaded icon IDs                           |

Access by ID:

```html
<svg-morph id="demo" sprite-href="/sprite.svg" autoplay="false"></svg-morph>

<script>
  const morph = document.getElementById("demo");
  morph.play();
  morph.goTo("check");
  console.log(morph.getCurrentIcon()); // "check"
</script>
```

---

## Examples

### 1. Basic — all icons, auto-play

```html
<svg-morph sprite-href="/sprite.svg" width="200" height="200"></svg-morph>
```

### 2. Specific icons only, slower, different color

```html
<svg-morph
  sprite-href="/sprite.svg"
  icons="arrow_forward,check,planner_review"
  duration="5"
  fill="#4ecdc4"
></svg-morph>
```

### 3. Faster, organic morph style, short pause

```html
<svg-morph
  sprite-href="/sprite.svg"
  icons="arrow_forward,check"
  speed="2"
  type="rotational"
  hold="1"
></svg-morph>
```

### 4. Manual control (no autoplay)

```html
<svg-morph id="m" sprite-href="/sprite.svg" autoplay="false"></svg-morph>
<button onclick="document.getElementById('m').play()">Play</button>
<button onclick="document.getElementById('m').next()">Next</button>
```

### 5. Changing the speed live

```html
<svg-morph id="g" sprite-href="/sprite.svg" speed="1"></svg-morph>
<script>
  const g = document.getElementById("g");
  g.setAttribute("speed", "0.25"); // slow motion
  g.setAttribute("speed", "4");    // turbo
</script>
```

---

## Release build: embedding in third-party pages

In addition to the demo, `npm run build` produces a **standalone, minified
bundle**: `dist/lib/svg-morph.js` (≈ 99 kB, ≈ 39 kB gzip). It contains
everything (GSAP + MorphSVGPlugin) in a single file — no bundler required.

Include it in any HTML page:

```html
<!-- One file is enough: registers <svg-morph> on load -->
<script src="/path/to/svg-morph.js"></script>

<svg-morph sprite-href="/sprite.svg" icons="arrow_forward,check"></svg-morph>
```

The bundle is built as **UMD**:

- **`<script>` tag** (classic, see above),
- **CommonJS / AMD** (bundlers, npm modules) and
- **ES module** — the global `SVGMorph` object is available as well.

In the dev server the bundle is served at `/lib/svg-morph.js` too, so the same
URL works in development and production. On the landing page you can download
it directly via the download button below the code example. `examples/embed.html`
shows the embedding with three variants (plain, fast with `rotational`/fill,
manual with JS API).

```
└─ dist/
   ├─ index.html, demo.html, demo2.html, static/   # Demo build
   └─ lib/
      └─ svg-morph.js                              # Standalone release bundle
```

---

## Project structure

```
├── src/
│   ├── svg-morph.ts        # The <svg-morph> Web Component
│   ├── demo.ts             # Builds the demo page dynamically from the sprite
│   ├── demo2.ts            # Second demo page
│   └── index.ts            # Landing page
├── public/
│   ├── sprite.svg          # Any number of <symbol> icons
│   ├── index.html          # Landing page template
│   ├── demo.html           # Demo page template
│   ├── demo2.html          # Second demo page template
│   └── css/shared.css      # Shared stylesheet
├── templates/
│   ├── header.html         # Shared header partial (injected via templateParameters)
│   └── footer.html         # Shared footer partial
├── rsbuild.config.ts       # RSBuild: one TS entry per page, /lib/* dev middleware
├── rsbuild.lib.config.ts   # Standalone UMD release build → dist/lib/svg-morph.js
├── biome.json              # Linter/formatter (Biome, format-on-save)
└── .vscode/                # Editor recommendations & settings (partials = ejs)
```

**Swapping the sprite:** simply replace `public/sprite.svg` with another
`symbol`-based sprite (a file with a valid `<symbol id="…">` per icon) — the
demo and the components adapt automatically (dynamic at runtime). RSBuild only
serves the contents of `public/`; a `sprite.svg` of the same name in the project
root is **not** served and is only meant for editing.

## Technical background

- **GSAP Core** provides the animation/timeline engine (easing, time, `timeScale`).
- **MorphSVGPlugin** (part of the GSAP suite, 100 % free since the Webflow
  acquisition) computes the path interpolation: matching point counts, start
  point matching, support for multi-subpath icons (`M…z M…z`).
- The component reads the sprite at runtime via `fetch` + `DOMParser` and
  combines each symbol's `<path>` `d` values into one morph target.

## License

GSAP uses the [standard 'no charge' license](https://gsap.com/standard-license).
