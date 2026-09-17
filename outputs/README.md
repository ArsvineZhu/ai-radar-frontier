# AI 雷达 · 效率前沿

这是一个只读的 Tampermonkey TypeScript 用户脚本（版本 1.1.0）。它在 codexradar.com 的 DeepSWE 软件工程能力页顶部增加效率前沿推荐区，不改写原站模型卡片、图表、推荐区或社区评分。点击推荐卡片会滚动到对应的原站卡片并调用原站详情。

运行时只读取公开的当前 Radar 数据：DeepSWE 效能接口、页面中的模型族额度雷达，以及公开 Fast E2E 数据。请求范围限定在 codexradar.com、deng.codexradar.com 和 api.codexradar.com。Research 快照不作为运行时依赖，脚本也不会运行模型、benchmark 或上传本地数据。

## 安装

1. 在 Chrome / Edge 中安装 Tampermonkey。
2. 打开 [Raw 安装地址](https://raw.githubusercontent.com/ArsvineZhu/ai-radar-frontier/main/outputs/ai-radar-frontier.user.js)，在 Tampermonkey 中安装。
3. 打开或刷新 <https://codexradar.com/?station=codex>，也可以使用英文页 <https://codexradar.com/en/?station=codex>。

Userscript 元数据包含 GitHub Raw 的 @updateURL 与 @downloadURL。从 Raw 地址安装后，Tampermonkey 会按自身更新设置检查新版本；发布时递增 src/config.ts 的 VERSION，运行 npm run build 并发布生成的 outputs/ai-radar-frontier.user.js。

偏好保存在 HOST_ID:preferences，包括订阅、排序和 Fast 开关。校准单独保存在 HOST_ID:quota-calibration:v1，只使用浏览器 localStorage，不会上传，也不会随普通偏好重置。损坏的校准数据会安全回退为空校准。

## 推荐模型

推荐对象是 model × effort × mode。Standard 和 Fast 使用独立候选、独立卡片和独立分组。

DeepSWE 的 iq、average_price_usd、average_minutes 分别映射为质量 IQ、基准等价负担输入和基准任务耗时输入。等价费用是 Radar 的标准化测量，不是用户账单；界面主卡只展示周额度负担、简短任务耗时，以及当前计划可用的 5h 耐力或周耐力。

### 计划与容量

模型族 20x 公开容量记为 B7_20x，计划容量为：

```text
B7(family, plan) = B7_20x(family) × planMultiplier / 20
planMultiplier = Plus: 1, Pro 5x: 5, Pro 20x: 20
```

没有当前模型族容量的候选会显示在说明中，但不能获得完整的自动推荐分数。

Plus 初始启用 5 小时窗口模型；Pro 5x 和 Pro 20x 的 5 小时模型保留在配置中但暂不参与推荐。默认短窗口/周容量比例为 0.155，它是临时经验先验，不是官方常量。

### 本地校准

打开校准后先选择订阅。额度观察和代表性任务使用两个模式页签；额度观察内部再切换完整窗口或剩余刻度，界面不会同时展示两套表格。代表性任务表单按需展开，历史观察默认折叠。

额度观察支持完整 5h 窗口和成对剩余刻度两种输入方式。短窗口比例按总暴露量计算：

```text
kappa = (priorExposure × priorRatio + Σ weeklyDelta)
         / (priorExposure + Σ shortWindowDelta)
```

用户也可以记录一个明确确认的、完整且具有代表性的日常编码任务。系统在全局工作负载层估计：

```text
alpha = typical weekly burden / DeepSWE-equivalent weekly burden
beta  = actual active minutes / benchmark minutes
```

有效观察使用对数空间几何中位数。alpha 按额度暴露向默认值 5 收缩，beta 按样本数向 1 收缩。模型、档位、模式和当时的基准值会随观察保存；不满足输入范围的观察保留为 rejected，不参加估计。

默认工作负载比例为 `alpha = 5`。它来自约 `5.55` 个 DeepSWE 等价负担的观测，并取整为产品默认值；因此默认 5h 耐力相对于未缩放值除以约 `5`。用户提交代表性任务后，alpha 会以额度暴露置信度向个人观察值收缩。

### 运行时派生指标

```text
effectiveMinutes      = beta × benchmarkMinutes
effectiveWeeklyShare  = alpha × benchmarkCostEquivalent / B7
effectiveShortShare   = effectiveWeeklyShare / kappa
H5raw                 = effectiveMinutes / effectiveShortShare
H5                    = min(H5raw, 5h window duration)
```

核心效用使用固定尺度，不做当前候选集的 min/max 归一化：

```text
UQ = ln(1 + max(0, Q - 100) / 4) - (max(0, 100 - Q) / 4)^2
UT = -log2(effectiveMinutes / 10)
UW = -log2(effectiveWeeklyShare / 0.01)
UH = log2(min(H5, windowMinutes) / 60)
```

IQ 小于 70 是唯一的质量硬门槛。IQ 100 是参考点，IQ 96 没有资格门。没有足够个人工作负载校准时，达到周容量或短窗口容量只显示资源风险；额度校准置信度达到 0.67 后，典型任务负担达到容量才成为自动推荐硬排除。

策略权重集中在 src/config.ts：

| 策略                   | 质量 | 耗时 | 周负担 | 5h 耐力 |
| ---------------------- | ---: | ---: | -----: | ------: |
| 综合成效               | 0.45 | 0.25 |   0.20 |    0.10 |
| 经济                   | 0.20 | 0.10 |   0.45 |    0.25 |
| 速度                   | 0.20 | 0.55 |   0.10 |    0.15 |
| 质量（最高 4 IQ 带内） | 0.15 | 0.40 |   0.30 |    0.15 |

短窗口未启用时，5h 耐力权重会移除并对剩余权重重新归一化；此时卡片右侧显示周耐力作为诊断信息。Pareto 只作为诊断。排序完成后，使用 4 IQ、4% 耗时、4% 周负担和 8% 耐力决策容差进行直接实用支配压缩；之后以相同模式和严格的 IQ/耗时/周负担/耐力相似度创建代表组。代表组最多在预览中显示 12 张卡，展开后显示全部有意义的推荐组。Standard 和 Fast 永远不会合并。

Fast 使用可靠的公开 E2E 证据独立生成：

```text
quality(Fast) = quality(Standard)
benchmarkCost(Fast) = 2.5 × benchmarkCost(Standard)
benchmarkMinutes(Fast) = benchmarkMinutes(Standard) / E2E ratio
```

证据顺序为：模型+档位精确证据、同模型最近 30 天 P25、fastGroup 最近 30 天履约率 P25。实时 DOM 测量标记为 live；没有时间戳的历史观察不会被当作永久新鲜。没有可靠证据时不生成 Fast 候选。

## 交互与动效

界面使用 Shadow DOM 隔离，并采用 Apple HIG 的渐进披露、Geist 的紧凑数字排版和 Shadcn 风格的分段控件、卡片、状态区与 dialog。校准 section 使用轻微淡入、位移和高度过渡；菜单、modal 和卡片保留克制的状态动画。系统开启减少动态效果后，所有切换会降为即时状态。

## 项目结构

```text
src/
├─ main.ts            挂载、原站观察、状态和校准交互
├─ config.ts          选择器、计划、权重、阈值与运行时状态
├─ calibration.ts     kappa、alpha、beta 与校准状态
├─ radar.ts           当前 DeepSWE、模型族额度和 Fast 适配
├─ scoring.ts         派生指标、固定尺度效用、排序、压缩关系
├─ recommendation.ts  候选生成、资格筛选和推荐组编排
├─ storage.ts         偏好与独立校准存储
├─ i18n.ts            中英文翻译与菜单目录
├─ ui.ts              Shadow DOM 模板、卡片、说明与校准对话框
├─ animations.ts      网格与说明区动画
└─ styles.css         隔离样式
```

research/ 保存公开数据研究快照，分为 raw/、normalized/ 和 analysis/。采集和分析脚本只用于离线研究，保留原始响应、响应摘要、哈希、公式、筛选条件、随机种子和输入哈希；它们不会被打包进运行时。

## 开发与验证

```bash
npm install
npm run format
npm run typecheck
npm test
npm run lint
npm run duplication
npm run knip
npm run build:check
npm run check
```

构建使用 Vite、Terser 和 CSSO，将 TypeScript、压缩 CSS 和模块合并为单个 Tampermonkey Userscript。Terser 启用顶层压缩、顶层变量混淆、3 次压缩、调试代码清理和安全的函数/变量归约；不启用 unsafe 变换或对象属性名混淆。dist/ 是构建产物，outputs/ 是可交付副本。

## 已知限制

- DeepSWE 是标准化软件工程校准工作负载，不代表用户的具体任务分布。
- 基准等价费用不是用户订阅账单。
- 默认 alpha 为 5；默认 0.155 短窗口比例是临时经验先验，用户刻度可能有四舍五入。
- V3 使用全局 alpha/beta；未配对的模型级任务样本无法同时识别模型差异与任务难度。
- Fast 耗时通常是迁移的 E2E 估计，除非 Radar 提供独立的 Fast DeepSWE 耗时。
- 公开额度容量、模型数据和 Fast 证据会随 Radar 更新。
- 校准不能预测确切代码量、有效代码行、token、agent steps 或 cache rate；这些值不作为直接生产力指标。
- 实用支配是主界面的冗余压缩规则，不是对候选在所有工作负载下都更差的判断。

## 卸载

在 Tampermonkey 中停用或删除该脚本，然后刷新页面即可恢复原站界面。
