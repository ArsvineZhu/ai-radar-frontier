import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDist = resolve(root, "dist");
const exportedDist = resolve(root, "outputs", "dist");

await mkdir(exportedDist, { recursive: true });
await rm(resolve(exportedDist, "ai-radar-frontier.user.js"), { force: true });
await cp(
  resolve(sourceDist, "ai-radar-frontier.user.js"),
  resolve(exportedDist, "ai-radar-frontier.user.js"),
);
await cp(
  resolve(sourceDist, "ai-radar-frontier.user.js"),
  resolve(root, "outputs", "ai-radar-frontier.user.js"),
);
await cp(resolve(root, "README.md"), resolve(root, "outputs", "README.md"));
await cp(resolve(root, "README.md"), resolve(exportedDist, "README.md"));
