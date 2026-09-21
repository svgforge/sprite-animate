# AGENTS.md — sprite-amimate

Quick reference for working on this project: **SVG sprite morphing as a Web
Component** (`<svg-morph>`), built with **GSAP MorphSVGPlugin** + **RSBuild**
(TypeScript).

## Important rules (user-defined)

- **Run CLI commands ONLY inside this project** (workdir = this directory).
  **Never** work in the parent `svgforge-workspace/` — it contains other,
  unrelated projects (`svgforge`, `svgforge-cli`) that must not be modified.
- **File tools (read/edit/write/glob) are partly blocked in this workspace:**
  make changes via the shell if needed (`cat`, `sed`, `node -e`, heredocs).
  Check whether the tool is allowed first — otherwise work cleanly via the shell.
- **Page texts and documentation must be in English** (README, HTML pages,
  demo cards).
- **Clean, clear, human-readable code:** simple and direct structures, no
  cryptic one-liners, one thought per line. Keep changes minimal-invasive.
- **No scope creep:** only do what the task asks for.

## Commands

| Command                  | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `npm run dev`            | Runs `build:lib`, then starts the RSBuild dev server (default :3000; port often taken → 3001/3002 …, read from the log) |
| `npm run build`          | Demo entries + release bundle (`dist/lib/svg-morph.js`)      |
| `npm run build:lib`      | Standalone release bundle only (UMD, minified)               |
| `npm run preview`        | Serve the build locally                                      |
| `npm run lint` / `npm run lint:fix` | Biome check / auto-fix                            |
| `npm run format`         | Biome format                                                 |
| `npx tsc --noEmit`       | Type-check (before/after changes to `src/`)                  |

## Architecture / structure

- **`src/svg-morph.ts`** — the Web Component: attribute parsing, `loadSprite`
  via `fetch` + `DOMParser`, morphing with GSAP `MorphSVGPlugin`
  (linear/rotational), controls/debug only created on demand
  (create/remove, no `hidden`).
- **`src/demo*.ts`** — build the demo pages dynamically from
  `public/sprite.svg` (cards via `createCard`; always set `controls`/`debug`).
- **`public/*.html`** — RSBuild entry templates with EJS-like syntax
  (`<%= headerPartial %>`).
- **`templates/header.html` + `templates/footer.html`** — partials, injected in
  `rsbuild.config.ts` via `templateParameters` (NO real EJS `include`).
- **`public/css/shared.css`** — static stylesheet (linked, not an injected
  string).
- **`public/sprite.svg`** — the active symbol source. A `sprite.svg` in the
  project root is stale and is **not** served (only `public/` is shipped).
- **`dist/lib/svg-morph.js`** — standalone release bundle, reachable at
  `/lib/svg-morph.js` in dev and production (dev via middleware).

## Template notes

- `public/*.html` and `templates/*.html` contain `<%= %>` delimiters; they are
  **excluded from Biome checks in `biome.json`** (RSBuild compiles them, Biome
  cannot parse that syntax). In **VS Code** they are associated as `ejs`
  (`.vscode/settings.json` + extension `QassimFarid.ejs-language-support`).
- Template engine: **minimal `lodash.template`** in the html-rspack-plugin
  (`<%= %>`, `<%- %>`, `<% %>`), no real EJS, no `include()`.

## Biome / conventions

- After changes to `src/` or `public/css/` ALWAYS run `npm run lint` and fix
  errors (`×`) — only warnings/infos may remain.
- `biome.json`: template HTML excluded; `noSvgWithoutTitle` disabled for
  `public/sprite.svg` (symbol sprite, not standalone icons).
- `.gitignore`: `node_modules/`, `dist/`.

## Git

- Initial commit and OpenCode config already exist. Keep commits small and
  descriptive with **English** messages.
- `dist/` and `node_modules/` are not committed.
