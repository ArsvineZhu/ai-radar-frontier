import {
  FAST_COST_MULTIPLIER,
  IQ_MINIMUM,
  STRATEGY_KEYS,
  SUBSCRIPTION_KEYS,
} from "./config.js";

function freezeRecord(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

const TRANSLATIONS = freezeRecord({
  en: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "Efficiency Frontier",
    infoAria: "Frontier model explanation",
    frontierExplanation:
      "Frontier model: meets the IQ threshold and is not dominated by another model in all three dimensions. Fast uses measured radar E2E when available; otherwise the nominal multiplier is raised to the 0.9 power before comparison at 2.5× cost.",
    sort: "Strategy",
    subscription: "Subscription",
    sorting: "Sorting",
    fastSection: "Fast",
    gridAria: "Models not dominated in three dimensions",
    details: "Filter details",
    notes: "Notes",
    loading: "Loading composite intelligence data…",
    originalDetails: "Open original details",
    fast: "Fast",
    fastInclude: "Include Fast",
    fastExclude: "Exclude Fast",
    fastToggleAria: "Include Fast mode candidates",
    expandAria: "Show all models",
    collapseAria: "Show fewer models",
    fallenHint: (count) =>
      `${count} strategy winner${count === 1 ? "" : "s"} below`,
    fallenHintAria: (count) =>
      `Show the ${count} strategy winner${count === 1 ? "" : "s"} below`,
    cost: "Cost",
    time: "Time",
    minutes: "min",
    currentAbilityPage: "the current ability page",
    strategies: {
      quality: { label: "Quality", winnerLabel: "Preferred" },
      effectiveness: {
        label: "Composite effectiveness",
        winnerLabel: "Effectiveness",
      },
      budget: { label: "Economy", winnerLabel: "Economy" },
      speed: { label: "Speed", winnerLabel: "Speed" },
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    modeNames: {
      software: "Software Engineering Ability",
      visual: "Visual-Spatial Reasoning",
    },
    errorTitle: "Unable to read composite intelligence data",
    errorLoading:
      "The radar reported a loading problem. You can refresh the original source.",
    errorMissing:
      "The radar has not provided model cards yet; no filtering was applied.",
    refresh: "Refresh source",
    noModelsTitle: `No model meets IQ ${IQ_MINIMUM}`,
    noModelsDescription: `All current models are below the IQ ${IQ_MINIMUM} threshold; the original page is unchanged.`,
    noValidTitle: "No valid models to display",
    noValidDescription:
      "The original cards do not contain all three comparable metrics; the original page is unchanged.",
    noDominatedTitle: "No model is dominated across all three dimensions",
    noDominatedDescription:
      "Every valid model keeps at least one trade-off advantage.",
    dominanceRule:
      "Rule: IQ no lower, cost no higher, and duration no longer, with at least one strict improvement.",
    excluded: (count) => `${count} candidates excluded`,
    dominanceCheck: "Dominance check",
    fastNote: (compared, lower, candidates, frontier) =>
      `Fast is scored by default: ${candidates} candidates included; ${compared} were compared with a next higher standard tier, ${lower} had a lower strategy score, and ${frontier} entered the current frontier.`,
    lowIqNote: (count) =>
      `${count} models with IQ < ${IQ_MINIMUM} were filtered.`,
    invalidNote: (count) =>
      `${count} cards lacked IQ, cost, or duration and were not evaluated.`,
    dominatedBy: (label) => `Dominated by ${label}`,
    ariaRank: (rank) => `Rank ${rank}`,
    ariaPreferred: (labels) => (labels.length ? `, ${labels.join(", ")}` : ""),
    ariaFast: (multiplier) =>
      `, Fast E2E ${multiplier}, cost ${FAST_COST_MULTIPLIER}×`,
    cardAria: ({
      label,
      modeLabel,
      strategyLabel,
      weightsDescription,
      winnerText,
      fastDescription,
      iq,
      score,
      cost,
      time,
      rankLabel,
      costLabel,
      timeLabel,
      originalDetails,
    }) =>
      `${rankLabel}, ${label}${modeLabel}, ${strategyLabel} (${weightsDescription})${winnerText}${fastDescription}, IQ ${iq}, ${strategyLabel} ${score}, ${costLabel} ${cost}, ${timeLabel} ${time}, ${originalDetails}`,
    fastBadgeTitle: ({ source, multiplier }) =>
      `${source} · E2E ${multiplier} · cost ${FAST_COST_MULTIPLIER}×`,
    fastMeasuredSource: "Radar E2E",
    fastFallbackSource: "decayed fallback",
    announced: (count, strategy, candidates) =>
      `${count} models, sorted by ${strategy}; ${candidates} Fast candidates scored.`,
    announcedInactive: (modeName) =>
      `Now on ${modeName}; the filter remains Composite Intelligence.`,
    announcedOriginalChanged:
      "The original data just changed. Try again in a moment.",
    weightDescription: ({ qualityWeight, feeWeight, timeWeight }) =>
      `IQ ${Math.round(qualityWeight * 100)}% · Cost ${Math.round(feeWeight * 100)}% · Time ${Math.round(timeWeight * 100)}%`,
  },
  zh: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "效率前沿",
    infoAria: "前沿模型说明",
    frontierExplanation:
      "前沿模型：满足 IQ 门槛且未被其他模型三项同时支配。Fast 优先用雷达 E2E；无数据时使用标称倍率的 0.9 次幂，再按 2.5 倍费用比较上一级标准档。",
    sort: "策略",
    subscription: "订阅",
    sorting: "排序",
    fastSection: "Fast",
    gridAria: "未被三维支配的模型",
    details: "筛选说明",
    notes: "说明",
    loading: "正在读取综合智能数据…",
    originalDetails: "打开原站详情",
    fast: "Fast",
    fastInclude: "包含 Fast",
    fastExclude: "排除 Fast",
    fastToggleAria: "启用 Fast 模式候选",
    expandAria: "展开查看全部模型",
    collapseAria: "收起到精选模型",
    fallenHint: (count) => `还有 ${count} 个策略第一名`,
    fallenHintAria: (count) => `展开查看下方 ${count} 个策略第一名`,
    cost: "费用",
    time: "耗时",
    minutes: "分钟",
    currentAbilityPage: "当前能力页",
    strategies: {
      quality: { label: "质量", winnerLabel: "首选" },
      effectiveness: { label: "综合成效", winnerLabel: "成效" },
      budget: { label: "经济", winnerLabel: "经济" },
      speed: { label: "速度", winnerLabel: "速度" },
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    modeNames: { software: "软件工程能力", visual: "视觉空间推理" },
    errorTitle: "暂时无法读取综合智能数据",
    errorLoading: "原站报告了加载问题，可以使用原站刷新。",
    errorMissing: "原站尚未提供模型卡片，脚本不会进行任何隐藏操作。",
    refresh: "使用原站刷新",
    noModelsTitle: `没有达到 IQ ${IQ_MINIMUM} 的模型`,
    noModelsDescription: `当前模型均低于 IQ ${IQ_MINIMUM} 门槛；原站内容保持不变。`,
    noValidTitle: "暂时没有可展示的有效模型",
    noValidDescription: "原站卡片缺少可比较的三项指标；原站内容保持不变。",
    noDominatedTitle: "当前没有被三维同时压过的模型",
    noDominatedDescription: "所有有效模型都至少保留了一项可取舍的优势。",
    dominanceRule: "规则：IQ 不低、费用不高、耗时不长，且至少一项严格更优。",
    excluded: (count) => `已排除 ${count} 个候选`,
    dominanceCheck: "支配检查",
    fastNote: (compared, lower, candidates, frontier) =>
      `Fast 默认参与本策略评分，共 ${candidates} 个候选；其中 ${compared} 个有同系列上一级标准档可比较，${lower} 个策略得分更低；${frontier} 个进入当前前沿。`,
    lowIqNote: (count) => `${count} 张 IQ < ${IQ_MINIMUM} 的模型已按门槛过滤。`,
    invalidNote: (count) =>
      `${count} 张数据因缺少 IQ、费用或耗时，未参与筛选。`,
    dominatedBy: (label) => `被 ${label} 支配`,
    ariaRank: (rank) => `第 ${rank} 位`,
    ariaPreferred: (labels) => (labels.length ? `，${labels.join("、")}` : ""),
    ariaFast: (multiplier) =>
      `，Fast E2E ${multiplier}，费用 ${FAST_COST_MULTIPLIER} 倍`,
    cardAria: ({
      label,
      modeLabel,
      strategyLabel,
      weightsDescription,
      winnerText,
      fastDescription,
      iq,
      score,
      cost,
      time,
      rankLabel,
      costLabel,
      timeLabel,
      originalDetails,
    }) =>
      `${rankLabel}，${label}${modeLabel}，${strategyLabel}（${weightsDescription}）${winnerText}${fastDescription}，IQ ${iq}，${strategyLabel} ${score}，${costLabel} ${cost}，${timeLabel} ${time}，${originalDetails}`,
    fastBadgeTitle: ({ source, multiplier }) =>
      `${source} · E2E ${multiplier} · 费用 ${FAST_COST_MULTIPLIER} 倍`,
    fastMeasuredSource: "雷达 E2E",
    fastFallbackSource: "衰减 fallback",
    announced: (count, strategy, candidates) =>
      `${count} 个模型，当前排序：${strategy}；已将 ${candidates} 个 Fast 候选纳入评分。`,
    announcedInactive: (modeName) =>
      `当前已切换到${modeName}，筛选范围仍是综合智能。`,
    announcedOriginalChanged: "原站数据刚刚更新，请稍候重试。",
    weightDescription: ({ qualityWeight, feeWeight, timeWeight }) =>
      `IQ ${Math.round(qualityWeight * 100)}% · 费用 ${Math.round(feeWeight * 100)}% · 时间 ${Math.round(timeWeight * 100)}%`,
  },
});

export type Copy = (typeof TRANSLATIONS)["en"];

export function getLocale(root = document.documentElement) {
  return root.lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

export function getCopy(locale) {
  return TRANSLATIONS[locale] || TRANSLATIONS.zh;
}

export function createStrategyCatalog(copy) {
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

export function createSubscriptionCatalog(copy) {
  return Object.freeze(
    Object.fromEntries(
      SUBSCRIPTION_KEYS.map((key) => [
        key,
        Object.freeze({ label: copy.subscriptions[key] }),
      ]),
    ),
  );
}
