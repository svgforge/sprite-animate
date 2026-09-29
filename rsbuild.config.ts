import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { defineConfig } from "@rsbuild/core";

// Template partials, injected into every page's HTML via templateParameters.
const headerPartial = readFileSync(join(import.meta.dirname, "templates/header.html"), "utf8");
const footerPartial = readFileSync(join(import.meta.dirname, "templates/footer.html"), "utf8");

// Types for the dev middleware signature.
type Next = (err?: unknown) => void;

export default defineConfig({
  // One TypeScript entry per test page. The bundle is injected into the
  // matching template below by the HTML plugin.
  source: {
    entry: {
      index: "./src/index.ts",
      demo1: "./src/demo1.ts",
      demo2: "./src/demo2.ts",
      demo3: "./src/demo3.ts",
      demo4: "./src/demo4.ts",
      demo5: "./src/demo5.ts",
    },
  },

  // Reference the test HTML files in `public/` as page templates, so the
  // bundler turns each one into a real page with the right script injected.
  // The shared header markup comes from the `templates/` partial; the shared
  // styles are a static file in public/css/shared.css.
  html: {
    template: ({ entryName }) => `./public/${entryName}.html`,
    // The header is rendered here (per entry) so its aria-current markers
    // are resolved in the config instead of the embedded template string.
    templateParameters: ({ entryName }) => ({
      headerPartial: headerPartial
        .replaceAll("__HOME_ACTIVE__", entryName === "index" ? 'aria-current="page"' : "")
        .replaceAll("__DEMO1_ACTIVE__", entryName === "demo1" ? 'aria-current="page"' : "")
        .replaceAll("__DEMO2_ACTIVE__", entryName === "demo2" ? 'aria-current="page"' : "")
        .replaceAll("__DEMO3_ACTIVE__", entryName === "demo3" ? 'aria-current="page"' : "")
        .replaceAll("__DEMO4_ACTIVE__", entryName === "demo4" ? 'aria-current="page"' : "")
        .replaceAll("__DEMO5_ACTIVE__", entryName === "demo5" ? 'aria-current="page"' : ""),
      footerPartial,
    }),
  },

  // ico.svg and other static files in public/ are copied to dist/ as-is.
  output: {
    distPath: {
      root: "dist",
    },
    // Emit relative asset URLs (./static/js/..., ./css/...) so the build also
    // works when hosted under a subpath, e.g. GitHub Pages project sites
    // (https://user.github.io/sprite-animate/).
    assetPrefix: "auto",
  },

  server: {
    port: 3000,
  },

  dev: {
    // Serve /lib/* from dist/lib so the release bundle is reachable at the
    // same URL (/lib/svg-morph.js) in both dev and the built output.
    setupMiddlewares: (middlewares) => {
      middlewares.unshift((req: IncomingMessage, res: ServerResponse, next: Next) => {
        const match = /^\/lib\/(.+)$/.exec(req.url ?? "");
        if (!match) return next();
        const file = join(import.meta.dirname, "dist/lib", match[1]);
        if (!existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader("Content-Type", "application/javascript");
        const stream = createReadStream(file);
        stream.on("error", next);
        stream.pipe(res);
      });
      return middlewares;
    },
  },
});
