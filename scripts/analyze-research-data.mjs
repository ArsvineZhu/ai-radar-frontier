import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = resolve(root, "research", "raw");
const normalizedRoot = resolve(root, "research", "normalized");
const analysisRoot = resolve(root, "research", "analysis");
const analysisVersion = "1.0.0";
const bootstrapCount = 10_000;
const randomSeed = 0x6d2b79f5;
const planMultipliers = { Plus: 1, Pro5: 5, Pro20: 20 };
const quotaGates = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8];
const noiseIntervals = ["<=6h", "<=12h", "<=24h", "24-48h", "all"];
const qualityGapBins = [
  [0, 1, "0-1"],
  [1, 2, "1-2"],
  [2, 3, "2-3"],
  [3, 4, "3-4"],
  [4, 5, "4-5"],
  [5, 6, "5-6"],
  [6, 8, "6-8"],
  [8, 10, "8-10"],
  [10, 12, "10-12"],
  [12, 15, "12-15"],
  [15, 20, "15-20"],
  [20, Number.POSITIVE_INFINITY, "20+"],
];
const persistenceThresholds = {
  iq: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15],
  time_ratio: [5, 8, 10, 15, 20, 30, 40, 50],
  cost_ratio: [5, 8, 10, 15, 20, 30, 40, 50],
};
const modelFamilies = {
  "gpt-6-astra": "gpt-6",
  "gpt-5.6-sol": "gpt-5.6",
  "gpt-5.6-terra": "gpt-5.6",
  "gpt-5.6-luna": "gpt-5.6",
  "gpt-5.5": "gpt-5.5",
};
const efficiencyHistorySource =
  "https://codexradar.com/data/intelligence-efficiency.json";

function readJson(relativePath) {
  return readFile(resolve(root, relativePath), "utf8").then(JSON.parse);
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];
  const columns = rows[0];
  return rows
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        columns.map((column, index) => [column, values[index] ?? ""]),
      ),
    );
}

