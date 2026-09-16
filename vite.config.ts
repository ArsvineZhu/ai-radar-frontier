import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { minify } from "csso";
import { defineConfig } from "vite";
import { USERSCRIPT_METADATA } from "./src/metadata.js";

const root = fileURLToPath(new URL(".", import.meta.url));

function minifyRawStyles() {
  const stylesId = `${resolve(root, "src/styles.css")}?raw-minified`;
  return {
    name: "minify-raw-styles",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      const normalizedImporter = importer?.replaceAll("\\", "/");
      if (
        source === "./styles.css?raw" &&
        normalizedImporter?.endsWith("/src/ui.ts")
      ) {
        return stylesId;
      }
      return null;
    },
    load(id: string) {
      if (id !== stylesId) {
        return null;
      }
      const css = readFileSync(resolve(root, "src/styles.css"), "utf8");
      return `export default ${JSON.stringify(minify(css).css)};`;
    },
  };
}

export default defineConfig({
  plugins: [minifyRawStyles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "terser",
    sourcemap: false,
    rollupOptions: {
      input: resolve(root, "src/main.ts"),
      output: {
        format: "iife",
        entryFileNames: "ai-radar-frontier.user.js",
        banner: `${USERSCRIPT_METADATA}\n/* eslint-disable */\n`,
      },
    },
    terserOptions: {
      compress: {
        passes: 3,
        toplevel: true,
        drop_console: true,
        drop_debugger: true,
        reduce_funcs: true,
        reduce_vars: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: (_node, comment) =>
          /eslint-disable|==\/?UserScript==|^\s*@(?:name|namespace|version|description|match|run-at|grant|homepageURL|supportURL|updateURL|downloadURL)\b/.test(
            comment.value,
          ),
      },
    },
  },
});
