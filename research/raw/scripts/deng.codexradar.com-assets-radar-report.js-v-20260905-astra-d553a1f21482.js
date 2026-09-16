(function () {
  "use strict";

  var MODELS = [
    { id: "gpt-6-astra", label: "GPT-6-Astra", color: "#f97316", orb: "system" },
    { id: "gpt-5.6-sol", label: "Sol", color: "#eab308", orb: "sol" },
    { id: "gpt-5.6-terra", label: "Terra", color: "#3b82f6", orb: "terra" },
    { id: "gpt-5.6-luna", label: "Luna", color: "#cbd5e1", orb: "luna" },
    { id: "gpt-5.5", label: "GPT-5.5", color: "#22d3ee", orb: "system" }
  ];
  var EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
  var EFFORTS_REVERSE = EFFORTS.slice().reverse();
  var REPORT_WIDTH = 2400;
  var REPORT_HEIGHT = 4840;
  var MIN_TREND_POINTS = 6;
  var DEGRADATION_MIN_24H_DROP = 2;
  var DEGRADATION_LIMIT = 4;
  var REPORT_DATA_TTL_MS = 60 * 1000;
  var reportPayloadCache = null;
  var reportPayloadAt = 0;
  var reportPayloadPromise = null;
  var scriptUrl = new URL(document.currentScript.src, location.href);
  var assetRoot = new URL("./", scriptUrl);

  function localized(value) {
    return window.DRadarI18n
      ? window.DRadarI18n.translateText(String(value)) : String(value);
  }

  function englishReport() {
    return !!(window.DRadarI18n && window.DRadarI18n.isEnglish());
  }

  function apiRoot() {
    if (location.protocol === "file:") return null;
    var host = location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return "http://127.0.0.1:8399";
    return "https://api.codexradar.com";
  }

  function loadReportPayload(api) {
    if (reportPayloadCache && Date.now() - reportPayloadAt < REPORT_DATA_TTL_MS) {
      return Promise.resolve(reportPayloadCache);
    }
    if (reportPayloadPromise) return reportPayloadPromise;
    reportPayloadPromise = Promise.all([
      fetch(api + "/api/v1/table?ui=20260815-equal-iq-v2").then(function (r) {
        if (!r.ok) throw new Error("数据读取失败"); return r.json();
      }),
      fetch(api + "/api/v1/leaderboard").then(function (r) {
        if (!r.ok) throw new Error("天梯读取失败"); return r.json();
      }),
      fetch(api + "/api/v1/iq-history?v=20260815-equal-iq-v2").then(function (r) {
        if (!r.ok) throw new Error("趋势读取失败"); return r.json();
      }),
      fetch(api + "/api/v1/intelligence-efficiency?v=20260823-trend-cohort-v1")
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        }).then(function (payload) {
          return payload && payload.mode === "equal_latest_3" ? payload : null;
        }).catch(function () {
          // The report can still use the last complete hourly history when an
          // aggregate endpoint is unavailable (for example on another site).
          return null;
        })
    ]).then(function (payload) {
      reportPayloadCache = payload;
      reportPayloadAt = Date.now();
      return payload;
    }).finally(function () { reportPayloadPromise = null; });
    return reportPayloadPromise;
  }

  function recent(cell) {
    return cell && Array.isArray(cell.ran_by)
      ? cell.ran_by.filter(function (row) {
          return row && typeof row.passed === "boolean";
        }).slice(0, 3)
      : [];
  }

  function cellSample(cell) {
    var n = Number(cell && cell.n) || 0;
    return {p: n ? Number(cell.p) || 0 : 0, n: n};
  }

  function historyScoreAtOrBefore(points, targetMs) {
    var found = null;
    (points || []).some(function (point) {
      var pointMs = Date.parse(point.ts);
      if (!Number.isFinite(pointMs) || pointMs > targetMs) return pointMs > targetMs;
      if (Number.isFinite(Number(point.score))) found = Number(point.score);
      return false;
    });
    return found;
  }

  function stableTrendHistory(model, points) {
    var minimum = model === "gpt-5.5" ? 50 : 0;
    if (!minimum) return points || [];
    var start = (points || []).findIndex(function (point) {
      return point.score != null && Number(point.n) >= minimum;
    });
    return start < 0 ? [] : points.slice(start);
  }

  function isDeepSeekModel(model) {
    return String(model || "").toLowerCase().indexOf("deepseek") === 0;
  }

  function authoritativeSample(efficiency, model, effort) {
    if (!efficiency || efficiency.mode !== "equal_latest_3" ||
        !Number.isFinite(Date.parse(efficiency.source_updated_at))) return null;
    var matching = (efficiency.points || []).filter(function (point) {
      return point.model === model && (!effort || point.effort === effort);
    });
    if (!matching.length || matching.some(function (point) {
      return point.passed == null || point.total == null;
    })) return null;
    var sample = matching.reduce(function (total, point) {
      total.p += Number(point.passed) || 0;
      total.n += Number(point.total) || 0;
      return total;
    }, {p: 0, n: 0});
    return sample.n ? Object.assign({ts: efficiency.source_updated_at}, sample) : null;
  }

  function withAuthoritativeTrendPoint(points, sample) {
    var out = (points || []).slice();
    var liveTime = Date.parse(sample && sample.ts);
    if (!sample || !sample.n || !Number.isFinite(liveTime)) return out;
    var live = {
      ts: new Date(liveTime).toISOString(),
      score: Math.round(sample.p / sample.n * 1500) / 10,
      n: sample.n
    };
    var last = out[out.length - 1];
    var lastTime = Date.parse(last && last.ts);
    if (Number.isFinite(lastTime) && liveTime < lastTime) return out;
    if (last && String(last.ts).slice(0, 13) === live.ts.slice(0, 13)) {
      out[out.length - 1] = live;
    } else {
      out.push(live);
    }
    return out;
  }

  function degradationCandidates(history, authoritativeSampleFor) {
    return Object.keys(history || {}).reduce(function (rows, historyKey) {
      if (historyKey.indexOf("latest:") === 0) return rows;
      var comboKey = historyKey;
      var splitAt = comboKey.lastIndexOf("@");
      if (splitAt < 1) return rows;
      var model = comboKey.slice(0, splitAt), effort = comboKey.slice(splitAt + 1);
      if (isDeepSeekModel(model)) return rows;
      var points = stableTrendHistory(model, history[historyKey] || []);
      if (typeof authoritativeSampleFor === "function") {
        points = withAuthoritativeTrendPoint(
          points, authoritativeSampleFor(model, effort));
      }
      if (points.length < MIN_TREND_POINTS) return rows;
      var latestPoint = points[points.length - 1];
      var endMs = Date.parse(latestPoint.ts);
      if (!Number.isFinite(endMs) || !Number.isFinite(Number(latestPoint.score))) return rows;
      var current = Number(latestPoint.score);
      function drop(hours) {
        var previous = historyScoreAtOrBefore(points, endMs - hours * 3600000);
        return previous == null ? null : previous - current;
      }
      var drop12 = drop(12), drop24 = drop(24), drop48 = drop(48);
      if (!(drop24 >= DEGRADATION_MIN_24H_DROP) || !(drop12 > 0)) return rows;
      var trend24 = points.filter(function (point) {
        var pointMs = Date.parse(point.ts);
        return Number.isFinite(pointMs) && pointMs >= endMs - 24 * 3600000;
      });
      var trend48 = points.filter(function (point) {
        var pointMs = Date.parse(point.ts);
        return Number.isFinite(pointMs) && pointMs >= endMs - 48 * 3600000;
      });
      function highDrop(windowPoints) {
        return Math.max.apply(null, windowPoints.map(function (point) {
          return Number(point.score);
        })) - current;
      }
      var highDrop24 = highDrop(trend24), highDrop48 = highDrop(trend48);
      var smooth = stableTrendHistory(model, history[comboKey] || []);
      var smoothCurrent = smooth.length ? Number(smooth[smooth.length - 1].score) : NaN;
      var smoothPrevious = smooth.length
        ? historyScoreAtOrBefore(smooth, endMs - 24 * 3600000) : null;
      var smoothDrop24 = smoothPrevious == null || !Number.isFinite(smoothCurrent)
        ? 0 : smoothPrevious - smoothCurrent;
      var score = drop24 + Math.max(drop12, 0) * .45 +
        Math.max(drop48 || 0, 0) * .2 + Math.max(smoothDrop24, 0) * .5;
      rows.push({
        model: model, effort: effort, score: score, trend24: trend24,
        highDrop24: highDrop24, highDrop48: highDrop48
      });
      return rows;
    }, []).sort(function (a, b) {
      return b.score - a.score || b.highDrop24 - a.highDrop24;
    }).slice(0, DEGRADATION_LIMIT).sort(function (a, b) {
      var modelOrder = {"gpt-6-astra": 0, "gpt-5.6-sol": 1,
        "gpt-5.6-terra": 2, "gpt-5.6-luna": 3, "gpt-5.5": 4};
      var effortOrder = {low: 0, medium: 1, high: 2, xhigh: 3, max: 4, ultra: 5};
      return (modelOrder[a.model] == null ? 99 : modelOrder[a.model]) -
        (modelOrder[b.model] == null ? 99 : modelOrder[b.model]) ||
        (effortOrder[a.effort] == null ? 99 : effortOrder[a.effort]) -
        (effortOrder[b.effort] == null ? 99 : effortOrder[b.effort]) ||
        a.model.localeCompare(b.model);
    });
  }

  function degradationComboLabel(row) {
    var model = row.model.replace(/^gpt-5\.6-/, "");
    if (model !== row.model) model = model.charAt(0).toUpperCase() + model.slice(1);
    else {
      var found = MODELS.find(function (item) { return item.id === row.model; });
      model = found ? found.label : row.model;
    }
    return model + "-" + row.effort;
  }

  // Keep the exported thank-you ladder on the same default (monthly) ranking
  // and identity display rules as the homepage. Radar administrators remain
  // contributors, but never consume a volunteer rank.
  function reportTopContributors(leaderboard) {
    var contributors = (leaderboard && leaderboard.contributors || []).slice();
    var hasMonth = !!(leaderboard && leaderboard.month &&
      contributors.every(function (row) { return "month_points" in row; }));
    if (hasMonth) {
      contributors.sort(function (a, b) {
        return (Number(b.month_points) || 0) - (Number(a.month_points) || 0) ||
          (Number(b.month_graded) || 0) - (Number(a.month_graded) || 0) ||
          (Number(b.points) || 0) - (Number(a.points) || 0);
      });
    }
    return contributors.filter(function (row) {
      return row.is_radar_admin !== true;
    }).slice(0, 20);
  }

  function reportContributorName(row) {
    return row.github_login || row.nickname || "雷达蹬友";
  }

  function dailyDevelopmentRecommendations(points, count) {
    var DAILY_MIN_IQ = 90;
    var DAILY_MIN_IQ_GAIN = 1.5;
    var DAILY_METRIC_PREMIUM_PER_IQ = 0.02;
    var candidates = points.filter(function (point) {
      return Number.isFinite(point.iq) &&
        point.iq >= DAILY_MIN_IQ &&
        Number.isFinite(point.minutes) && point.minutes > 0 &&
        Number.isFinite(point.combined) && point.combined > 0;
    });
    if (!candidates.length) return [];
    var selected = [];
    ["minutes", "combined"].some(function (metric) {
      var remaining = candidates.filter(function (point) {
        return selected.indexOf(point) < 0;
      });
      if (!remaining.length || selected.length >= count) return true;
      var baseline = remaining.slice().sort(function (a, b) {
        return a[metric] - b[metric] || b.iq - a.iq;
      })[0];
      var upgrades = remaining.filter(function (point) {
        var iqGain = point.iq - baseline.iq;
        if (iqGain < DAILY_MIN_IQ_GAIN) return false;
        return point[metric] <= baseline[metric] *
          (1 + iqGain * DAILY_METRIC_PREMIUM_PER_IQ);
      }).sort(function (a, b) {
        return b.iq - a.iq || a[metric] - b[metric];
      });
      selected.push(upgrades.length ? upgrades[0] : baseline);
      return selected.length >= count;
    });
    return selected;
  }

  function automationCostRecommendations(points, count) {
    var AUTOMATION_MIN_IQ_GAIN = 1.5;
    var AUTOMATION_COST_PREMIUM_PER_IQ = 0.02;
    // Re-run the same cheapest-baseline comparison for each recommendation slot.
    var candidates = points.filter(function (point) {
      return Number.isFinite(point.iq) && Math.round(point.iq) >= 80 &&
        Number.isFinite(point.price);
    });
    var selected = [];
    while (candidates.length && selected.length < count) {
      var baseline = candidates.slice().sort(function (a, b) {
        return a.price - b.price || b.iq - a.iq;
      })[0];
      var upgrades = candidates.filter(function (point) {
        var iqGain = point.iq - baseline.iq;
        if (iqGain < AUTOMATION_MIN_IQ_GAIN) return false;
        return point.price <= baseline.price *
          (1 + iqGain * AUTOMATION_COST_PREMIUM_PER_IQ);
      }).sort(function (a, b) {
        return b.iq - a.iq || a.price - b.price;
      });
      var selectedPoint = upgrades.length ? upgrades[0] : baseline;
      selected.push(selectedPoint);
      candidates = candidates.filter(function (point) { return point !== selectedPoint; });
    }
    return selected;
  }

  function reportData(table, leaderboard, history, efficiency) {
    var tasks = (table.tasks || []).slice().sort(function (a, b) {
      var av = Number(a.discrimination && a.discrimination.score);
      var bv = Number(b.discrimination && b.discrimination.score);
      if (!Number.isFinite(av)) av = -Infinity;
      if (!Number.isFinite(bv)) bv = -Infinity;
      return bv - av || String(a.id).localeCompare(String(b.id));
    });
    function cell(taskId, model, effort) {
      return (table.cells || {})[taskId + "|" + model + "|" + effort] || {};
    }
    function stats(model, effort) {
      var tableSample = tasks.reduce(function (total, task) {
        var one = cellSample(cell(task.id, model, effort));
        total.p += one.p; total.n += one.n;
        return total;
      }, {p: 0, n: 0});
      var sample = authoritativeSample(efficiency, model, effort) || tableSample;
      var runs = tasks.reduce(function (all, task) {
        return all.concat(recent(cell(task.id, model, effort)));
      }, []);
      var minutes = runs.map(function (run) { return Number(run.duration_sec) / 60; })
        .filter(function (value) { return Number.isFinite(value) && value > 0; });
      var prices = runs.filter(function (run) {
        var value = Number(run.actual_cost_usd);
        return Number.isFinite(value) && value >= 0 && (effort !== "ultra" || run.cost_complete === true);
      }).map(function (run) { return Number(run.actual_cost_usd); });
      return {
        model: model, effort: effort, p: sample.p, n: sample.n,
        iq: sample.n ? sample.p / sample.n * 150 : 0,
        minutes: minutes.length ? minutes.reduce(function (a, b) { return a + b; }, 0) / minutes.length : null,
        price: prices.length ? prices.reduce(function (a, b) { return a + b; }, 0) / prices.length : null
      };
    }
    var combos = table.combos || [];
    var points = [];
    MODELS.forEach(function (model) {
      EFFORTS.forEach(function (effort) {
        if (combos.some(function (combo) { return combo.model === model.id && combo.effort === effort; })) {
          points.push(Object.assign(stats(model.id, effort), {
            label: model.label, color: model.color
          }));
        }
      });
    });
    var speedWeight = Math.log(2.5) / Math.log(1.35);
    points.forEach(function (point) {
      point.combined = point.price > 0 && point.minutes > 0
        ? point.price * Math.pow(point.minutes / 10, speedWeight) * 100 : null;
    });
    var priority = { "gpt-6-astra": 0, "gpt-5.6-sol": 1, "gpt-5.6-terra": 2, "gpt-5.6-luna": 3, "gpt-5.5": 4 };
    function solFirst(a, b) { return priority[a.model] - priority[b.model]; }
    function cheapCombined(a, b) {
      return (Number.isFinite(a.combined) ? a.combined : Infinity) -
        (Number.isFinite(b.combined) ? b.combined : Infinity) || b.iq - a.iq;
    }
    function pick(filter, sort, count) { return points.filter(filter).sort(sort).slice(0, count); }
    var dailyDevelopmentRows = dailyDevelopmentRecommendations(points, 2);
    var automationRows = automationCostRecommendations(points, 2);
    var lobsterRows = pick(function (p) {
      return p.iq >= 55 && p.combined != null;
    }, cheapCombined, 2);
    var recommendations = [
      { title: "日常开发", icon: "🧑‍💻", color: "#4ade80", rows: dailyDevelopmentRows },
      { title: "难题攻坚", icon: "⛏️", color: "#eab308", rows: pick(function (p) { return p.n > 0; }, function (a, b) {
        return b.iq - a.iq || solFirst(a, b) || cheapCombined(a, b);
      }, 2) },
      { title: "后台自动化", icon: "🔁", color: "#a78bfa", rows: automationRows },
      { title: "跑龙虾类任务", icon: "🦞", color: "#60a5fa", rows: lobsterRows }
    ];
    function authoritativeSampleFor(model, effort) {
      return authoritativeSample(efficiency, model, effort);
    }
    var degradation = degradationCandidates(
      history || {}, authoritativeSampleFor);
    var contributors = leaderboard.contributors || [];
    return {
      table: table, leaderboard: leaderboard, tasks: tasks, points: points,
      cell: cell, recommendations: recommendations, degradation: degradation,
      usd: contributors.reduce(function (sum, row) { return sum + (Number(row.usd) || 0); }, 0),
      tokens: contributors.reduce(function (sum, row) { return sum + (Number(row.tokens) || 0); }, 0),
      volunteers: contributors.filter(function (row) { return row.is_radar_admin !== true; }).length,
      top20: reportTopContributors(leaderboard)
    };
  }

  function loadImage(url, crossOrigin) {
    return new Promise(function (resolve) {
      var img = new Image();
      if (crossOrigin) img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  async function pixelAvatar(seed) {
    var digest = new Uint8Array(await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(seed)
    ));
    var backgrounds = ["#102a43", "#243b53", "#3c1642", "#16324f", "#243010", "#352f44"];
    var skins = ["#ffd6a5", "#f1b27d", "#c68642", "#8d5524", "#ffe0bd"];
    var hairs = ["#1b1b1b", "#4b2e20", "#8b5a2b", "#d4a017", "#5b3a70", "#1f4e5f"];
    var shirts = ["#00e5ff", "#7c3aed", "#22c55e", "#f97316", "#e11d48", "#eab308"];
    var bg = backgrounds[digest[0] % backgrounds.length];
    var skin = skins[digest[1] % skins.length];
    var hair = hairs[digest[2] % hairs.length];
    var shirt = shirts[digest[3] % shirts.length];
    var pixels = [];
    function put(x, y, color) { pixels.push([x, y, color]); }
    for (var y = 2; y < 7; y++) for (var x = 3; x < 9; x++) put(x, y, skin);
    put(2, 4, skin); put(9, 4, skin);
    var hairStyle = digest[4] % 4;
    for (var hx = 3; hx < 9; hx++) put(hx, 2, hair);
    if (hairStyle === 0 || hairStyle === 2) { put(3, 3, hair); put(8, 3, hair); }
    if (hairStyle === 1 || hairStyle === 2) { put(4, 3, hair); put(7, 3, hair); }
    if (hairStyle === 3) { put(3, 1, hair); put(4, 1, hair); put(7, 1, hair); put(8, 1, hair); }
    var eye = "#111827", mouth = digest[5] & 1 ? "#7f1d1d" : eye;
    put(4, 4, eye); put(7, 4, eye); put(5, 6, mouth); put(6, 6, mouth); put(5, 7, skin); put(6, 7, skin);
    for (var sy = 8; sy < 11; sy++) for (var sx = 3; sx < 9; sx++) put(sx, sy, shirt);
    put(2, 8, shirt); put(9, 8, shirt); put(2, 9, skin); put(9, 9, skin);
    if (digest[6] & 1) { put(5, 8, "#ffffff"); put(6, 8, "#ffffff"); }
    else { put(4, 8, "#ffffff"); put(7, 8, "#ffffff"); }
    var pants = digest[7] & 1 ? "#111827" : "#334155";
    [4, 5, 6, 7].forEach(function (px) { put(px, 11, pants); });
    var canvas = document.createElement("canvas");
    canvas.width = 12; canvas.height = 12;
    var avatarCtx = canvas.getContext("2d");
    avatarCtx.fillStyle = bg; avatarCtx.fillRect(0, 0, 12, 12);
    pixels.forEach(function (pixel) {
      avatarCtx.fillStyle = pixel[2]; avatarCtx.fillRect(pixel[0], pixel[1], 1, 1);
    });
    return canvas;
  }

  function canvasHelpers(ctx) {
    var font = 'ui-monospace, "SFMono-Regular", "PingFang SC", "Microsoft YaHei", monospace';
    function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
    }
    function text(value, x, y, size, color, weight, align) {
      value = localized(value);
      ctx.save();
      ctx.font = (weight || 500) + " " + size + "px " + font;
      ctx.fillStyle = color || "#d7efe0";
      ctx.textAlign = align || "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), x, y);
      ctx.restore();
    }
    function fitText(value, x, y, maxWidth, size, color, weight, align) {
      value = localized(value);
      var actual = size;
      ctx.font = (weight || 500) + " " + actual + "px " + font;
      while (actual > 11 && ctx.measureText(String(value)).width > maxWidth) {
        actual -= 1; ctx.font = (weight || 500) + " " + actual + "px " + font;
      }
      text(value, x, y, actual, color, weight, align);
    }
    function textWidth(value, size, weight) {
      value = localized(value);
      ctx.save();
      ctx.font = (weight || 500) + " " + size + "px " + font;
      var width = ctx.measureText(String(value)).width;
      ctx.restore();
      return width;
    }
    return { roundRect: roundRect, text: text, fitText: fitText, textWidth: textWidth };
  }

  function rateColor(rate, alpha) {
    var stops = [[239, 68, 68], [245, 158, 11], [34, 197, 94]];
    var r = Math.max(0, Math.min(1, rate));
    var segment = r <= .5 ? 0 : 1;
    var t = segment === 0 ? r * 2 : (r - .5) * 2;
    var rgb = stops[segment].map(function (value, i) {
      return Math.round(value + (stops[segment + 1][i] - value) * t);
    });
    return "rgba(" + rgb.join(",") + "," + (alpha == null ? 1 : alpha) + ")";
  }

  async function drawReport(data) {
    var canvas = document.createElement("canvas");
    canvas.width = REPORT_WIDTH; canvas.height = REPORT_HEIGHT;
    var ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    var h = canvasHelpers(ctx), rr = h.roundRect, text = h.text, fitText = h.fitText, textWidth = h.textWidth;
    var W = 1200, H = 2420;
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#020d09"); bg.addColorStop(.52, "#06140d"); bg.addColorStop(1, "#020906");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(45,212,191,.055)"; ctx.lineWidth = 1;
    for (var gy = 0; gy < H; gy += 22) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    var orbImages = {};
    await Promise.all(MODELS.map(async function (model) {
      orbImages[model.orb] = await loadImage(new URL("orbs/" + model.orb + "-transparent.png?v=2", assetRoot).href);
    }));
    var avatarImages = await Promise.all(data.top20.map(function (row) {
      if (row.avatar_seed) return pixelAvatar(row.avatar_seed);
      return row.avatar_url ? loadImage(row.avatar_url, true) : Promise.resolve(null);
    }));

    // Header: official radar mark, compact live timestamp and site totals.
    ctx.save(); ctx.translate(44, 46); ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.3;
    [38, 25, 12].forEach(function (r) { ctx.beginPath(); ctx.arc(38, 38, r, 0, Math.PI * 2); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(76, 38); ctx.moveTo(38, 0); ctx.lineTo(38, 76); ctx.stroke();
    ctx.fillStyle = "rgba(34,211,238,.28)"; ctx.beginPath(); ctx.moveTo(38, 38); ctx.arc(38, 38, 38, -Math.PI / 2, -.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.arc(23, 54, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    text("众测雷达", 140, 70, 34, "#e9fff6", 800);
    var now = new Intl.DateTimeFormat(englishReport() ? "en-US" : "zh-CN", {
      timeZone: "Asia/Shanghai", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date()).replace(" ", "  ");
    text("· 实时数据  " + now, 570, 72, 18, "#22d3ee", 700);
    ctx.strokeStyle = "rgba(45,212,191,.45)"; ctx.beginPath(); ctx.moveTo(30, 112); ctx.lineTo(1170, 112); ctx.stroke();
    var totals = [
      ["🔥 全站累计蹬掉", data.usd.toLocaleString("zh-CN", { maximumFractionDigits: 0 }) + " 刀"],
      ["🔥 全站累计贡献", (data.tokens / 1e8).toFixed(1) + " 亿词元"],
      ["👥 全站志愿者", data.volunteers + " 人"]
    ];
    totals.forEach(function (item, i) {
      var x = 84 + i * 385;
      text(item[0], x, 143, 16, "#7da68b", 650);
      text(item[1], x + textWidth(item[0], 16, 650) + 13, 143, 25,
        i === 2 ? "#39ff94" : "#facc15", 800);
      if (i < 2) { ctx.strokeStyle = "rgba(45,212,191,.22)"; ctx.beginPath(); ctx.moveTo(x + 346, 124); ctx.lineTo(x + 346, 160); ctx.stroke(); }
    });

    // Model cards.
    MODELS.forEach(function (model, index) {
      var x = 30 + index * 288, y = 184, w = 272, cardH = 314;
      rr(x, y, w, cardH, 12, "rgba(8,30,20,.86)", model.color, 1.5);
      var modelPoints = data.points.filter(function (p) { return p.model === model.id; });
      var pSum = modelPoints.reduce(function (sum, p) { return sum + p.p; }, 0);
      var nSum = modelPoints.reduce(function (sum, p) { return sum + p.n; }, 0);
      text(model.label, x + 16, y + 25, 20, model.color, 700);
      text(nSum ? Math.round(pSum / nSum * 150) : 0, x + 16, y + 65, 42, model.color, 800);
      text("IQ", x + 80, y + 68, 13, model.color, 700);
      if (orbImages[model.orb]) ctx.drawImage(orbImages[model.orb], x + w - 62, y + 17, 44, 44);
      var visible = EFFORTS_REVERSE.filter(function (effort) { return modelPoints.some(function (p) { return p.effort === effort; }); });
      visible.forEach(function (effort, tileIndex) {
        var point = modelPoints.find(function (p) { return p.effort === effort; });
        var col = tileIndex % 2, row = Math.floor(tileIndex / 2), tx = x + 14 + col * 123, ty = y + 92 + row * 66;
        rr(tx, ty, 116, 58, 6, "rgba(3,16,11,.72)", "rgba(99,165,124,.38)");
        text(effort, tx + 8, ty + 14, 11, "#8eb09a", 600);
        text(Math.round(point.iq), tx + 76, ty + 14, 16, "#d9fce5", 750, "center");
        ctx.strokeStyle = "rgba(99,165,124,.3)"; ctx.beginPath(); ctx.moveTo(tx + 57, ty + 3); ctx.lineTo(tx + 57, ty + 55); ctx.moveTo(tx + 3, ty + 31); ctx.lineTo(tx + 113, ty + 31); ctx.stroke();
        text(point.price == null ? "–" : "$" + point.price.toFixed(2), tx + 29, ty + 44, 11, "#62d98b", 650, "center");
        text(point.minutes == null ? "–" : Math.round(point.minutes) + "分钟", tx + 86, ty + 44, 10, "#9bc8aa", 600, "center");
      });
    });

    function drawChart(metric, title, axis, x, y, w, ch) {
      rr(x, y, w, ch, 10, "rgba(3,20,13,.82)", "rgba(45,212,191,.30)");
      text(title, x + 14, y + 23, 18, "#e4f9ec", 750);
      text("越靠左上越高效", x + w - 14, y + 23, 10, "#638671", 600, "right");
      var available = data.points.filter(function (p) { return Number.isFinite(p[metric]) && p[metric] > 0; });
      var px = x + 43, py = y + 58, pw = w - 58, ph = ch - 96;
      var vals = available.map(function (p) { return p[metric]; }), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      function xp(v) { return px + (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min) || 1) * pw; }
      function yp(v) { return py + (1 - Math.min(120, v) / 120) * ph; }
      ctx.strokeStyle = "rgba(117,162,131,.17)"; ctx.fillStyle = "#668773"; ctx.font = '9px ui-monospace, monospace';
      for (var i = 0; i <= 4; i++) { var xx = px + i / 4 * pw; ctx.beginPath(); ctx.moveTo(xx, py); ctx.lineTo(xx, py + ph); ctx.stroke(); }
      for (var j = 0; j <= 6; j++) { var yy = yp(j * 20); ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke(); text(j * 20, px - 6, yy, 8, "#668773", 500, "right"); }
      MODELS.forEach(function (model) {
        var series = available.filter(function (p) { return p.model === model.id; }).sort(function (a, b) { return EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort); });
        ctx.strokeStyle = model.color; ctx.lineWidth = 1.6; ctx.beginPath();
        series.forEach(function (p, idx) { var xx = xp(p[metric]), yy = yp(p.iq); if (idx) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }); ctx.stroke();
        series.forEach(function (p) { ctx.fillStyle = model.color; ctx.beginPath(); ctx.arc(xp(p[metric]), yp(p.iq), 3.2 + EFFORTS.indexOf(p.effort) * .16, 0, Math.PI * 2); ctx.fill(); });
      });
      text("IQ", px - 5, py - 10, 9, "#72927c", 600, "right"); text(axis, px + pw / 2, y + ch - 15, 10, "#72927c", 600, "center");
    }
    drawChart("combined", "综合成本 × 智力", "综合成本（对数）", 30, 522, 368, 286);
    drawChart("minutes", "时间成本 × 智力", "分钟（对数）", 416, 522, 368, 286);
    drawChart("price", "费用成本 × 智力", "美元（对数）", 802, 522, 368, 286);

    function drawRadarMark(cx, cy, radius) {
      ctx.save();
      ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1;
      [radius, radius * .58].forEach(function (r) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
      ctx.fillStyle = "rgba(34,211,238,.25)"; ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, -.48, .15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#a7f3d0"; ctx.beginPath();
      ctx.arc(cx + radius * .38, cy - radius * .35, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Station recommendations: mirror the live homepage hierarchy and labels.
    rr(30, 830, 1140, 182, 12, "rgba(4,25,16,.9)", "rgba(45,212,191,.48)", 1.2);
    drawRadarMark(67, 886, 15); text("站长推荐", 92, 886, 25, "#e7fff0", 800);
    rr(206, 874, 52, 25, 12, "rgba(34,197,94,.14)", "#22c55e");
    text("实时", 232, 887, 12, "#4ade80", 700, "center");
    ctx.strokeStyle = "rgba(45,212,191,.28)"; ctx.beginPath(); ctx.moveTo(275, 845); ctx.lineTo(275, 994); ctx.stroke();
    data.recommendations.forEach(function (group, index) {
      var x = 294 + index * 216, y = 846, w = 202;
      rr(x, y, w, 150, 5, "rgba(9,34,23,.72)"); ctx.fillStyle = group.color; ctx.fillRect(x, y, 4, 150);
      text(group.icon + "  " + group.title, x + 13, y + 20, 15, group.color, 750);
      ["模型 / 档位", "IQ", "耗时", "费用"].forEach(function (label, col) {
        var positions = [x + 12, x + 117, x + 149, x + 195]; text(label, positions[col], y + 48, 8, "#6e927b", 600, col ? "right" : "left");
      });
      group.rows.forEach(function (p, row) {
        var yy = y + 82 + row * 42; ctx.strokeStyle = "rgba(91,139,109,.22)"; ctx.beginPath(); ctx.moveTo(x + 10, yy - 18); ctx.lineTo(x + w - 9, yy - 18); ctx.stroke();
        fitText(p.label + " · " + p.effort, x + 12, yy, 96, 12, "#e3f5e9", 700);
        text(Math.round(p.iq), x + 117, yy, 12, "#e3f5e9", 700, "right");
        text(p.minutes == null ? "–" : Math.round(p.minutes) + "分钟", x + 159, yy, 10, "#b3ccba", 600, "right");
        text(p.price == null ? "–" : "$" + p.price.toFixed(2), x + 195, yy, 10, "#79d99b", 700, "right");
      });
    });

    function drawWarningTrend(points, x, y, w, trendH, color) {
      var valid = (points || []).filter(function (point) {
        return Number.isFinite(Date.parse(point.ts)) && Number.isFinite(Number(point.score));
      });
      if (valid.length < 2) return;
      var firstMs = Date.parse(valid[0].ts), lastMs = Date.parse(valid[valid.length - 1].ts);
      var values = valid.map(function (point) { return Number(point.score); });
      var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
      var span = Math.max(max - min, 3), middle = (max + min) / 2;
      min = middle - span / 2; max = middle + span / 2;
      function px(point, index) {
        if (lastMs === firstMs) return x + index / Math.max(valid.length - 1, 1) * w;
        return x + (Date.parse(point.ts) - firstMs) / (lastMs - firstMs) * w;
      }
      function py(point) {
        return y + (max - Number(point.score)) / (max - min) * trendH;
      }
      var avg = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
      var avgY = y + (max - avg) / (max - min) * trendH;
      ctx.save();
      ctx.strokeStyle = color; ctx.globalAlpha = .28; ctx.lineWidth = .8;
      ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, avgY); ctx.lineTo(x + w, avgY); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineWidth = 1.8;
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
      valid.forEach(function (point, index) {
        if (index) ctx.lineTo(px(point, index), py(point));
        else ctx.moveTo(px(point, index), py(point));
      });
      ctx.stroke();
      var lastPoint = valid[valid.length - 1];
      ctx.fillStyle = color; ctx.beginPath();
      ctx.arc(px(lastPoint, valid.length - 1), py(lastPoint), 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Degradation alerts: same current-vs-own-history selection as homepage,
    // presented as peers rather than a color-coded severity ranking.
    var warningColor = "#f59e0b";
    rr(30, 1024, 1140, 110, 10, "rgba(22,18,10,.88)", "rgba(249,115,22,.42)", 1);
    text("⚠️  降智预警", 52, 1062, 22, "#fed7aa", 800);
    rr(202, 1049, 52, 25, 12, "rgba(249,115,22,.09)", "#f97316");
    text("实时", 228, 1062, 12, "#fdba74", 700, "center");
    ctx.strokeStyle = "rgba(249,115,22,.28)"; ctx.beginPath();
    ctx.moveTo(275, 1038); ctx.lineTo(275, 1120); ctx.stroke();
    data.degradation.forEach(function (row, index) {
      var x = 294 + index * 216, y = 1039, w = 202;
      rr(x, y, w, 80, 5, "rgba(15,27,20,.78)", warningColor, .7);
      ctx.fillStyle = warningColor; ctx.fillRect(x, y, 4, 80);
      fitText(degradationComboLabel(row), x + 13, y + 24, 87, 13, "#e3f5e9", 800);
      drawWarningTrend(row.trend24, x + 108, y + 13, 81, 34, warningColor);
      text("24h", x + 13, y + 58, 8, "#6e927b", 700);
      text("↓" + row.highDrop24.toFixed(1), x + 40, y + 58, 11, warningColor, 850);
      text("48h", x + 105, y + 58, 8, "#6e927b", 700);
      text("↓" + row.highDrop48.toFixed(1), x + 132, y + 58, 11, warningColor, 850);
    });
    if (!data.degradation.length) {
      text("当前没有达到预警阈值的模型档位", 720, 1079, 15, "#7da68b", 650, "center");
    }

    // 112 × 19 historical pass-rate heatmap, sorted by discrimination.
    var heatCombos = [];
    MODELS.forEach(function (model) {
      EFFORTS_REVERSE.forEach(function (effort) {
        if ((data.table.combos || []).some(function (c) { return c.model === model.id && c.effort === effort; })) heatCombos.push({ model: model, effort: effort });
      });
    });
    var allNs = [];
    data.tasks.forEach(function (task) { heatCombos.forEach(function (combo) { allNs.push(Number(data.cell(task.id, combo.model.id, combo.effort).total_n) || 0); }); });
    var maxN = Math.max.apply(null, allNs.concat([1]));
    var hx = 92, hy = 1217, cw = 55, chh = 6.25;
    rr(30, 1155, 1140, 810, 12, "rgba(3,19,12,.86)", "rgba(45,212,191,.35)");
    text("区分度排序 ↓", 52, 1184, 13, "#789581", 650); text("历史通过率热力图", 600, 1184, 23, "#eafbf0", 800, "center"); text(data.tasks.length + "题 × " + heatCombos.length + "档", 1148, 1184, 13, "#789581", 650, "right");
    heatCombos.forEach(function (combo, col) {
      var xx = hx + col * cw + cw / 2; text(combo.effort, xx, 1208, 8, combo.model.color, 650, "center");
    });
    data.tasks.forEach(function (task, row) {
      if (row % 8 === 0) fitText(task.id, 78, hy + row * chh + 3, 45, 7, "#587261", 500, "right");
      heatCombos.forEach(function (combo, col) {
        var c = data.cell(task.id, combo.model.id, combo.effort), n = Number(c.total_n) || 0, p = Number(c.total_p) || 0;
        var rate = n ? p / n : 0, alpha = n ? .38 + .62 * Math.min(1, Math.log1p(n) / Math.log1p(maxN)) : .09;
        ctx.fillStyle = n ? rateColor(rate, alpha) : "rgba(51,65,58,.18)";
        ctx.fillRect(hx + col * cw + 1, hy + row * chh, cw - 3, Math.max(3.6, chh - 1.2));
      });
    });
    MODELS.forEach(function (model, mi) {
      var modelCols = heatCombos.filter(function (c) { return c.model.id === model.id; });
      if (!modelCols.length) return;
      var start = heatCombos.findIndex(function (c) { return c.model.id === model.id; });
      var center = hx + (start + modelCols.length / 2) * cw;
      if (orbImages[model.orb]) ctx.drawImage(orbImages[model.orb], center - 12, 1929, 24, 24);
      text(model.label, center, 1955, 10, model.color, 700, "center");
    });

    // Thanks ladder top 20.
    rr(30, 1987, 1140, 306, 12, "rgba(3,20,13,.88)", "rgba(45,212,191,.48)", 1.2);
    text("致谢 · 雷达天梯 TOP 20", 600, 2024, 24, "#eafff1", 800, "center");
    data.top20.forEach(function (row, index) {
      var col = index % 10, line = Math.floor(index / 10), cx = 82 + col * 112, cy = 2086 + line * 92, radius = 27;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
      if (avatarImages[index]) ctx.drawImage(avatarImages[index], cx - radius, cy - radius, radius * 2, radius * 2);
      else { ctx.fillStyle = "#153b27"; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2); text(reportContributorName(row).slice(0, 1), cx, cy, 20, "#a7f3c3", 800, "center"); }
      ctx.restore(); ctx.strokeStyle = "#34d399"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke();
      var badge = index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : String(index + 1);
      rr(cx + 16, cy - 35, 23, 20, 10, "#062418", "#34d399"); text(badge, cx + 27.5, cy - 25, index < 3 ? 12 : 9, "#eafff2", 750, "center");
      fitText(reportContributorName(row), cx, cy + 42, 96, 9, "#d0e9d8", 600, "center");
    });
    text("每一次蹬踏，都让雷达测试得更准。致敬每一位贡献算力的蹬友 🫡", 600, 2266, 14, "#83a98f", 650, "center");
    text("d e n g · c o d e x r a d a r · c o m", 600, 2354, 19, "rgba(80,230,167,.50)", 700, "center");
    text("众测雷达实时报告 · 图片生成时刻以页首为准", 600, 2386, 10, "rgba(112,151,125,.58)", 500, "center");
    return canvas;
  }

  function canvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("图片编码失败")); }, "image/png", 1);
    });
  }

  function installModal() {
    var root = document.createElement("div");
    root.className = "radar-report-modal";
    root.hidden = true;
    root.innerHTML = '<div class="radar-report-backdrop" data-report-close></div>' +
      '<section class="radar-report-dialog" role="dialog" aria-modal="true" aria-labelledby="radar-report-title">' +
      '<button class="radar-report-close" type="button" data-report-close aria-label="关闭">×</button>' +
      '<div class="radar-report-heading"><div><span>实时报告</span><h2 id="radar-report-title">众测雷达数据全景</h2></div>' +
      '<p class="radar-report-status" aria-live="polite">正在读取实时数据…</p></div>' +
      '<div class="radar-report-preview"><div class="radar-report-loader"><i></i><b>生成高清图片中</b><small>2400 × 4840 PNG</small></div><img alt="众测雷达实时报告预览"></div>' +
      '<div class="radar-report-actions"><button type="button" data-report-regenerate>↻ 重新生成</button>' +
      '<button type="button" data-report-download disabled>↓ 下载图片</button>' +
      '<button class="primary" type="button" data-report-copy disabled>⧉ 复制图片</button></div></section>';
    document.body.appendChild(root);
    var img = root.querySelector("img"), loader = root.querySelector(".radar-report-loader");
    var status = root.querySelector(".radar-report-status"), download = root.querySelector("[data-report-download]");
    var copy = root.querySelector("[data-report-copy]"), regenerate = root.querySelector("[data-report-regenerate]");
    var blob = null, objectUrl = null, busy = false;
    function message(value, error) { status.textContent = value; status.classList.toggle("error", Boolean(error)); }
    function close() { root.hidden = true; document.documentElement.classList.remove("report-open"); }
    root.querySelectorAll("[data-report-close]").forEach(function (button) { button.addEventListener("click", close); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !root.hidden) close(); });
    async function generate() {
      if (busy) return;
      busy = true; blob = null; download.disabled = true; copy.disabled = true; img.hidden = true; loader.hidden = false;
      message("正在读取实时数据…");
      try {
        var api = apiRoot();
        if (!api) throw new Error("本地文件模式无法读取实时数据，请通过本地网站地址打开主页");
        var results = await loadReportPayload(api);
        message("正在绘制 2400 × 4840 高清图片…");
        var canvas = await drawReport(reportData(
          results[0], results[1], results[2], results[3]));
        blob = await canvasBlob(canvas);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob); img.src = objectUrl; img.hidden = false; loader.hidden = true;
        download.disabled = false; copy.disabled = false; message("实时报告已生成 · PNG 高清原图");
      } catch (error) {
        loader.hidden = true; message(error && error.message ? error.message : "生成失败，请稍后重试", true);
      } finally { busy = false; }
    }
    download.addEventListener("click", function () {
      if (!blob) return; var a = document.createElement("a"); a.href = objectUrl;
      a.download = "众测雷达实时报告-" + new Date().toISOString().slice(0, 10) + ".png";
      if (englishReport()) {
        a.download = "crowd-radar-live-report-" +
          new Date().toISOString().slice(0, 10) + ".png";
      }
      a.click();
    });
    copy.addEventListener("click", async function () {
      if (!blob) return;
      try {
        if (!navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("当前浏览器不支持复制图片，请使用下载图片");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        message("图片已复制到剪贴板，可以直接粘贴"); copy.textContent = "✓ 已复制";
        setTimeout(function () { copy.textContent = "⧉ 复制图片"; }, 1800);
      } catch (error) { message(error.message || "复制失败，请改用下载图片", true); }
    });
    regenerate.addEventListener("click", generate);
    return { open: function () { root.hidden = false; document.documentElement.classList.add("report-open"); generate(); } };
  }

  function boot() {
    var launch = document.querySelector("[data-radar-report]");
    if (!launch) return;
    var modal = installModal();
    launch.addEventListener("click", modal.open);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