async function readCsv(relativePath) {
  return parseCsv(await readFile(resolve(root, relativePath), "utf8"));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(relativePath, columns, rows) {
  const output = [columns.join(",")];
  for (const row of rows) {
    output.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  await writeFile(
    resolve(root, relativePath),
    `${output.join("\n")}\n`,
    "utf8",
  );
}

async function writeJson(relativePath, value) {
  await mkdir(dirname(resolve(root, relativePath)), { recursive: true });
  await writeFile(
    resolve(root, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function sorted(values) {
  return values.slice().sort((left, right) => left - right);
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = sorted(values);
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? ordered[lower]
    : ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

function metricSummary(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) {
    return {
      n: 0,
      mean: null,
      std: null,
      p50: null,
      p75: null,
      p80: null,
      p90: null,
      p95: null,
      p99: null,
      max: null,
    };
  }
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance =
    usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  return {
    n: usable.length,
    mean,
    std: Math.sqrt(variance),
    p50: percentile(usable, 0.5),
    p75: percentile(usable, 0.75),
    p80: percentile(usable, 0.8),
    p90: percentile(usable, 0.9),
    p95: percentile(usable, 0.95),
    p99: percentile(usable, 0.99),
    max: Math.max(...usable),
  };
}

function shortKey(model, effort) {
  return `${model}@${effort ?? "unavailable"}`;
}

function hashString(value) {
  let hash = randomSeed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function noiseIntervalMatches(label, hours) {
  if (label === "all") return hours > 0;
  if (label === "<=6h") return hours > 0 && hours <= 6;
  if (label === "<=12h") return hours > 0 && hours <= 12;
  if (label === "<=24h") return hours > 0 && hours <= 24;
  return hours > 24 && hours <= 48;
}

function makeNoiseSummary(transitions) {
  const output = {};
  for (const interval of noiseIntervals) {
    const selected = transitions.filter((transition) =>
      noiseIntervalMatches(interval, transition.hours),
    );
    output[interval] = {
      iq_noise: metricSummary(selected.map((item) => item.iqNoise)),
      time_noise: metricSummary(selected.map((item) => item.timeNoise)),
      cost_noise: metricSummary(selected.map((item) => item.costNoise)),
    };
  }
  return output;
}

function normalizedEfficiencyHistoryRows(rows) {
  return rows
    .filter(
      (row) => row.source === efficiencyHistorySource && !row.history_variant,
    )
    .flatMap((row) => {
      const atTimestamp = timestamp(row.timestamp);
      if (atTimestamp === null) return [];
      return [
        {
          snapshotAt: row.timestamp,
          timestamp: atTimestamp,
          model: row.model || null,
          effort: row.effort || null,
          iq: finite(row.iq),
          cost: finite(row.cost),
          minutes: finite(row.minutes),
          sampleCount: finite(row.sample_count),
        },
      ];
    });
}

function isSupportedCodexCombo(combo) {
  return Boolean(
    combo &&
    combo.manual_only !== true &&
    combo.manual !== true &&
    !combo.provider &&
    !combo.agent &&
    !combo.billing_mode,
  );
}

function supportedCodexCombos(rawTable) {
  return (rawTable.combos ?? []).filter(isSupportedCodexCombo);
}

function buildNoiseAnalysis(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.model || !row.effort) continue;
    const key = shortKey(row.model, row.effort);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  const byModel = new Map();
  const byModelEffort = new Map();
  const allTransitions = [];
  for (const [key, values] of groups) {
    values.sort((left, right) => left.timestamp - right.timestamp);
    const transitions = [];
    for (let index = 1; index < values.length; index += 1) {
      const previous = values[index - 1];
      const current = values[index];
      const hours = (current.timestamp - previous.timestamp) / 3_600_000;
      if (!(hours > 0)) continue;
      const iqNoise =
        previous.iq !== null && current.iq !== null
          ? Math.abs(current.iq - previous.iq)
          : null;
      const timeNoise =
        previous.minutes > 0 && current.minutes > 0
          ? Math.abs(Math.log(current.minutes / previous.minutes))
          : null;
      const costNoise =
        previous.cost > 0 && current.cost > 0
          ? Math.abs(Math.log(current.cost / previous.cost))
          : null;
      transitions.push({ hours, iqNoise, timeNoise, costNoise });
      allTransitions.push({
        ...transitions.at(-1),
        model: current.model,
        effort: current.effort,
      });
    }
    byModelEffort.set(key, makeNoiseSummary(transitions));
    const modelValues = byModel.get(values[0].model) ?? [];
    modelValues.push(...transitions);
    byModel.set(values[0].model, modelValues);
  }
  return {
    overall: makeNoiseSummary(allTransitions),
    by_model: Object.fromEntries(
      [...byModel.entries()].map(([model, transitions]) => [
        model,
        makeNoiseSummary(transitions),
      ]),
    ),
    by_model_effort: Object.fromEntries(byModelEffort),
  };
}

function currentMap(rows) {
  return new Map(
    rows
      .filter((row) => row.model && row.effort)
      .map((row) => [shortKey(row.model, row.effort), finite(row.iq)]),
  );
}

function taskScoreMaps(rows) {
  const maps = new Map();
  for (const row of rows) {
    const attempts = finite(row.recent_attempts);
    const passed = finite(row.recent_passed);
    if (!row.model || !row.effort || attempts === null || attempts <= 0)
      continue;
    if (passed === null || passed < 0 || passed > attempts) continue;
    const key = shortKey(row.model, row.effort);
    const scores = maps.get(key) ?? new Map();
    scores.set(row.task_id, passed / attempts);
    maps.set(key, scores);
  }
  return maps;
}

function bootstrapGroup(pairList, scoreMaps) {
  const sharedKey = pairList[0].sharedTasks.join("|");
  const sharedTasks = pairList[0].sharedTasks;
  const comboKeys = [
    ...new Set(
      pairList
        .flatMap((pair) => [pair.keyA, pair.keyB])
        .filter((key) =>
          sharedTasks.every((taskId) => scoreMaps.get(key)?.has(taskId)),
        ),
    ),
  ];
  const scoreMatrix = comboKeys.map((key) =>
    sharedTasks.map((taskId) => scoreMaps.get(key).get(taskId)),
  );
  const means = new Map(
    comboKeys.map((key) => [key, new Float64Array(bootstrapCount)]),
  );
  const sums = new Float64Array(comboKeys.length);
  const random = rng(hashString(sharedKey));
  for (let sample = 0; sample < bootstrapCount; sample += 1) {
    sums.fill(0);
    for (let draw = 0; draw < sharedTasks.length; draw += 1) {
      const taskIndex = Math.floor(random() * sharedTasks.length);
      for (let comboIndex = 0; comboIndex < comboKeys.length; comboIndex += 1) {
        sums[comboIndex] += scoreMatrix[comboIndex][taskIndex];
      }
    }
    for (let comboIndex = 0; comboIndex < comboKeys.length; comboIndex += 1) {
      means.get(comboKeys[comboIndex])[sample] =
        sums[comboIndex] / sharedTasks.length;
    }
  }
  const deltaBuffer = new Float64Array(bootstrapCount);
  for (const pair of pairList) {
    const left = means.get(pair.keyA);
    const right = means.get(pair.keyB);
    if (!left || !right) continue;
    let leftWins = 0;
    let rightWins = 0;
    for (let sample = 0; sample < bootstrapCount; sample += 1) {
      const delta = (deltaBuffer[sample] =
        150 * (left[sample] - right[sample]));
      if (delta > 0) leftWins += 1;
      if (delta < 0) rightWins += 1;
    }
    const ordered = Array.from(deltaBuffer).sort((a, b) => a - b);
    pair.bootstrap = {
      bootstrap_mean_delta:
        ordered.reduce((sum, value) => sum + value, 0) / bootstrapCount,
      bootstrap_p05: percentile(ordered, 0.05),
      bootstrap_p10: percentile(ordered, 0.1),
      bootstrap_p25: percentile(ordered, 0.25),
      bootstrap_p50: percentile(ordered, 0.5),
      bootstrap_p75: percentile(ordered, 0.75),
      bootstrap_p90: percentile(ordered, 0.9),
      bootstrap_p95: percentile(ordered, 0.95),
      prob_a_gt_b: leftWins / bootstrapCount,
      prob_b_gt_a: rightWins / bootstrapCount,
      ci90_contains_zero:
        percentile(ordered, 0.05) <= 0 && percentile(ordered, 0.95) >= 0,
      ci95_contains_zero:
        percentile(ordered, 0.025) <= 0 && percentile(ordered, 0.975) >= 0,
    };
  }
}

function buildQualityPairs(taskRows, currentRows, rawTable) {
  const scoreMaps = taskScoreMaps(taskRows);
  const comboKeys = [
    ...new Set(
      supportedCodexCombos(rawTable)
        .map((combo) => shortKey(combo.model, combo.effort))
        .filter((key) => key !== "null@null"),
    ),
  ];
  const current = currentMap(currentRows);
  const pairs = [];
  for (let leftIndex = 0; leftIndex < comboKeys.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < comboKeys.length;
      rightIndex += 1
    ) {
      const keyA = comboKeys[leftIndex];
      const keyB = comboKeys[rightIndex];
      const scoresA = scoreMaps.get(keyA) ?? new Map();
      const scoresB = scoreMaps.get(keyB) ?? new Map();
      const sharedTasks = [...scoresA.keys()]
        .filter((taskId) => scoresB.has(taskId))
        .sort();
      const [modelA, effortA] = keyA.split("@");
      const [modelB, effortB] = keyB.split("@");
      pairs.push({
        keyA,
        keyB,
        modelA,
        effortA: effortA === "unavailable" ? null : effortA,
        modelB,
        effortB: effortB === "unavailable" ? null : effortB,
        currentIqA: current.get(keyA) ?? null,
        currentIqB: current.get(keyB) ?? null,
        sharedTasks,
      });
    }
  }
  const groups = new Map();
  for (const pair of pairs) {
    if (pair.sharedTasks.length < 2) continue;
    const key = pair.sharedTasks.join("|");
    const values = groups.get(key) ?? [];
    values.push(pair);
    groups.set(key, values);
  }
  for (const group of groups.values()) bootstrapGroup(group, scoreMaps);
  return pairs.map((pair) => ({
    model_a: pair.modelA,
    effort_a: pair.effortA,
    model_b: pair.modelB,
    effort_b: pair.effortB,
    current_iq_a: pair.currentIqA,
    current_iq_b: pair.currentIqB,
    current_delta_iq:
      pair.currentIqA !== null && pair.currentIqB !== null
        ? pair.currentIqA - pair.currentIqB
        : null,
    abs_delta_iq:
      pair.currentIqA !== null && pair.currentIqB !== null
        ? Math.abs(pair.currentIqA - pair.currentIqB)
        : null,
    shared_tasks: pair.sharedTasks.length,
    weight_mode: "unweighted",
    weight_status: "site_task_weight_not_confirmed",
    ...(pair.bootstrap ?? {
      bootstrap_mean_delta: null,
      bootstrap_p05: null,
      bootstrap_p10: null,
      bootstrap_p25: null,
      bootstrap_p50: null,
      bootstrap_p75: null,
      bootstrap_p90: null,
      bootstrap_p95: null,
      prob_a_gt_b: null,
      prob_b_gt_a: null,
      ci90_contains_zero: null,
      ci95_contains_zero: null,
    }),
  }));
}

function buildGapBins(pairRows) {
  return qualityGapBins.map(([minimum, maximum, label]) => {
    const rows = pairRows.filter(
      (row) =>
        row.abs_delta_iq !== null &&
        row.abs_delta_iq >= minimum &&
        row.abs_delta_iq < maximum,
    );
    const confidence = rows
      .map((row) =>
        Number.isFinite(row.prob_a_gt_b) && Number.isFinite(row.prob_b_gt_a)
          ? Math.max(row.prob_a_gt_b, row.prob_b_gt_a)
          : null,
      )
      .filter((value) => Number.isFinite(value));
    return {
      abs_delta_iq_bin: label,
      n_pairs: rows.length,
      median_shared_tasks: percentile(
        rows.map((row) => row.shared_tasks),
        0.5,
      ),
      fraction_ci90_contains_zero: rows.length
        ? rows.filter((row) => row.ci90_contains_zero).length / rows.length
        : null,
      fraction_ci95_contains_zero: rows.length
        ? rows.filter((row) => row.ci95_contains_zero).length / rows.length
        : null,
      fraction_direction_confidence_ge_80: confidence.length
        ? confidence.filter((value) => value >= 0.8).length / confidence.length
        : null,
      fraction_direction_confidence_ge_90: confidence.length
        ? confidence.filter((value) => value >= 0.9).length / confidence.length
        : null,
      fraction_direction_confidence_ge_95: confidence.length
        ? confidence.filter((value) => value >= 0.95).length / confidence.length
        : null,
    };
  });
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function persistenceMetric(first, current, next, metric) {
  if (metric === "iq") {
    if (![first.iq, current.iq, next.iq].every((value) => value !== null))
      return null;
    return { change: current.iq - first.iq, followup: next.iq - current.iq };
  }
  const firstValue = metric === "time_ratio" ? first.minutes : first.cost;
  const currentValue = metric === "time_ratio" ? current.minutes : current.cost;
  const nextValue = metric === "time_ratio" ? next.minutes : next.cost;
  if (![firstValue, currentValue, nextValue].every((value) => value > 0))
    return null;
  return {
    change: currentValue / firstValue - 1,
    followup: nextValue / currentValue - 1,
  };
}

function persistenceValue(row, metric) {
  if (metric === "iq") return row.iq;
  return metric === "time_ratio" ? row.minutes : row.cost;
}

function persistenceValueAvailable(row, metric) {
  const value = persistenceValue(row, metric);
  return metric === "iq" ? value !== null : value > 0;
}

function buildPersistence(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.model || !row.effort) continue;
    const key = shortKey(row.model, row.effort);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  const transitions = { iq: [], time_ratio: [], cost_ratio: [] };
  for (const values of groups.values()) {
    values.sort((left, right) => left.timestamp - right.timestamp);
    for (const metric of Object.keys(transitions)) {
      const available = values.filter((row) =>
        persistenceValueAvailable(row, metric),
      );
      for (let index = 1; index + 1 < available.length; index += 1) {
        const previous = available[index - 1];
        const current = available[index];
        const next = available[index + 1];
        if (
          current.timestamp <= previous.timestamp ||
          next.timestamp <= current.timestamp
        ) {
          continue;
        }
        const value = persistenceMetric(previous, current, next, metric);
        if (value) {
          transitions[metric].push({
            ...value,
            followupHours: (next.timestamp - current.timestamp) / 3_600_000,
          });
        }
      }
    }
  }
  const output = [];
  for (const [metric, thresholdValues] of Object.entries(
    persistenceThresholds,
  )) {
    for (const threshold of thresholdValues) {
      const rawThreshold = metric === "iq" ? threshold : threshold / 100;
      const selected = transitions[metric].filter(
        (item) => Math.abs(item.change) >= rawThreshold,
      );
      const same = selected.filter(
        (item) =>
          sign(item.change) !== 0 && sign(item.change) === sign(item.followup),
      ).length;
      const reversal = selected.filter(
        (item) =>
          sign(item.change) !== 0 && sign(item.change) === -sign(item.followup),
      ).length;
      output.push({
        metric,
        threshold,
        threshold_unit: metric === "iq" ? "IQ" : "percent",
        n: selected.length,
        same_sign_fraction: selected.length ? same / selected.length : null,
        reversal_fraction: selected.length ? reversal / selected.length : null,
        median_followup_hours: percentile(
          selected.map((item) => item.followupHours),
          0.5,
        ),
      });
    }
  }
  return {
    interpretation:
      "This estimates persistence of a directionally large change, not an indifference threshold.",
    source_semantics:
      "Only history-long rows from the efficiency-history.json source with blank history_variant are used; the source is the equal_latest_3 DeepSWE IQ/cost/minutes panel. API IQ-only history is excluded.",
    formula:
      "For each model+effort and each metric, retain metric-available observations in time order; using three successive available snapshots, change = metric_t / metric_prev - 1 (or IQ_t - IQ_prev), and followup is the next available change. Same sign and reversal are counted only when followup is nonzero.",
    results: output,
  };
}

function fastGroup(model) {
  return modelFamilies[model] ?? null;
}

function validFastRow(row) {
  const model = row.model?.trim();
  const effort = row.effort?.trim();
  const standard = finite(row.standard_e2e_seconds);
  const fast = finite(row.fast_e2e_seconds);
  if (!model || model.includes("${") || effort.includes("${")) return false;
  return standard !== null && standard > 0 && fast !== null && fast > 0;
}

function normalizedFastRows(rows) {
  return rows.flatMap((row) => {
    if (!validFastRow(row)) return [];
    const standard = finite(row.standard_e2e_seconds);
    const fast = finite(row.fast_e2e_seconds);
    return [
      {
        ...row,
        measuredTimestamp: timestamp(row.measured_at),
        ratio: finite(row.e2e_ratio) ?? standard / fast,
        nominal: finite(row.nominal_multiplier),
      },
    ];
  });
}

function fastStats(rows) {
  const ratios = rows
    .map((row) => row.ratio)
    .filter((value) => Number.isFinite(value));
  const fulfillment = rows
    .map((row) =>
      row.nominal > 1 ? (row.ratio - 1) / (row.nominal - 1) : null,
    )
    .filter((value) => value !== null && Number.isFinite(value));
  return {
    e2e_ratio: {
      p10: percentile(ratios, 0.1),
      p25: percentile(ratios, 0.25),
      p50: percentile(ratios, 0.5),
      p75: percentile(ratios, 0.75),
      p90: percentile(ratios, 0.9),
      mean: ratios.length
        ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length
        : null,
      std: metricSummary(ratios).std,
    },
    fulfillment: {
      p10: percentile(fulfillment, 0.1),
      p25: percentile(fulfillment, 0.25),
      p50: percentile(fulfillment, 0.5),
      p75: percentile(fulfillment, 0.75),
      p90: percentile(fulfillment, 0.9),
      mean: fulfillment.length
        ? fulfillment.reduce((sum, value) => sum + value, 0) /
          fulfillment.length
        : null,
      std: metricSummary(fulfillment).std,
    },
  };
}

function buildFastSummary(rows) {
  const latest = Math.max(
    ...rows.map((row) => row.measuredTimestamp ?? Number.NEGATIVE_INFINITY),
  );
  const groupDefinitions = {
    model_effort: (row) => `${row.model}@${row.effort || "unavailable"}`,
    model: (row) => row.model,
    fastGroup: (row) => fastGroup(row.model),
  };
  const windows = {};
  for (const [window, days] of [
    ["14d", 14],
    ["30d", 30],
    ["60d", 60],
    ["all", null],
  ]) {
    windows[window] = {};
    for (const [groupType, keyOf] of Object.entries(groupDefinitions)) {
      const groups = new Map();
      for (const row of rows) {
        const key = keyOf(row);
        if (!key) continue;
        const inside =
          days === null ||
          row.measuredTimestamp === null ||
          (row.measuredTimestamp >= latest - days * 24 * 60 * 60 * 1000 &&
            row.measuredTimestamp <= latest);
        if (!inside) continue;
        const values = groups.get(key) ?? [];
        values.push(row);
        groups.set(key, values);
      }
      windows[window][groupType] = Object.fromEntries(
        [...groups.entries()].map(([key, values]) => {
          const dated = values
            .map((row) => row.measuredTimestamp)
            .filter((value) => value !== null);
          const stats = fastStats(values);
          return [
            key,
            {
              n: values.filter((row) => Number.isFinite(row.ratio)).length,
              row_count: values.length,
              date_min: dated.length
                ? new Date(Math.min(...dated)).toISOString()
                : null,
              date_max: dated.length
                ? new Date(Math.max(...dated)).toISOString()
                : null,
              missing_timestamp_count: values.filter(
                (row) => row.measuredTimestamp === null,
              ).length,
              ...stats,
            },
          ];
        }),
      );
    }
  }
  return {
    reference_timestamp: Number.isFinite(latest)
      ? new Date(latest).toISOString()
      : null,
    windows,
    outlier_policy:
      "All valid rows are retained; no outlier deletion or winsorization is performed.",
  };
}

function familyForModel(model) {
  if (modelFamilies[model]) return model.replace(/^gpt-[^ -]+-/, "");
  if (model === "gpt-5.5") return "5.5";
  return null;
}

function buildQuotaDerived(currentRows, quotaPayload, fastRows) {
  const capacities = new Map(
    (quotaPayload.records ?? [])
      .filter(
        (record) =>
          String(record.plan ?? "").toLowerCase() === "pro20" &&
          String(record.window ?? "").toLowerCase() === "7d" &&
          finite(record.equivalent_capacity) !== null,
      )
      .map((record) => [record.family, finite(record.equivalent_capacity)]),
  );
  const fastRatios = new Map();
  const fastModelRatios = new Map();
  for (const row of fastRows) {
    const key = shortKey(row.model, row.effort || null);
    const values = fastRatios.get(key) ?? [];
    values.push(row.ratio);
    fastRatios.set(key, values);
    const modelValues = fastModelRatios.get(row.model) ?? [];
    modelValues.push(row.ratio);
    fastModelRatios.set(row.model, modelValues);
  }
  const output = [];
  for (const row of currentRows) {
    const family = familyForModel(row.model);
    const modes = [
      {
        mode: "Standard",
        cost: finite(row.average_price_usd),
        minutes: finite(row.average_minutes),
        fast_ratio: null,
      },
      {
        mode: "Fast",
        cost:
          finite(row.average_price_usd) === null
            ? null
            : finite(row.average_price_usd) * 2.5,
        minutes: null,
        fast_ratio:
          percentile(
            fastRatios.get(shortKey(row.model, row.effort)) ?? [],
            0.5,
          ) ?? percentile(fastModelRatios.get(row.model) ?? [], 0.5),
      },
    ];
    for (const mode of modes) {
      if (
        mode.mode === "Fast" &&
        mode.fast_ratio !== null &&
        finite(row.average_minutes) !== null
      ) {
        mode.minutes = finite(row.average_minutes) / mode.fast_ratio;
      }
      for (const [plan, multiplier] of Object.entries(planMultipliers)) {
        const capacity20x = family ? (capacities.get(family) ?? null) : null;
        const planCapacity =
          capacity20x === null ? null : (capacity20x * multiplier) / 20;
        const weeklyShare =
          planCapacity !== null && mode.cost !== null
            ? mode.cost / planCapacity
            : null;
        const gates = Object.fromEntries(
          quotaGates.map((gate) => [
            `eligible_gate_${String(Math.round(gate * 100)).padStart(3, "0")}`,
            weeklyShare === null ? "unavailable" : weeklyShare <= gate,
          ]),
        );
        output.push({
          model: row.model,
          effort: row.effort,
          mode: mode.mode,
          plan,
          iq: finite(row.iq),
          cost: mode.cost ?? "unavailable",
          minutes:
            mode.minutes ?? (mode.mode === "Fast" ? "unavailable" : null),
          family_capacity_20x: capacity20x ?? "unavailable",
          plan_capacity: planCapacity ?? "unavailable",
          weekly_share: weeklyShare ?? "unavailable",
          fast_ratio:
            mode.mode === "Fast"
              ? (mode.fast_ratio ?? "unavailable")
              : "not_applicable",
          quota_status: capacity20x === null ? "unavailable" : "available",
          ...gates,
        });
      }
    }
  }
  return output;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files;
}

async function inputHashes() {
  const files = [
    ...(await listFiles(rawRoot)),
    ...(await listFiles(normalizedRoot)),
  ].sort();
  const hashes = {};
  for (const file of files) {
    hashes[relative(root, file).replaceAll("\\", "/")] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  }
  return hashes;
}

async function main() {
  await mkdir(analysisRoot, { recursive: true });
  const efficiencyHistory = await readJson(
    "research/raw/efficiency-history.json",
  );
  const rawTable = await readJson("research/raw/task-table.json");
  if (rawTable.benchmark_id !== "deep-swe") {
    throw new Error(
      `Expected DeepSWE task table, got ${rawTable.benchmark_id ?? "unknown"}`,
    );
  }
  const quotaPayload = await readJson("research/raw/quota-current.json");
  const currentRows = await readCsv(
    "research/normalized/current-candidates.csv",
  );
  const historyRows = await readCsv("research/normalized/history-long.csv");
  const taskRows = await readCsv("research/normalized/task-matrix.csv");
  const fastCsvRows = await readCsv("research/normalized/fast-runs.csv");
  const semanticHistory = normalizedEfficiencyHistoryRows(historyRows);
  const fastRows = normalizedFastRows(fastCsvRows);
  const invalidFastRows = fastCsvRows.filter((row) => !validFastRow(row));

  const noise = buildNoiseAnalysis(semanticHistory);
  await writeJson("research/analysis/history-noise.json", {
    schema_version: 1,
    source: "research/raw/efficiency-history.json",
    benchmark: "deep-swe",
    metric_semantics: efficiencyHistory.method,
    adjacency_rule:
      "Within each model+effort, observations are sorted by timestamp and only consecutive observations are compared.",
    interval_rule:
      "<=6h, <=12h, and <=24h are cumulative upper bounds; 24-48h means >24h and <=48h; all means every positive interval.",
    formulas: {
      iq_noise: "abs(iq_t - iq_prev)",
      time_noise: "abs(log(minutes_t / minutes_prev))",
      cost_noise: "abs(log(cost_t / cost_prev))",
      std: "population standard deviation: sqrt(sum((x - mean)^2) / n)",
      quantiles:
        "linear interpolation on the sorted observed transition values",
    },
    note: "Cost noise is deliberately named cost_noise; it is not quota noise.",
    ...noise,
  });

  const pairRows = buildQualityPairs(taskRows, currentRows, rawTable);
  const pairColumns = [
    "model_a",
    "effort_a",
    "model_b",
    "effort_b",
    "current_iq_a",
    "current_iq_b",
    "current_delta_iq",
    "abs_delta_iq",
    "shared_tasks",
    "bootstrap_mean_delta",
    "bootstrap_p05",
    "bootstrap_p10",
    "bootstrap_p25",
    "bootstrap_p50",
    "bootstrap_p75",
    "bootstrap_p90",
    "bootstrap_p95",
    "prob_a_gt_b",
    "prob_b_gt_a",
    "ci90_contains_zero",
    "ci95_contains_zero",
    "weight_mode",
    "weight_status",
  ];
  await writeCsv(
    "research/analysis/quality-bootstrap-pairs.csv",
    pairColumns,
    pairRows,
  );
  await writeCsv(
    "research/analysis/quality-gap-bins.csv",
    Object.keys(buildGapBins(pairRows)[0]),
    buildGapBins(pairRows),
  );

  const persistence = buildPersistence(semanticHistory);
  await writeJson("research/analysis/preference-persistence.json", persistence);
  await writeJson(
    "research/analysis/fast-summary.json",
    buildFastSummary(fastRows),
  );
  await writeCsv(
    "research/analysis/current-quota-derived.csv",
    [
      "model",
      "effort",
      "mode",
      "plan",
      "iq",
      "cost",
      "minutes",
      "family_capacity_20x",
      "plan_capacity",
      "weekly_share",
      "eligible_gate_015",
      "eligible_gate_020",
      "eligible_gate_025",
      "eligible_gate_030",
      "eligible_gate_040",
      "eligible_gate_050",
      "eligible_gate_060",
      "eligible_gate_080",
      "fast_ratio",
      "quota_status",
    ],
    buildQuotaDerived(currentRows, quotaPayload, fastRows),
  );
  await writeCsv(
    "research/analysis/snapshot-panel.csv",
    ["snapshot_at", "model", "effort", "iq", "cost", "minutes", "sample_count"],
    semanticHistory.map((row) => ({
      snapshot_at: row.snapshotAt,
      model: row.model,
      effort: row.effort,
      iq: row.iq,
      cost: row.cost,
      minutes: row.minutes,
      sample_count: row.sampleCount,
    })),
  );
  await writeJson("research/analysis/excluded-semantic-sources.json", {
    excluded: [
      {
        source: "research/raw/iq-history.json",
        url: "https://api.codexradar.com/api/v1/iq-history",
        reason:
          "The response is IQ-only and contains full_series/latest_projection keys; it does not expose the same equal_latest_3 cost/minutes panel semantics. It remains preserved in raw and history-long.csv.",
      },
      {
        source: "research/normalized/fast-runs.csv",
        reason:
          "One row contains an HTML JavaScript template placeholder rather than a model/effort DOM measurement; it is excluded from Fast statistics as invalid parser output, not as an outlier.",
        rows_excluded: invalidFastRows.length,
      },
    ],
  });

  const hashes = await inputHashes();
  await writeJson("research/analysis/analysis-meta.json", {
    schema_version: 1,
    analysis_script_version: analysisVersion,
    generated_at: new Date().toISOString(),
    deterministic_results:
      "All analytical output calculations use the fixed seed and input snapshot. Only analysis-meta.generated_at records execution time and changes on rerun.",
    random_seed: `0x${randomSeed.toString(16)}`,
    bootstrap_count: bootstrapCount,
    bootstrap_unit:
      "task; each bootstrap draw samples shared tasks with replacement, never individual attempts",
    input_file_sha256: hashes,
    input_files: Object.keys(hashes),
    domain_policy:
      "No network access, model invocation, benchmark execution, smoothing, winsorization, or valid-outlier deletion.",
    outlier_policy:
      "All valid observations are retained. The single invalid Fast template row is excluded as parser-invalid input and recorded separately, not treated as an outlier.",
    filters: {
      history_noise:
        "Only history-long rows from the efficiency-history.json source with blank history_variant (equal_latest_3 DeepSWE semantics) are used; rows are grouped by model+effort and only adjacent positive timestamp gaps are compared.",
      quality_pairs:
        "Only task-table combos identified as supported Codex combos (no manual/provider/agent/billing metadata) are paired; each pair uses only shared tasks with recent_attempts > 0 and 0 <= recent_passed <= recent_attempts. No task weight is applied because site weight semantics are not confirmed.",
      persistence:
        "Only the same history-long efficiency-history panel is used; for each metric, three successive metric-available observations are required, while missing/nonpositive values are skipped for that metric and never imputed.",
      fast: "All valid Fast rows are retained, including outliers. Only blank/model-template rows lacking a real model+effort and positive E2E pair are excluded as invalid parser output.",
      quota:
        "Only quota-current.json records with plan=pro20 and window=7d public equivalent_capacity are calculated; families or measurements without capacity/cost produce literal unavailable fields and no inferred value.",
      panel:
        "Only history-long rows from the efficiency-history.json source with blank history_variant are retained; API IQ-only history is excluded for semantic comparability.",
    },
    formulas: {
      noise_iq: "abs(iq_t - iq_prev)",
      noise_time: "abs(log(minutes_t / minutes_prev))",
      noise_cost: "abs(log(cost_t / cost_prev))",
      noise_interval_selection:
        "<=6h, <=12h, <=24h are cumulative upper bounds; 24-48h means >24h and <=48h; all means every positive gap",
      standard_deviation:
        "sqrt(sum((x - mean)^2) / n), the population standard deviation",
      quantiles: "linear interpolation on sorted observed values",
      metric_summary:
        "n counts finite values; mean=sum(values)/n; std is population standard deviation; p50/p75/p80/p90/p95/p99 use linear interpolation; max is the maximum finite value",
      task_score: "recent_passed / recent_attempts",
      task_iq_delta: "150 * (mean(score_a) - mean(score_b))",
      bootstrap:
        "10,000 fixed-seed task-level resamples with replacement per shared-task set",
      ci90: "bootstrap p05 through p95; ci95 uses p025 through p975",
      direction_confidence: "max(prob_a_gt_b, prob_b_gt_a)",
      bootstrap_probabilities:
        "prob_a_gt_b=count(delta>0)/bootstrap_count; prob_b_gt_a=count(delta<0)/bootstrap_count",
      quality_gap_bin:
        "Assign abs_delta_iq to the first interval [minimum, maximum) containing it; 20+ is >=20",
      quality_gap_fractions:
        "Each fraction is the count satisfying its predicate divided by n_pairs in that bin; direction-confidence fractions use rows with both finite probabilities",
      fast_e2e_ratio: "standard_e2e_seconds / fast_e2e_seconds",
      fast_fulfillment: "(observed_ratio - 1) / (nominal_ratio - 1)",
      fast_mean: "sum(observed ratios) / n",
      fast_window:
        "14d, 30d, and 60d include dated rows at or after reference_timestamp minus the window; all includes every valid row; undated rows are retained and counted in every selected window",
      quota_plan_capacity:
        "family_capacity_20x * plan_multiplier / 20, with Plus=1, Pro5=5, Pro20=20",
      weekly_share: "cost / plan_capacity",
      quota_gate:
        "weekly_share <= gate threshold; unavailable when public family capacity is absent",
      persistence_iq: "change = iq_t - iq_prev",
      persistence_ratio: "change = metric_t / metric_prev - 1",
      persistence_qualification:
        "Select events where abs(change) >= threshold from three successive metric-available observations with positive time gaps",
      persistence_same_sign:
        "count(sign(change) = sign(followup) and both signs are nonzero) / n",
      persistence_reversal:
        "count(sign(change) = -sign(followup) and both signs are nonzero) / n",
      persistence_followup:
        "median(next_timestamp - current_timestamp) in hours over qualifying events",
    },
    task_weight_status:
      "unavailable_not_confirmed; task discrimination fields remain in task-matrix.csv/task-table.json but are not treated as sampling weights",
    source_counts: {
      efficiency_history_snapshots: efficiencyHistory.history?.length ?? 0,
      efficiency_history_rows: semanticHistory.length,
      current_candidates: currentRows.length,
      task_matrix_rows: taskRows.length,
      task_table_combos: rawTable.combos?.length ?? 0,
      supported_codex_combos: supportedCodexCombos(rawTable).length,
      excluded_non_codex_combos:
        (rawTable.combos?.length ?? 0) - supportedCodexCombos(rawTable).length,
      quality_pair_rows: pairRows.length,
      fast_valid_rows: fastRows.length,
      fast_invalid_rows: invalidFastRows.length,
    },
    output_files: [
      "research/analysis/history-noise.json",
      "research/analysis/quality-bootstrap-pairs.csv",
      "research/analysis/quality-gap-bins.csv",
      "research/analysis/preference-persistence.json",
      "research/analysis/fast-summary.json",
      "research/analysis/current-quota-derived.csv",
      "research/analysis/snapshot-panel.csv",
      "research/analysis/excluded-semantic-sources.json",
      "research/analysis/analysis-meta.json",
    ],
  });
  console.log(
    JSON.stringify(
      {
        analysis_version: analysisVersion,
        current_rows: currentRows.length,
        history_rows: semanticHistory.length,
        task_rows: taskRows.length,
        quality_pairs: pairRows.length,
        fast_valid_rows: fastRows.length,
        fast_invalid_rows: invalidFastRows.length,
      },
      null,
      2,
    ),
  );
}

await main();
