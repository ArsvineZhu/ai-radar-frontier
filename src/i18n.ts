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

function formatQuotaPercent(value) {
  return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

const TRANSLATIONS = freezeRecord({
  en: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "Efficiency Frontier",
    infoAria: "Frontier model explanation",
    frontierExplanation:
      "Frontier model: uses DeepSWE software-engineering IQ, keeps clear quality/quota/time trade-offs, and creates Fast variants only when Radar E2E evidence is reliable.",
    sort: "Strategy",
    subscription: "Subscription",
    sorting: "Sorting",
    fastSection: "Fast",
    gridAria: "DeepSWE models not clearly dominated in three dimensions",
    details: "Filter details",
    notes: "Notes",
    loading: "Loading DeepSWE software-engineering data…",
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
    quality: "Quality",
    quota: "Quota",
    week: "wk",
    quotaPerWeek: "weekly quota",
    approximate: "≈",
    quotaUnavailableShort: "Unknown",
    recommendationScore: "Recommendation score",
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
    strategyDescriptions: {
      quality:
        "Stable quality first; near the top quality band, prefer faster and lighter candidates.",
      effectiveness:
        "Choose the balanced knee point across quality, time, and quota burden.",
      budget:
        "Reach an acceptable quality level, then minimize weekly quota burden without extreme delay.",
      speed:
        "Reach the quality floor, then minimize measured or conservatively estimated E2E time.",
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    subscriptionMultipliers: { plus: "1×", pro5: "5×", pro20: "20×" },
    modeNames: {
      software: "Software Engineering Ability",
      visual: "Visual-Spatial Reasoning",
    },
    errorTitle: "Unable to read DeepSWE software-engineering data",
    errorLoading:
      "The radar reported a loading problem. You can refresh the original source.",
    errorMissing: "The radar has not provided usable DeepSWE model data yet.",
    refresh: "Refresh source",
    noModelsTitle: `No model meets IQ ${IQ_MINIMUM}`,
    noModelsDescription: `All current models are below the IQ ${IQ_MINIMUM} threshold; the original page is unchanged.`,
    noValidTitle: "No valid models to display",
    noValidDescription:
      "The original cards do not contain all three comparable metrics; the original page is unchanged.",
    noQuotaModelsTitle: "No model fits this plan's quota gate",
    noQuotaModelsDescription:
      "The available model-family quota data puts every valid candidate above this strategy's sustainable per-task limit; the candidates remain in the details below.",
    noDominatedTitle: "No model is dominated across all three dimensions",
    noDominatedDescription:
      "Every valid model keeps at least one trade-off advantage.",
    dominanceRule:
      "Rule: only clear IQ/quota/time domination is excluded; close quality differences remain for strategy decisions.",
    excluded: (count) => `${count} candidates outside auto-recommendation`,
    dominanceCheck: "Dominance check",
    fastNote: ({ included, exact, model, generation, omitted, frontier }) =>
      `Fast is included when enabled: ${included} variants entered scoring; ${exact} use model-and-effort E2E evidence, ${model} use same-model evidence, and ${generation} use same-generation evidence. ${omitted} variants had no reliable comparable measurement and were omitted; ${frontier} entered the current frontier.`,
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
      strategyDescription,
      winnerText,
      fastDescription,
      iq,
      qualityMargin,
      quota,
      cost,
      time,
      rankLabel,
      qualityLabel,
      quotaLabel,
      costLabel,
      timeLabel,
      originalDetails,
    }) =>
      `${rankLabel}, ${label}${modeLabel}, ${strategyLabel} (${strategyDescription})${winnerText}${fastDescription}, IQ ${iq}, ${qualityLabel} ${qualityMargin}, ${quotaLabel} ${quota}, ${timeLabel} ${time}, ${costLabel} ${cost}, ${originalDetails}`,
    fastBadgeTitle: ({ source, multiplier }) =>
      `${source} · E2E ${multiplier} · cost ${FAST_COST_MULTIPLIER}×`,
    fastExactSource: "Radar E2E · model and effort",
    fastModelSource: "Radar E2E · same model",
    fastGenerationSource: "Radar E2E · same generation",
    announced: (count, strategy, candidates) =>
      `${count} models, sorted by ${strategy}; ${candidates} Fast candidates scored.`,
    announcedInactive: (modeName) =>
      `Now on ${modeName}; the filter remains Composite Intelligence.`,
    announcedOriginalChanged:
      "The original data just changed. Try again in a moment.",
    qualityDataNote:
      "The primary quality signal is DeepSWE software-engineering IQ; history only provides a light stability adjustment, while cards keep showing the current IQ.",
    quotaDataNote:
      "Family quota radar is used for the weekly burden and the strategy's sustainable per-task gate. Candidates without a current family quota value remain visible but are not auto-recommended.",
    quotaGateNote: ({ overLimit, unknown, limit }) =>
      `Quota gate: the ${formatQuotaPercent(limit)} per-task weekly-share limit excluded ${overLimit} over-limit candidate${overLimit === 1 ? "" : "s"} and ${unknown} candidate${unknown === 1 ? "" : "s"} without a current family quota value.`,
    quotaOverLimit: (share, limit) =>
      `~${(share * 100).toFixed(1)}% weekly quota per task; above this strategy's ${formatQuotaPercent(limit)} automatic limit`,
    quotaUnavailable:
      "No current model-family quota value; withheld from automatic recommendation",
  },
  zh: {
    eyebrow: "AI RADAR / FRONTIER",
    title: "效率前沿",
    infoAria: "前沿模型说明",
    frontierExplanation:
      "前沿模型：使用 DeepSWE 软件工程 IQ，保留质量、额度、耗时之间的明显取舍；只有存在可靠雷达 E2E 证据时才生成 Fast 候选。",
    sort: "策略",
    subscription: "订阅",
    sorting: "排序",
    fastSection: "Fast",
    gridAria: "未被三维明显支配的 DeepSWE 模型",
    details: "筛选说明",
    notes: "说明",
    loading: "正在读取 DeepSWE 软件工程数据…",
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
    quality: "质量",
    quota: "额度",
    week: "周",
    quotaPerWeek: "周额度",
    approximate: "≈",
    quotaUnavailableShort: "未知",
    recommendationScore: "推荐评分",
    time: "耗时",
    minutes: "分钟",
    currentAbilityPage: "当前能力页",
    strategies: {
      quality: { label: "质量", winnerLabel: "首选" },
      effectiveness: { label: "综合成效", winnerLabel: "成效" },
      budget: { label: "经济", winnerLabel: "经济" },
      speed: { label: "速度", winnerLabel: "速度" },
    },
    strategyDescriptions: {
      quality:
        "先看稳定质量；进入最高质量带后，再优先耗时更短、额度负担更轻的候选。",
      effectiveness: "在质量、耗时和周额度负担之间选择前沿拐点。",
      budget: "先达到可接受质量，再降低周额度负担，同时避免极端耗时。",
      speed: "先达到质量下限，再优先最短的实测或保守估计 E2E。",
    },
    subscriptions: { plus: "Plus", pro5: "Pro 5x", pro20: "Pro 20x" },
    subscriptionMultipliers: { plus: "1×", pro5: "5×", pro20: "20×" },
    modeNames: { software: "软件工程能力", visual: "视觉空间推理" },
    errorTitle: "暂时无法读取 DeepSWE 软件工程数据",
    errorLoading: "原站报告了加载问题，可以使用原站刷新。",
    errorMissing: "原站尚未提供可用的 DeepSWE 模型数据。",
    refresh: "使用原站刷新",
    noModelsTitle: `没有达到 IQ ${IQ_MINIMUM} 的模型`,
    noModelsDescription: `当前模型均低于 IQ ${IQ_MINIMUM} 门槛；原站内容保持不变。`,
    noValidTitle: "暂时没有可展示的有效模型",
    noValidDescription: "原站卡片缺少可比较的三项指标；原站内容保持不变。",
    noQuotaModelsTitle: "当前套餐没有通过额度门的模型",
    noQuotaModelsDescription:
      "当前可确认的模型族额度数据表明，所有有效候选都超过本策略的单任务可持续额度上限；候选仍保留在下方说明中。",
    noDominatedTitle: "当前没有被三维同时压过的模型",
    noDominatedDescription: "所有有效模型都至少保留了一项可取舍的优势。",
    dominanceRule:
      "规则：仅排除 IQ、额度负担、耗时都明显被压过的候选；接近的质量差异交给策略决定。",
    excluded: (count) => `已移出自动推荐 ${count} 个候选`,
    dominanceCheck: "支配检查",
    fastNote: ({ included, exact, model, generation, omitted, frontier }) =>
      `Fast 开启时参与评分：${included} 个变体进入候选；${exact} 个使用模型和档位的 E2E 实测，${model} 个使用同模型证据，${generation} 个使用同代证据。${omitted} 个因没有可靠可比测量而不生成；${frontier} 个进入当前前沿。`,
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
      strategyDescription,
      winnerText,
      fastDescription,
      iq,
      qualityMargin,
      quota,
      cost,
      time,
      rankLabel,
      qualityLabel,
      quotaLabel,
      costLabel,
      timeLabel,
      originalDetails,
    }) =>
      `${rankLabel}，${label}${modeLabel}，${strategyLabel}（${strategyDescription}）${winnerText}${fastDescription}，IQ ${iq}，${qualityLabel} ${qualityMargin}，${quotaLabel} ${quota}，${timeLabel} ${time}，${costLabel} ${cost}，${originalDetails}`,
    fastBadgeTitle: ({ source, multiplier }) =>
      `${source} · E2E ${multiplier} · 费用 ${FAST_COST_MULTIPLIER} 倍`,
    fastExactSource: "雷达 E2E · 模型和档位",
    fastModelSource: "雷达 E2E · 同模型",
    fastGenerationSource: "雷达 E2E · 同代",
    announced: (count, strategy, candidates) =>
      `${count} 个模型，当前排序：${strategy}；已将 ${candidates} 个 Fast 候选纳入评分。`,
    announcedInactive: (modeName) =>
      `当前已切换到${modeName}，筛选范围仍是综合智能。`,
    announcedOriginalChanged: "原站数据刚刚更新，请稍候重试。",
    qualityDataNote:
      "主质量指标为 DeepSWE 软件工程 IQ；历史数据只做轻量稳定性修正，卡片仍显示当前 IQ。",
    quotaDataNote:
      "优先使用模型族额度雷达计算周额度负担和策略可持续门槛；缺少当前模型族额度的数据仍会显示，但不自动推荐。",
    quotaGateNote: ({ overLimit, unknown, limit }) =>
      `额度门：单任务周额度占比上限为 ${formatQuotaPercent(limit)}，有 ${overLimit} 个候选超过本策略上限，另有 ${unknown} 个缺少当前模型族额度数据。`,
    quotaOverLimit: (share, limit) =>
      `单任务约占周额度 ${(share * 100).toFixed(1)}%，超过本策略 ${formatQuotaPercent(limit)} 的自动推荐上限`,
    quotaUnavailable: "缺少当前模型族额度数据，不参与自动推荐",
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
