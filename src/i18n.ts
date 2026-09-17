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
      "Uses current public DeepSWE software-engineering measurements, plan family capacity, and optional local workload calibration. Standard and Fast remain separate choices.",
    sort: "Strategy",
    subscription: "Subscription",
    sorting: "Sorting",
    fastSection: "Fast",
    calibration: "Calibration",
    openCalibration: "Configure local calibration",
    gridAria: "DeepSWE recommendation groups for the active strategy",
    details: "Details",
    notes: "Notes",
    loading: "Loading DeepSWE software-engineering data…",
    originalDetails: "Open original details",
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
    quota: "Weekly burden",
    endurance: "5h endurance",
    weeklyEndurance: "Weekly endurance",
    time: "Task time",
    cardTime: "Time",
    calibratedCardTime: "Typical time",
    estimatedTime: "Estimated task time",
    minutes: " min",
    week: "wk",
    approximate: "≈",
    quotaUnavailableShort: "Unavailable",
    inactiveTitle: "Different ability view",
    inactiveDescription: (modeName: string) =>
      `This panel uses DeepSWE software-engineering data; ${modeName} is shown by the original page.`,
    strategies: {
      quality: { label: "Quality", winnerLabel: "Preferred" },
      effectiveness: { label: "Effectiveness", winnerLabel: "Effectiveness" },
      budget: { label: "Economy", winnerLabel: "Economy" },
      speed: { label: "Speed", winnerLabel: "Speed" },
    },
    strategyDescriptions: {
      quality:
        "Stay within the highest 4-IQ band, then compare time, weekly burden, and endurance.",
      effectiveness:
        "Balance quality, effective task time, weekly burden, and short-window endurance.",
      budget:
        "Prefer lower effective weekly burden while retaining useful software-engineering quality.",
      speed:
        "Prefer shorter effective task time while retaining useful quality and quota endurance.",
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    subscriptionMultipliers: { plus: "1×", pro5: "5×", pro20: "20×" },
    modeNames: {
      software: "Software Engineering Ability",
      visual: "Visual-Spatial Reasoning",
    },
    errorTitle: "Unable to read DeepSWE software-engineering data",
    errorLoading:
      "The radar reported a loading problem. Refresh the original source and try again.",
    errorMissing: "The radar has not provided usable DeepSWE model data yet.",
    refresh: "Refresh source",
    noModelsTitle: `No model meets IQ ${IQ_MINIMUM}`,
    noModelsDescription: `Current models below IQ ${IQ_MINIMUM} are retained in the details; no automatic recommendation is possible.`,
    noValidTitle: "No valid models to display",
    noValidDescription:
      "The current source did not provide all required comparable measurements.",
    noQuotaModelsTitle: "No complete automatic recommendation",
    noQuotaModelsDescription:
      "A current family quota capacity is required for automatic scoring; unavailable candidates remain in details.",
    noDominatedTitle: "No excluded practical duplicate",
    noDominatedDescription:
      "Pareto is diagnostic only. Practical compression is applied after ranking.",
    excluded: (count: number) => `${count} candidates outside the main choices`,
    dominanceCheck: "Recommendation details",
    fastNote: ({ included, exact, model, group, omitted }: any) =>
      `Fast: ${included} variants included; ${exact} exact, ${model} same-model, ${group} fastGroup evidence; ${omitted} omitted for insufficient evidence. Fast uses a transferred E2E estimate and ${FAST_COST_MULTIPLIER}× benchmark-equivalent cost.`,
    lowIqNote: (count: number) =>
      `${count} candidate${count === 1 ? "" : "s"} below IQ ${IQ_MINIMUM}.`,
    iqFloorReason: (iq: number) =>
      `IQ ${iq} is below the automatic floor of ${IQ_MINIMUM}.`,
    invalidNote: (count: number) =>
      `${count} candidate${count === 1 ? "" : "s"} lacked valid benchmark data.`,
    resourceNote: (weekly: number, short: number) =>
      `${weekly + short} candidates exceed calibrated resource capacity and were withheld from automatic recommendation.`,
    practicalNote: (count: number) =>
      `${count} ranked candidate${count === 1 ? "" : "s"} were practically dominated by an earlier, materially comparable choice.`,
    quotaDataNote:
      "Weekly burden is a family-capacity share. API-equivalent benchmark cost is an input, not a user bill.",
    qualityDataNote:
      "Quality uses current DeepSWE software-engineering IQ. DeepSWE is a calibration workload, not a claim about the exact user's task.",
    calibrationNote:
      "Calibration stays in this browser only. It is never uploaded.",
    benchmarkLabel: (value: string) => `DeepSWE-equivalent ${value}`,
    calibratedLabel: (value: string) => `Typical-task ${value}`,
    quotaValue: (value: number | null) =>
      value === null ? "Unavailable" : `${percent(value)} / week`,
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
    quotaReason: "Current family quota capacity is unavailable.",
    weeklyResourceReason:
      "Calibrated typical-task share reaches the weekly capacity.",
    shortResourceReason:
      "Calibrated typical-task share reaches the active short-window capacity.",
    practicalReason:
      "A higher-ranked choice is within the decision tolerances and materially lighter or faster.",
    dominatedBy: (name: string) => `Dominated by ${name}`,
    switchTo: "Open this alternative",
    fastReason:
      "Fast evidence was not sufficient to create a separate candidate.",
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
    announcedInactive: (modeName: string) =>
      `Now on ${modeName}; the panel remains scoped to DeepSWE software engineering.`,
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
      `${rankLabel}, ${label}${modeLabel}${winnerText}${fastDescription}, ${strategyLabel}: ${strategyDescription}, IQ ${iq}, quality ${qualityMargin}, weekly burden ${quota}, ${time}, ${endurance}${alternatives ? `, ${alternatives}` : ""}, ${originalDetails}`,
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
      "使用当前公开 DeepSWE 软件工程测量、套餐模型族容量和可选的本地工作负载校准；Standard 与 Fast 始终是独立选择。",
    sort: "策略",
    subscription: "订阅",
    sorting: "排序",
    fastSection: "Fast",
    calibration: "校准",
    openCalibration: "配置本地校准",
    gridAria: "当前策略的 DeepSWE 推荐组",
    details: "说明",
    notes: "说明",
    loading: "正在读取 DeepSWE 软件工程数据…",
    originalDetails: "打开原站详情",
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
    quota: "周额度负担",
    endurance: "5h 耐力",
    weeklyEndurance: "周耐力",
    time: "任务耗时",
    cardTime: "耗时",
    calibratedCardTime: "典型耗时",
    estimatedTime: "估计任务耗时",
    minutes: "分钟",
    week: "周",
    approximate: "≈",
    quotaUnavailableShort: "不可用",
    inactiveTitle: "当前不是软件工程能力页",
    inactiveDescription: (modeName: string) =>
      `此面板使用 DeepSWE 软件工程数据；当前页面由原站显示${modeName}。`,
    strategies: {
      quality: { label: "质量", winnerLabel: "首选" },
      effectiveness: { label: "综合成效", winnerLabel: "成效" },
      budget: { label: "经济", winnerLabel: "经济" },
      speed: { label: "速度", winnerLabel: "速度" },
    },
    strategyDescriptions: {
      quality: "先保留最高质量 4 IQ 带，再比较耗时、周额度负担和短窗口耐力。",
      effectiveness: "综合比较质量、典型任务耗时、周额度负担和短窗口耐力。",
      budget: "在保留有用软件工程质量的同时，优先降低典型任务的周额度负担。",
      speed: "在保留有用质量的同时，优先降低典型任务耗时并保持额度耐力。",
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    subscriptionMultipliers: { plus: "1×", pro5: "5×", pro20: "20×" },
    modeNames: { software: "软件工程能力", visual: "视觉空间推理" },
    errorTitle: "暂时无法读取 DeepSWE 软件工程数据",
    errorLoading: "原站报告了加载问题，可以刷新原站后重试。",
    errorMissing: "原站尚未提供可用的 DeepSWE 模型数据。",
    refresh: "刷新原站数据",
    noModelsTitle: `没有达到 IQ ${IQ_MINIMUM}`,
    noModelsDescription: `当前低于 IQ ${IQ_MINIMUM} 的模型仍保留在说明中，无法自动推荐。`,
    noValidTitle: "暂时没有可展示的有效模型",
    noValidDescription: "当前原站没有提供完整的可比较测量值。",
    noQuotaModelsTitle: "没有完整的自动推荐",
    noQuotaModelsDescription:
      "自动评分需要当前模型族额度容量；不可用的候选仍保留在说明中。",
    noDominatedTitle: "没有被移出的实用重复项",
    noDominatedDescription: "Pareto 只作诊断；实用压缩在排序之后进行。",
    excluded: (count: number) => `已移出主推荐 ${count} 个候选`,
    dominanceCheck: "推荐说明",
    fastNote: ({ included, exact, model, group, omitted }: any) =>
      `Fast：${included} 个变体纳入；${exact} 个有精确证据，${model} 个使用同模型证据，${group} 个使用 fastGroup 证据；${omitted} 个因证据不足未生成。Fast 使用迁移的 E2E 耗时估计和 ${FAST_COST_MULTIPLIER} 倍基准等价费用。`,
    lowIqNote: (count: number) => `${count} 个候选低于 IQ ${IQ_MINIMUM}。`,
    iqFloorReason: (iq: number) => `IQ ${iq} 低于自动推荐下限 ${IQ_MINIMUM}。`,
    invalidNote: (count: number) => `${count} 个候选缺少有效基准数据。`,
    resourceNote: (weekly: number, short: number) =>
      `${weekly + short} 个候选达到已校准的资源容量，因此不自动推荐。`,
    practicalNote: (count: number) =>
      `${count} 个已排序候选被更早且在决策容差内更轻/更快的选择实用支配。`,
    quotaDataNote:
      "周额度负担是模型族容量占比；基准等价费用只是输入，不是用户账单。",
    qualityDataNote:
      "质量使用当前 DeepSWE 软件工程 IQ。DeepSWE 是校准工作负载，不等于用户的具体任务。",
    calibrationNote: "校准只保存在本浏览器中，不会上传。",
    benchmarkLabel: (value: string) => `DeepSWE 等价${value}`,
    calibratedLabel: (value: string) => `典型任务${value}`,
    quotaValue: (value: number | null) =>
      value === null ? "不可用" : `${percent(value)} / 周`,
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
    quotaReason: "当前模型族额度容量不可用。",
    weeklyResourceReason: "已校准的典型任务周额度占比达到周容量。",
    shortResourceReason: "已校准的典型任务周额度占比达到当前短窗口容量。",
    practicalReason: "更高排序的选择在决策容差内，同时有明显更轻或更快的优势。",
    dominatedBy: (name: string) => `被 ${name} 覆盖`,
    switchTo: "打开这个替代项",
    fastReason: "Fast 证据不足，未生成独立候选。",
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
    announcedInactive: (modeName: string) =>
      `当前已切换到${modeName}，面板仍限定为 DeepSWE 软件工程能力。`,
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
      `${rankLabel}，${label}${modeLabel}${winnerText}${fastDescription}，${strategyLabel}：${strategyDescription}，IQ ${iq}，质量 ${qualityMargin}，周额度负担 ${quota}，${time}，${endurance}${alternatives ? `，${alternatives}` : ""}，${originalDetails}`,
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
