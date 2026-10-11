# AI 雷达 · 效率前沿

Tampermonkey TypeScript 用户脚本，版本 1.4.0。在 [AI 雷达 Codex 站](https://codexradar.com/?station=codex) 顶部增加效率前沿推荐区，使用当前雷达 Bench 的 0–150 分成绩、平均 API 等价费用和平均耗时。点击推荐卡片会打开原站对应模型档位详情。

## 安装

1. 在 Chrome / Edge 中安装 Tampermonkey。
2. 打开 [Raw 安装地址](https://raw.githubusercontent.com/ArsvineZhu/ai-radar-frontier/main/outputs/ai-radar-frontier.user.js) 安装脚本。
3. 刷新 [中文页](https://codexradar.com/?station=codex) 或 [英文页](https://codexradar.com/en/?station=codex)。

构建后的本地交付文件为 `outputs/ai-radar-frontier.user.js`。Raw 自动更新需要将新版产物发布到仓库。

## 当前数据接口

运行时先读取 `/data/radar-bench-binding.json`，再按绑定的模型与推理档位读取 `/api/radar-bench-score?model=…&effort=…&view=summary&selection=user-selected-v1`。最多三个并发请求，每次请求限时 15 秒。首次优先读取 high / max 等档位。本地已读快照先显示；绑定、模型档位与题集哈希校验一致且在 5 分钟内的快照直接复用，也复用原站已完成的读取，避免重复请求。超过 5 分钟但不超过 24 小时的快照标出读取时间并在后台刷新，超过 24 小时或题集变化的快照不参与推荐。收到首个可用档位即显示推荐，其余档位与 Fast 独立在后台读取，详情区标出未完成数量。单档失败不会阻断其余档位，详情区显示缺失档位数量；重试会重新读取当前绑定和成绩。

每个响应必须匹配模型、档位、benchmark、task-set hash、score version 和 150 分尺度。费用与耗时使用统计中已知样本的 `known_total / known_samples`，耗时从毫秒转换为分钟。缺少分数、费用或耗时的档位不参加推荐。覆盖题数随候选保留。运行时不再请求已停用的 DeepSWE 效能接口，不用历史 IQ 替代当前雷达分。

模型目录包含 GPT-6 Astra、GPT-6.1 Sol、GPT-6 Sol、GPT-6 Luna 和旧代际模型；实际读取范围由当前公开绑定决定。GPT-6.1 Sol 的六个公开推理档位均可参与推荐，包括主站提供的 ultra。

## 订阅与额度估算

菜单使用 Plus、Pro 100、Pro 200、Pro 500。Plus 保留 5 小时窗口，三个 Pro 档位均关闭短窗口。官方套餐与限制参考：[Pricing](https://learn.chatgpt.com/docs/pricing)。模型信息参考：[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)。

当前公开资料没有精确的新套餐周容量。主站额度雷达也明确标注历史参考。因此所有额度结果显示 `≈`：使用公开历史模型容量与月费比例先验，初始尺度 Plus / Pro 100 / Pro 200 / Pro 500 为 1 / 5 / 10 / 25。该比例是可校准估算，不是官方套餐使用倍数；Pro 200 也不再按旧 Pro 20x 处理。

统一计算保留：

```text
weeklyShare = alpha × benchmarkCostEquivalent × quotaWeight / planCapacity
shortShare  = weeklyShare / kappa                (仅启用短窗口时)
effectiveMinutes = beta × benchmarkMinutes
endurance5h = min(effectiveMinutes / shortShare, 300)
```

历史模型容量锚点由 `npm run quota:refresh` 从当前主站额度卡读取，GPT-6.1 Sol 当前参考为 $1,014。缺少公开模型容量的档位没有额度权重，保留在说明区，不获得完整的自动推荐分数。旧 task matrix 不进入新的运行时额度参考。费用是平均 API 等价测量，不是订阅实扣。

默认典型工作负载 `alpha = 5`，默认耗时系数 `beta = 1`，默认 Plus 短窗口比例 `kappa = 0.155`。用户可以通过本地完整窗口、成对剩余刻度和代表性任务观察校准这些值。Plus 的典型任务短窗口负担超过 50% 时不自动推荐；强资源排除要求额度校准置信度达到 0.67。

## 排序与 Fast

推荐对象为模型 × 档位 × 模式。排序策略包括质量、综合成效、经济和速度。质量下限为雷达分 50；质量策略在最高 4 分带内比较时间、周负担与耐力。效用使用固定尺度，参考分数为 100。策略参数集中在 `src/config.ts`。

排序后按 4 分、4% 耗时、4% 周负担和 8% 耐力容差压缩实用重复项。相似组保留可展开的替代候选，默认最多展示 12 组。Standard 与 Fast 始终独立。

Fast 继续读取公开 E2E 历史。只有新鲜且达到最小有效样本的证据才生成 Fast 候选，费用负担按 Standard 的 2.5 倍估计，耗时按实测 E2E 比例迁移。同模型精确证据优先；家族名历史不会移交给新代际。当前时间用于证据新鲜度判断。此版本没有加入 Ultrafast 候选。

## 本地存储

偏好键为 `ai-radar-frontier-userscript:preferences`。旧 `pro5` / `pro20` 选择映射到 Pro 100 / Pro 200。新基准的校准独立保存在 `ai-radar-frontier-userscript:quota-calibration:radar-bench-v1`；旧 DeepSWE 校准记录保留，且不导入新的计算。存储仅在本浏览器中，不上传。

Shadow DOM 隔离脚本界面。卡片动画只用于首次成功加载与主动切换订阅、策略或 Fast；展开/收起保留高度过渡，减少动态效果设置生效。

## 开发与验证

```bash
npm ci
npm run quota:refresh
npm run format
npm run check
```

`check` 包含格式、TypeScript、回归测试、lint、重复检查、Knip 和构建产物验证。Vite、Terser 与 CSSO 将脚本与样式打包为单个 userscript，产物同步到 `outputs/`。

`research/` 保存旧基准的历史研究材料，采集与分析脚本对应历史研究协议；它们不进入运行时，也不作为当前雷达 Bench 数据来源。

停用或删除 Tampermonkey 脚本后刷新页面即可卸载。
