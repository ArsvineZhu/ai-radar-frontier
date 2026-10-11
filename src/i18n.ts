import {
  FAST_COST_MULTIPLIER,
  IQ_MINIMUM,
  STRATEGY_KEYS,
  SUBSCRIPTION_KEYS,
} from "./config.js";

function freezeRecord(value: any): any {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

function percent(value: number | null): string {
  return value === null ? "Unknown" : `${(value * 100).toFixed(1)}%`;
}

const ZH_CALIBRATION_STATUS = Object.freeze({
  baseline: "默认估计",
  initial: "初步校准",
  calibrated: "个人校准",
  stable: "稳定校准",
});

const ZH_WORKLOAD_STATUS = Object.freeze({
  baseline: "默认",
  initial: "初步",
  calibrated: "已校准",
});

const TRANSLATIONS = freezeRecord({
  en: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "Efficiency Frontier",
    infoAria: "Frontier model explanation",
    frontierExplanation:
      "Uses current public Radar Bench measurements, one plan-wide quota scale, and optional local workload calibration. Standard and Fast remain separate choices.",
    sort: "Strategy",
    subscription: "Subscription",
    sorting: "Sorting",
    fastSection: "Fast",
    calibration: "Calibration",
    openCalibration: "Configure local calibration",
    gridAria: "Radar Bench recommendation groups for the active strategy",
    details: "Details",
    notes: "Notes",
    loading: "Loading Radar Bench data…",
    originalDetails: "Open Radar data",
    earlySamples: (count: number) => `Provisional · ${count} tasks`,
    earlySamplesTitle: (count: number) =>
      `Radar Bench currently covers ${count} tasks for this tier; score may change as more tasks are measured.`,
    quotaEstimateTitle: (_count: number) =>
      `Historical quota reference with a monthly-price plan prior; current capacity requires local calibration.`,
    quotaAnchorTitle: "Calibrated with this model's public 20x quota capacity.",
    fast: "Fast",
    fastInclude: "Include Fast",
    fastExclude: "Exclude Fast",
    fastToggleAria: "Include Fast mode candidates",
    expandAria: "Show all meaningful choices",
    collapseAria: "Show fewer choices",
    fallenHint: (count: number) =>
      `${count} meaningful choice${count === 1 ? "" : "s"} below`,
    fallenHintAria: (count: number) =>
      `Show ${count} meaningful choice${count === 1 ? "" : "s"} below`,
    benchmark: "Benchmark",
    calibrated: "Typical task",
    quality: "Quality",
    scoreLabel: "Score",
    quota: "Weekly burden",
    quotaShortWindow: "Per task / 5h",
    quotaWeek: "Per task / week",
    endurance: "5h endurance",
    weeklyEndurance: "Weekly endurance",
    enduranceShortWindow: "Endurance / 5h",
    enduranceWeek: "Endurance / week",
    time: "Task time",
    cardTime: "Time",
    calibratedCardTime: "Typical time",
    estimatedTime: "Estimated task time",
    minutes: " min",
    week: "wk",
    approximate: "≈",
    quotaUnavailableShort: "Unavailable",
    strategies: {
      quality: { label: "Quality", winnerLabel: "Preferred" },
      effectiveness: { label: "Effectiveness", winnerLabel: "Effectiveness" },
      budget: { label: "Economy", winnerLabel: "Economy" },
      speed: { label: "Speed", winnerLabel: "Speed" },
    },
    strategyDescriptions: {
      quality:
        "Stay within the highest 4-point band, then compare time, weekly burden, and endurance.",
      effectiveness:
        "Balance quality, effective task time, weekly burden, and short-window endurance.",
      budget:
        "Prefer lower effective weekly burden while retaining useful software-engineering quality.",
      speed:
        "Prefer shorter effective task time while retaining useful quality and quota endurance.",
    },
    subscriptions: {
      plus: "Plus",
      pro100: "Pro 100",
      pro200: "Pro 200",
      pro500: "Pro 500",
    },
    subscriptionMultipliers: {
      plus: "Plus",
      pro100: "Pro 100",
      pro200: "Pro 200",
      pro500: "Pro 500",
    },
    errorTitle: "Unable to read Radar Bench data",
    errorLoading:
      "Could not load public Radar Bench data. Try again in a moment.",
    refresh: "Retry",
    cachedDataNote: (at: string, failed: boolean) =>
      `Includes recent snapshots (${new Date(at).toLocaleString("en-GB")})${failed ? "; live refresh failed" : ""}`,
    loadingDataNote: (count: number) =>
      `${count} tiers are still loading; recommendations update as data arrives.`,
    partialDataNote: (count: number) =>
      `${count} tiers could not provide complete current measurements; retry to reload.`,
    noModelsTitle: `No model meets score ${IQ_MINIMUM}`,
    noModelsDescription: `Current models below score ${IQ_MINIMUM} are retained in the details; no automatic recommendation is possible.`,
    noValidTitle: "No valid models to display",
    noValidDescription:
      "The current source did not provide all required comparable measurements.",
    noQuotaModelsTitle: "No complete automatic recommendation",
    noQuotaModelsDescription:
      "A usable quota reference is required for quota scoring; unavailable candidates remain in details.",
    noDominatedTitle: "No excluded practical duplicate",
    noDominatedDescription:
      "Pareto is diagnostic only. Practical compression is applied after ranking.",
    excluded: (count: number) => `${count} candidates outside the main choices`,
    dominanceCheck: "Recommendation details",
    fastNote: ({ included, exact, model, group, omitted }: any) =>
      `Fast: ${included} variants included; ${exact} exact, ${model} same-model, ${group} fastGroup evidence; ${omitted} omitted for insufficient evidence. Fast uses a transferred E2E estimate and ${FAST_COST_MULTIPLIER}× benchmark-equivalent cost.`,
    lowIqNote: (count: number) =>
      `${count} candidate${count === 1 ? "" : "s"} below score ${IQ_MINIMUM}.`,
    iqFloorReason: (iq: number) =>
      `Score ${iq.toFixed(1)} is below the automatic floor of ${IQ_MINIMUM}.`,
    invalidNote: (count: number) =>
      `${count} candidate${count === 1 ? "" : "s"} lacked valid benchmark data.`,
    resourceNote: (weekly: number, short: number) =>
      `${weekly + short} candidates exceed calibrated resource capacity and were withheld from automatic recommendation.`,
    practicalNote: (count: number) =>
      `${count} ranked candidate${count === 1 ? "" : "s"} were practically dominated by an earlier, materially comparable choice.`,
    quotaDataNote:
      "The card uses the active 5h window scale for Plus and the weekly scale for Pro. Hover shows the other scale; quota values use historical anchors and monthly-price capacity priors until locally calibrated.",
    qualityDataNote:
      "Quality uses current Radar Bench score. Radar Bench is a calibration workload, not a claim about the exact user's task.",
    calibrationNote:
      "Calibration stays in this browser only. It is never uploaded.",
    benchmarkLabel: (value: string) => `Radar Bench-equivalent ${value}`,
    calibratedLabel: (value: string) => `Typical-task ${value}`,
    quotaValue: (value: number | null) =>
      value === null ? "Unavailable" : `${percent(value)} / week`,
    taskQuotaValue: (value: number | null, _shortWindow: boolean) =>
      value === null ? "Unavailable" : percent(value),
    quotaTooltip: ({
      shortWindow,
      shortShare,
      weeklyShare,
    }: {
      shortWindow: boolean;
      shortShare: number | null;
      weeklyShare: number | null;
    }) =>
      shortWindow
        ? `5h window: one typical task uses ${percent(shortShare)} of the active window. 7-day quota: ${percent(weeklyShare)} of weekly capacity.`
        : `7-day quota: one typical task uses ${percent(weeklyShare)} of weekly capacity.`,
    enduranceValue: (value: number | null, hours: number) =>
      value === null
        ? "Unavailable"
        : value >= hours * 60
          ? `≥ ${hours}h`
          : `${value.toFixed(1)} min`,
    weeklyEnduranceValue: (value: number | null) =>
      value === null
        ? "Unavailable"
        : value >= 60
          ? `${(value / 60).toFixed(1)}h`
          : `${value.toFixed(1)} min`,
    quotaReason: "No usable quota reference for this model tier.",
    weeklyResourceReason:
      "Calibrated typical-task share reaches the weekly capacity.",
    shortResourceReason:
      "Calibrated typical-task share reaches the active short-window capacity.",
    shortWindowRiskReason:
      "Plus 5h safety gate: one typical task would use more than half of the active 5h window.",
    shortWindowRiskNote: (count: number) =>
      `${count} candidates exceed the Plus 5h safety gate and were withheld from automatic recommendation.`,
    practicalReason:
      "A higher-ranked choice is within the decision tolerances and materially lighter or faster.",
    dominatedBy: (name: string) => `Dominated by ${name}`,
    switchTo: "Open this alternative",
    fastReason:
      "Fast was not generated: this model × effort lacks measured E2E evidence, and fresh same-model evidence is below three observations. A 1.5× nominal speedup is only an upper bound, not measured evidence.",
    alternativesTitle: (count: number) =>
      `${count} similar alternative${count === 1 ? "" : "s"}; open details to compare deltas`,
    fastBadgeTitle: ({ source, multiplier, sampleCount, ageDays }: any) =>
      `${source} · E2E ${multiplier} · ${sampleCount ?? 0} supporting samples${ageDays === null || ageDays === undefined ? " · live" : ` · ${ageDays.toFixed(1)}d old`} · transferred time · ${FAST_COST_MULTIPLIER}× benchmark-equivalent cost`,
    fastExactSource: "Radar E2E · model and effort",
    fastModelSource: "Radar E2E · same model",
    fastGroupSource: "Radar E2E · fastGroup",
    announced: (
      count: number,
      strategy: string,
      candidates: number,
      groups: number,
    ) =>
      `${count} scoreable candidates, ${groups} meaningful groups, sorted by ${strategy}; ${candidates} Fast candidates evaluated.`,
    announcedOriginalChanged:
      "The original data changed. Try again in a moment.",
    cardAria: ({
      rankLabel,
      label,
      modeLabel,
      winnerText,
      fastDescription,
      iq,
      qualityMargin,
      quota,
      time,
      endurance,
      strategyLabel,
      strategyDescription,
      originalDetails,
      alternatives,
    }: any) =>
      `${rankLabel}, ${label}${modeLabel}${winnerText}${fastDescription}, ${strategyLabel}: ${strategyDescription}, score ${iq}, quality ${qualityMargin}, weekly burden ${quota}, ${time}, ${endurance}${alternatives ? `, ${alternatives}` : ""}, ${originalDetails}`,
    ariaRank: (rank: number) => `Rank ${rank}`,
    ariaPreferred: (labels: string[]) =>
      labels.length ? `, ${labels.join(", ")}` : "",
    ariaFast: (
      multiplier: string,
      level: string | undefined,
      sampleCount: number | undefined,
    ) =>
      `, Fast E2E ${multiplier}, ${level ?? "unknown"} evidence, ${sampleCount ?? 0} supporting samples`,
    fastEvidence: ({ level, sampleCount, ageDays }: any) =>
      `Fast ${level ?? "unknown"} evidence, ${sampleCount ?? 0} samples${ageDays === null || ageDays === undefined ? ", live" : `, ${ageDays.toFixed(1)} days old`}`,
    calibrationDialogTitle: "Local calibration",
    close: "Close",
    save: "Save observation",
    resetCalibration: "Reset calibration",
    observations: "Saved observations",
    deleteObservation: "Delete",
    completeWindows: "Complete 5h windows",
    pairedMeters: "Paired remaining meters",
    quotaObservation: "Quota observation",
    workloadObservation: "Representative task",
    fullWindowMode: "Complete window",
    meterMode: "Remaining meters",
    quotaObservationHint: "Choose one way to record a confirmed quota change.",
    workloadObservationHint:
      "Only record a complete task that resembles your normal work.",
    fullWindows: "5h windows consumed",
    shortBefore: "5h remaining before (%)",
    shortAfter: "5h remaining after (%)",
    weeklyBefore: "Weekly remaining before (%)",
    weeklyAfter: "Weekly remaining after (%)",
    representativeTask:
      "This was a complete task reasonably representative of my normal coding work.",
    representativeSection: "Representative workload",
    modelEffort: "Model × effort",
    executionMode: "Execution mode",
    actualMinutes: "Active task minutes",
    calibrationStatus: ({
      ratio,
      exposure,
      status,
      alpha,
      beta,
      workloadStatus,
    }: any) =>
      `5h ≈ ${(ratio * 100).toFixed(1)}% weekly · ${status} · ${exposure.toFixed(1)} window exposure. Typical workload α ${alpha.toFixed(2)}, β ${beta.toFixed(2)} · ${workloadStatus}.`,
    noCalibration: "Default estimate · no personal observations",
  },
  zh: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "效率前沿",
    infoAria: "前沿模型说明",
    frontierExplanation:
      "使用当前雷达 Bench 数据、统一的套餐额度尺度和可选的本地校准；Standard 与 Fast 始终是独立选择。",
    sort: "策略",
    subscription: "订阅",
    sorting: "排序",
    fastSection: "Fast",
    calibration: "校准",
    openCalibration: "配置本地校准",
    gridAria: "当前策略的 Radar Bench 推荐组",
    details: "说明",
    notes: "说明",
    loading: "正在读取雷达 Bench 数据…",
    originalDetails: "打开雷达数据",
    earlySamples: (count: number) => `暂定 · ${count} 题`,
    earlySamplesTitle: (count: number) =>
      `该档雷达 Bench 当前覆盖 ${count} 题；随着任务覆盖增加，雷达分可能变化。`,
    quotaEstimateTitle: (_count: number) =>
      `历史额度参考与月费比例先验；当前容量需本地校准。`,
    quotaAnchorTitle: "使用该型号公开的 20x 额度容量校准。",
    fast: "Fast",
    fastInclude: "包含 Fast",
    fastExclude: "排除 Fast",
    fastToggleAria: "启用 Fast 模式候选",
    expandAria: "展开查看全部有意义的选择",
    collapseAria: "收起到精选选择",
    fallenHint: (count: number) => `还有 ${count} 个有意义的选择`,
    fallenHintAria: (count: number) => `展开查看下方 ${count} 个有意义的选择`,
    benchmark: "基准",
    calibrated: "典型任务",
    quality: "质量",
    scoreLabel: "雷达分",
    quota: "周额度负担",
    quotaShortWindow: "每任务 / 5h",
    quotaWeek: "每任务 / 周",
    endurance: "5h 耐力",
    weeklyEndurance: "周耐力",
    enduranceShortWindow: "耐力时长 / 5h",
    enduranceWeek: "耐力时长 / 周",
    time: "任务耗时",
    cardTime: "耗时",
    calibratedCardTime: "典型耗时",
    estimatedTime: "估计任务耗时",
    minutes: "分钟",
    week: "周",
    approximate: "≈",
    quotaUnavailableShort: "不可用",
    strategies: {
      quality: { label: "质量", winnerLabel: "首选" },
      effectiveness: { label: "综合成效", winnerLabel: "成效" },
      budget: { label: "经济", winnerLabel: "经济" },
      speed: { label: "速度", winnerLabel: "速度" },
    },
    strategyDescriptions: {
      quality: "先保留最高质量 4 分带，再比较耗时、周额度负担和短窗口耐力。",
      effectiveness: "综合比较质量、典型任务耗时、周额度负担和短窗口耐力。",
      budget: "在保留有用软件工程质量的同时，优先降低典型任务的周额度负担。",
      speed: "在保留有用质量的同时，优先降低典型任务耗时并保持额度耐力。",
    },
    subscriptions: {
      plus: "Plus",
      pro100: "Pro 100",
      pro200: "Pro 200",
      pro500: "Pro 500",
    },
    subscriptionMultipliers: {
      plus: "Plus",
      pro100: "Pro 100",
      pro200: "Pro 200",
      pro500: "Pro 500",
    },
    errorTitle: "暂时无法读取 雷达 Bench数据",
    errorLoading: "无法读取公开雷达 Bench 数据，请稍后重试。",
    refresh: "重试",
    cachedDataNote: (at: string, failed: boolean) =>
      `含最近已读快照（${new Date(at).toLocaleString("zh-CN")}）${failed ? "；实时刷新失败" : ""}`,
    loadingDataNote: (count: number) =>
      `还有 ${count} 个档位读取中；推荐随数据更新。`,
    partialDataNote: (count: number) =>
      `${count} 个档位暂未提供完整当前数据；重试可重新读取。`,
    noModelsTitle: `没有达到雷达分 ${IQ_MINIMUM}`,
    noModelsDescription: `当前低于雷达分 ${IQ_MINIMUM} 的模型仍保留在说明中，无法自动推荐。`,
    noValidTitle: "暂时没有可展示的有效模型",
    noValidDescription: "当前原站没有提供完整的可比较测量值。",
    noQuotaModelsTitle: "没有完整的自动推荐",
    noQuotaModelsDescription:
      "自动评分需要可用的公开任务额度倍率；缺数据的候选仍保留在说明中。",
    noDominatedTitle: "没有被移出的实用重复项",
    noDominatedDescription: "Pareto 只作诊断；实用压缩在排序之后进行。",
    excluded: (count: number) => `已移出主推荐 ${count} 个候选`,
    dominanceCheck: "推荐说明",
    fastNote: ({ included, exact, model, group, omitted }: any) =>
      `Fast：${included} 个变体纳入；${exact} 个有精确证据，${model} 个使用同模型证据，${group} 个使用 fastGroup 证据；${omitted} 个因证据不足未生成。Fast 使用迁移的 E2E 耗时估计和 ${FAST_COST_MULTIPLIER} 倍基准等价费用。`,
    lowIqNote: (count: number) => `${count} 个候选低于雷达分 ${IQ_MINIMUM}。`,
    iqFloorReason: (iq: number) =>
      `雷达分 ${iq.toFixed(1)} 低于自动推荐下限 ${IQ_MINIMUM}。`,
    invalidNote: (count: number) => `${count} 个候选缺少有效基准数据。`,
    resourceNote: (weekly: number, short: number) =>
      `${weekly + short} 个候选达到已校准的资源容量，因此不自动推荐。`,
    practicalNote: (count: number) =>
      `${count} 个已排序候选被更早且在决策容差内更轻/更快的选择实用支配。`,
    quotaDataNote:
      "Plus 主卡使用当前 5h 窗口尺度，Pro 使用周额度尺度；hover 会补充另一种尺度。额度使用历史参考与月费比例先验，均为估算；可用本地观察校准。",
    qualityDataNote:
      "质量使用当前雷达 Bench 分数。Radar Bench 是校准工作负载，不等于用户的具体任务。",
    calibrationNote: "校准只保存在本浏览器中，不会上传。",
    benchmarkLabel: (value: string) => `Radar Bench 等价${value}`,
    calibratedLabel: (value: string) => `典型任务${value}`,
    quotaValue: (value: number | null) =>
      value === null ? "不可用" : `${percent(value)} / 周`,
    taskQuotaValue: (value: number | null, _shortWindow: boolean) =>
      value === null ? "不可用" : percent(value),
    quotaTooltip: ({
      shortWindow,
      shortShare,
      weeklyShare,
    }: {
      shortWindow: boolean;
      shortShare: number | null;
      weeklyShare: number | null;
    }) =>
      shortWindow
        ? `5h 窗口：一个典型任务约占当前窗口 ${percent(shortShare)}；7 天额度：约占周额度 ${percent(weeklyShare)}。`
        : `7 天额度：一个典型任务约占周额度 ${percent(weeklyShare)}。`,
    enduranceValue: (value: number | null, hours: number) =>
      value === null
        ? "不可用"
        : value >= hours * 60
          ? `≥ ${hours} 小时`
          : `${value.toFixed(1)} 分钟`,
    weeklyEnduranceValue: (value: number | null) =>
      value === null
        ? "不可用"
        : value >= 60
          ? `${(value / 60).toFixed(1)} 小时`
          : `${value.toFixed(1)} 分钟`,
    quotaReason: "该模型档位缺少可用的公开任务额度倍率。",
    weeklyResourceReason: "已校准的典型任务周额度占比达到周容量。",
    shortResourceReason: "已校准的典型任务周额度占比达到当前短窗口容量。",
    shortWindowRiskReason:
      "Plus 5h 安全门槛：一个典型任务预计会消耗当前 5h 窗口的一半以上。",
    shortWindowRiskNote: (count: number) =>
      `${count} 个候选超过 Plus 5h 安全门槛，因此不自动推荐。`,
    practicalReason: "更高排序的选择在决策容差内，同时有明显更轻或更快的优势。",
    dominatedBy: (name: string) => `被 ${name} 覆盖`,
    switchTo: "打开这个替代项",
    fastReason:
      "未生成 Fast：该模型档位缺少实测 E2E，且新鲜的同模型证据不足 3 条。1.5 倍 nominal 只是上限假设，不是实测证据。",
    alternativesTitle: (count: number) =>
      `${count} 个相近替代项；打开说明比较真实差异`,
    fastBadgeTitle: ({ source, multiplier, sampleCount, ageDays }: any) =>
      `${source} · E2E ${multiplier} · ${sampleCount ?? 0} 个支持样本${ageDays === null || ageDays === undefined ? " · 当前" : ` · ${ageDays.toFixed(1)} 天前`} · 迁移耗时 · 基准等价费用 ${FAST_COST_MULTIPLIER} 倍`,
    fastExactSource: "雷达 E2E · 模型和档位",
    fastModelSource: "雷达 E2E · 同模型",
    fastGroupSource: "雷达 E2E · fastGroup",
    announced: (
      count: number,
      strategy: string,
      candidates: number,
      groups: number,
    ) =>
      `${count} 个可评分候选，${groups} 个有意义的推荐组，当前排序：${strategy}；已评估 ${candidates} 个 Fast 候选。`,
    announcedOriginalChanged: "原站数据刚刚更新，请稍候重试。",
    cardAria: ({
      rankLabel,
      label,
      modeLabel,
      winnerText,
      fastDescription,
      iq,
      qualityMargin,
      quota,
      time,
      endurance,
      strategyLabel,
      strategyDescription,
      originalDetails,
      alternatives,
    }: any) =>
      `${rankLabel}，${label}${modeLabel}${winnerText}${fastDescription}，${strategyLabel}：${strategyDescription}，雷达分 ${iq}，质量 ${qualityMargin}，周额度负担 ${quota}，${time}，${endurance}${alternatives ? `，${alternatives}` : ""}，${originalDetails}`,
    ariaRank: (rank: number) => `第 ${rank} 位`,
    ariaPreferred: (labels: string[]) =>
      labels.length ? `，${labels.join("、")}` : "",
    ariaFast: (
      multiplier: string,
      level: string | undefined,
      sampleCount: number | undefined,
    ) =>
      `，Fast E2E ${multiplier}，${level ?? "未知"} 证据，${sampleCount ?? 0} 个支持样本`,
    fastEvidence: ({ level, sampleCount, ageDays }: any) =>
      `Fast 证据：${level ?? "未知"}，${sampleCount ?? 0} 个样本${ageDays === null || ageDays === undefined ? "，当前" : `，${ageDays.toFixed(1)} 天前`}`,
    calibrationDialogTitle: "本地校准",
    close: "关闭",
    save: "保存观察",
    resetCalibration: "重置校准",
    observations: "已保存的观察",
    deleteObservation: "删除",
    completeWindows: "完整 5h 窗口",
    pairedMeters: "成对剩余刻度",
    quotaObservation: "额度观察",
    workloadObservation: "代表性任务",
    fullWindowMode: "完整窗口",
    meterMode: "剩余刻度",
    quotaObservationHint: "选择一种你能确认的额度变化方式。",
    workloadObservationHint: "只记录完整且接近日常工作的任务。",
    fullWindows: "消耗的 5h 窗口数",
    shortBefore: "5h 开始剩余（%）",
    shortAfter: "5h 结束剩余（%）",
    weeklyBefore: "周额度开始剩余（%）",
    weeklyAfter: "周额度结束剩余（%）",
    representativeTask: "这是一个完整且能代表我日常编码工作的任务。",
    representativeSection: "代表性工作负载",
    modelEffort: "模型 × 档位",
    executionMode: "执行模式",
    actualMinutes: "任务实际活动分钟",
    calibrationStatus: ({
      ratio,
      exposure,
      status,
      alpha,
      beta,
      workloadStatus,
    }: any) =>
      `5h ≈ ${(ratio * 100).toFixed(1)}% 周额度 · ${ZH_CALIBRATION_STATUS[status as keyof typeof ZH_CALIBRATION_STATUS] ?? status} · ${exposure.toFixed(1)} 个窗口等价样本。典型任务 α ${alpha.toFixed(2)}、β ${beta.toFixed(2)} · ${ZH_WORKLOAD_STATUS[workloadStatus as keyof typeof ZH_WORKLOAD_STATUS] ?? workloadStatus}。`,
    noCalibration: "默认估计 · 没有个人观察数据",
  },
});

export type Copy = (typeof TRANSLATIONS)["en"];

export function getLocale(root = document.documentElement) {
  return root.lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

export function getCopy(locale: string): Copy {
  return (TRANSLATIONS[locale as keyof typeof TRANSLATIONS] ||
    TRANSLATIONS.zh) as Copy;
}

export function createStrategyCatalog(copy: Copy) {
  return Object.freeze(
    Object.fromEntries(
      STRATEGY_KEYS.map((key) => [
        key,
        Object.freeze({
          label: copy.strategies[key].label,
          winnerLabel: copy.strategies[key].winnerLabel,
        }),
      ]),
    ),
  );
}

export function createSubscriptionCatalog(copy: Copy) {
  return Object.freeze(
    Object.fromEntries(
      SUBSCRIPTION_KEYS.map((key) => [
        key,
        Object.freeze({ label: copy.subscriptions[key] }),
      ]),
    ),
  );
}
