import { defineConfig } from "@rsbuild/core";

// Release build for the <svg-morph> web component.
//
// Produces a single standalone script (dist/lib/svg-morph.js) that registers
// the custom element on load, so it can be dropped into any page:
//
//   <script src="/path/to/svg-morph.js"></script>
//   <svg-morph sprite-href="/sprite.svg"></svg-morph>
export default defineConfig({
  source: {
    // Side-effect entry: importing svg-morph.ts calls customElements.define().
    entry: {
      "svg-morph": "./src/svg-morph.ts",
    },
  },

  // No HTML pages, no static public/ copy — this is a plain JS library build.
  server: {
    publicDir: false,
  },

  output: {
    target: "web",
    distPath: {
      root: "dist/lib",
      js: "",
    },
    filename: {
      js: "[name].js",
    },
    minify: true,
    legalComments: "none",
    cleanDistPath: true, // keep only the fresh library output
  },

  tools: {
    htmlPlugin: false,
    rspack: {
      optimization: {
        splitChunks: false,
      },
      output: {
        // UMD: works as <script>, and also via require()/import() if needed.
        library: {
          type: "umd",
          name: "SVGMorph",
        },
      },
    },
  },
});
