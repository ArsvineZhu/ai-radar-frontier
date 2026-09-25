# AI 雷达 · Tauri 桌面版

桌面版是当前 userscript 的独立桌面发布物。它使用 React + TypeScript，采用 shadcn/ui 的组件组织方式、Apple HIG 的渐进披露和 Geist/Vercel 风格的暗色视觉；推荐核心和 userscript 共用同一份实现。

## 开发

在仓库根目录运行：

```bash
npm run desktop:check
npm run desktop:dev
npm run desktop:build
npm run desktop:portable
```

`desktop:build` 会先构建 React 前端，再构建 Windows x64 Tauri 可执行文件和安装包。Rust 首次构建需要较长时间。

`desktop:portable` 在同一 release EXE 上生成 `outputs/desktop/AI-Radar-Portable-v<version>.zip`。它不执行安装注册表写入，解压后直接运行 `AI-Radar.exe`；Windows WebView2 Runtime 仍是系统前提。

## 数据边界

- Radar 请求由 Rust/Tauri 命令发起，只接受 `codexradar.com`、`deng.codexradar.com` 和 `api.codexradar.com` 的固定端点。
- Radar 缓存保留 ETag、Last-Modified、来源更新时间和 SHA-256；网络失败时返回带 `stale` 标记的缓存。
- 本地 Codex 统计默认关闭。开启后只扫描预定义目录或用户明确指定的目录，深度和文件名均受限。
- 只接受已识别的统计 JSON schema；SQLite 文件目前保留为候选来源并显示 schema unavailable，直到格式适配器被确认。
- 不读取聊天正文、提示词、代码、凭据或认证 token。原始统计 payload 进入本机 SQLite 前使用 AES-256-GCM 加密，密钥保存在系统 keyring；keyring 不可用时不会明文落盘。
- 导出的是加密快照和 manifest。删除会清除加密快照、派生数据、Radar 缓存和本地加密密钥。

桌面端不会读取 userscript 的 localStorage，也不会改变 Tampermonkey 元数据、发布 URL 或 userscript 运行边界。
