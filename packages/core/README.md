# `@ai-radar/core`

这是 userscript 与 Tauri 桌面端共享的算法入口。当前包通过稳定 facade 重新导出仓库中已经验证的推荐实现，避免桌面端复制一份评分逻辑：

- DeepSWE model × effort 记录与 Fast evidence 适配；
- 统一 quota reference 与 alpha/kappa/beta 校准；
- Plus 5h 安全门槛和 Pro 周额度规则；
- 策略排序、实用支配、排除原因和 render policy；
- 中英文语义文案。

浏览器专属的 Shadow DOM、MutationObserver、localStorage 和构建入口仍留在根 `src/`，桌面端只依赖纯数据/算法模块。新增算法时应先更新根实现和测试，再由这个入口供两端消费，禁止在 `apps/desktop` 内部派生第二套推荐规则。
