import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const desktopPackage = JSON.parse(
  readFileSync(join(root, "apps", "desktop", "package.json"), "utf8"),
);
const version = desktopPackage.version;
const exe = join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "ai-radar-desktop.exe",
);
if (!existsSync(exe)) {
  throw new Error(`Release executable not found: ${exe}`);
}

const portableName = `AI-Radar-Portable-v${version}`;
const portableDir = join(root, "outputs", "desktop", portableName);
const archive = join(root, "outputs", "desktop", `${portableName}.zip`);
rmSync(portableDir, { recursive: true, force: true });
rmSync(archive, { force: true });
mkdirSync(portableDir, { recursive: true });
cpSync(exe, join(portableDir, "AI-Radar.exe"));
writeFileSync(
  join(portableDir, "version.json"),
  `${JSON.stringify({ product: "AI 雷达", version, format: "portable", requires: ["Windows 10/11", "WebView2 Runtime"] }, null, 2)}\n`,
);
writeFileSync(
  join(portableDir, "README.txt"),
  [
    "AI 雷达 · Windows 便携版",
    "",
    "双击 AI-Radar.exe 启动。不写入安装注册表；可将整个目录移动到其他位置。",
    "需要 Windows 10/11 与 WebView2 Runtime。应用数据仍保存在当前 Windows 用户的 app data 目录。",
    "userscript 与桌面端数据、设置和缓存彼此独立。",
    "",
    `版本：${version}`,
  ].join("\n"),
);

if (process.platform !== "win32") {
  throw new Error("Portable ZIP packaging currently targets Windows.");
}

const quotePowerShell = (value) => `'${value.replaceAll("'", "''")}'`;
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$ErrorActionPreference = 'Stop'; Compress-Archive -Path ${quotePowerShell(join(portableDir, "*"))} -DestinationPath ${quotePowerShell(archive)} -CompressionLevel Optimal`,
  ],
  { stdio: "inherit" },
);

console.log(`Portable package: ${archive}`);
console.log(`Portable directory: ${portableDir}`);
