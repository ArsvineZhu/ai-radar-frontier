import { VERSION } from "./config.js";

export const USERSCRIPT_METADATA = `// ==UserScript==
// @name         AI 雷达 · 效率前沿
// @namespace    local.ai-radar.frontier
// @version      ${VERSION}
// @description  在 AI 雷达顶部展示 DeepSWE 软件工程效率前沿，不改写原站内容。
// @homepageURL  https://github.com/ArsvineZhu/ai-radar-frontier
// @supportURL   https://github.com/ArsvineZhu/ai-radar-frontier/issues
// @updateURL    https://raw.githubusercontent.com/ArsvineZhu/ai-radar-frontier/main/outputs/ai-radar-frontier.user.js
// @downloadURL  https://raw.githubusercontent.com/ArsvineZhu/ai-radar-frontier/main/outputs/ai-radar-frontier.user.js
// @match        https://codexradar.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==`;
