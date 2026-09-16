import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distFile = resolve(root, "dist", "ai-radar-frontier.user.js");
const source = await readFile(distFile, "utf8");

if (!source.startsWith("// ==UserScript==")) {
  throw new Error("dist is missing the Tampermonkey metadata header");
}
if (!source.includes("// @version      1.0.0")) {
  throw new Error("dist does not contain version 1.0.0");
}
if (source.includes("//# sourceMappingURL=")) {
  throw new Error("dist must not contain a source map reference");
}

execFileSync(process.execPath, ["--check", distFile], { stdio: "inherit" });
console.log(`dist check passed: ${source.length} bytes`);
