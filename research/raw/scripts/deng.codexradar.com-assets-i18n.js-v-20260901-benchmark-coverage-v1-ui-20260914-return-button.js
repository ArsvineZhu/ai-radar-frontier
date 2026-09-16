(function (root) {
  "use strict";

  var documentRef = root.document;
  var STORAGE_KEY = "dradar-language-v1";
  var ATTRIBUTES = [
    "title", "aria-label", "placeholder", "alt", "data-tip", "data-ladder-tip",
    "data-click-hint"
  ];
  var currentLanguage = "zh";
  var textRecords = new WeakMap();
  var attributeRecords = new WeakMap();
  var translatedTextNodes = new Set();
  var translatedElements = new Set();

  var EXACT = {
    "最近1小时全站已提交任务的缓存折扣后 API 等价费用；tokens 为 input + output，cached input 只计一次":
      "Cache-adjusted API-equivalent cost for network-wide submissions in the past hour; tokens = input + output, with cached input counted once",
    "DeepSWE 真实开源任务 × GPT-5.6 全系与 GPT-5.5 high/xhigh 共 19 个推理档位：一张表看清全部众测进度。服务端独立判分，志愿者用自己的订阅额度贡献算力。":
      "Live results across 19 reasoning tiers of GPT-5.6 and GPT-5.5 on real open-source DeepSWE tasks. Independent server-side grading, powered by compute donated from volunteers' own subscriptions.",
    "众测雷达": "Crowd Radar",
    "这台设备同时跑几车？": "How many cars should run on this device?",
    "新手默认 1 车。你可以直接输入车数，也可以快速选择。":
      "Newcomers default to one car. Enter a number or choose a shortcut.",
    "输入车数": "Enter cars",
    "恢复默认 1 车": "Restore the one-car default",
    "快速选择车数": "Quick car selection",
    "1 车": "1 car",
    "2 车": "2 cars",
    "5 车": "5 cars",
    "10 车": "10 cars",
    "20 车": "20 cars",
    "40 车": "40 cars",
    "新手默认": "Newcomer default",
    "基础上限": "Base limit",
    "前 50 解锁": "Top 50 unlock",
    "前 20 解锁": "Top 20 unlock",
    "前 10 解锁": "Top 10 unlock",
    "前 5 解锁": "Top 5 unlock",
    "设备参考：": "Device reference: ",
    "Mac mini M4（16GB 内存）最多可同时运行 10 车；如果你有高性能服务器，并且排名已经解锁，可以挑战 40 车。":
      "A Mac mini M4 with 16GB memory can run up to 10 cars. With a high-performance server and the required rank unlocked, you can challenge 40.",
    "站": "",
    "站点导航": "Site navigation",
    "雷达天梯": "Leaderboard",
    "🏆 雷达天梯": "🏆 Leaderboard",
    "📋 我的判分": "📋 My Grades",
    "我的判分": "My Grades",
    "✓ 已计入": "✓ Counted",
    "关闭我的判分": "Close My Grades",
    "只显示你自己的提交；按需加载，不会自动刷新。":
      "Only your submissions are shown. Records load on demand and never auto-refresh.",
    "打开后读取最近判分记录。": "Open to load your latest grading records.",
    "判分时间范围": "Grading period",
    "本月": "This Month",
    "刷新": "Refresh",
    "加载更多": "Load More",
    "如何参与": "How to Join",
    "参与贡献": "Contribute",
    "加入雷达群": "Join the Community",
    "开源": " Open Source",
    "✉️ 雷达信箱(反馈入口)": "✉️ Radar Mailbox (Feedback)",
    "真实任务持续实测": "Real-world tasks, continuously tested",
    "，模型表现实时更新": ", model performance updated live",
    "AI 编程模型真实任务众测排行榜":
      "Live AI coding agent benchmark and leaderboard",
    "众测雷达在真实开源软件工程任务和视觉推理题上持续实测主流 AI 编程模型，公开通过率、IQ、耗时、成本、样本量与服务端复验口径。":
      "Crowd Radar continuously tests leading AI coding models on real open-source software-engineering and visual-reasoning tasks, publishing pass rate, IQ, runtime, cost, sample size, and server-side verification methods.",
    "评测说明与专题页面": "Benchmark guides and topic pages",
    "DeepSWE 软件工程评测": "DeepSWE software-engineering benchmark",
    "庞贝壁画视觉推理评测": "Pompeii fresco visual-reasoning benchmark",
    "评分、成本与复验方法": "Scoring, cost, and verification methodology",
    "什么是众测雷达": "What is Crowd Radar?",
    "导出雷达报告 →": "Export Radar Report →",
    "← 返回主站": "← Back to main site",
    "← 返回 AI 雷达": "← Back to AI Radar",
    "← 返回 AI 雷达信息聚合站": "← Back to AI Radar Information Hub",
    "← 返回 Claude Code 雷达": "← Back to Claude Code Radar",
    "返回主站": "Back to main site",
    "站点公告": "Site announcements",
    "确认领取与运行方式": "Confirm Claim and Run Settings",
    "这台设备怎样运行": "How should this device run?",
    "默认由系统根据这台设备的可用资源安全安排。":
      "By default, the system chooses safely from this device's available resources.",
    "跑完这次领取后，继续领取同一种题":
      "After this claim finishes, continue with matching tasks",
    "默认关闭。开启后只会继续领取相同运行工具、模型和档位的题，并遵守下面的总量上限。":
      "Off by default. When enabled, only tasks with the same runtime, model, and level are added, up to the total below.",
    "这次总共最多运行多少题（包含现在选择的题）":
      "Maximum tasks for this run (including the tasks selected now)",
    "网页会记住这些选择。复制给编程助手后，它会直接照此运行，不会再问一遍。":
      "The website saves these choices. Your coding assistant will run them directly without asking again.",
    "确认领取": "Confirm Claim",
    "环境安装和初始化可能需要几分钟。建议先让编程助手完成环境检查，再回来领取，避免题目因 20 分钟内未启动被自动放回。":
      "Environment setup can take a few minutes. Let your coding assistant finish the environment check before claiming, so tasks are not returned after 20 minutes without a real start.",
    "复制给编程助手": "Copy for Coding Assistant",
    "运行说明已复制 ✓": "Run instructions copied ✓",
    "再次复制最近的运行说明": "Copy Latest Run Instructions Again",
    "题目已经领取，但安全运行入口暂时没有生成。请先不要手工启动；刷新页面后重试，长时间未开始的题会自动放回。":
      "The tasks were claimed, but a secure run entry was not created. Do not start them manually; refresh and try again. Tasks that do not start in time are returned automatically.",
    "请尽快复制并开始运行；长时间没有真正开始，题目会自动放回。":
      "Copy and start soon. Tasks that do not genuinely start in time are returned automatically.",
    "更多能力测试开发中": "More capability tests in development",
    "专属席位": "Reserved",
    "站长正在紧张调试": "The site owner is hard at work debugging",
    "即将上线": "Coming soon",
    "准备中": "In preparation",
    "内测": "BETA",
    "内测成本暂不显示": "Beta cost hidden",
    "API 等价成本": "API-equivalent cost",
    "真实平均耗时和 API 等价成本": "Actual average runtime and API-equivalent cost",
    "价格：仅统计完整请求账本，由服务端根据 token 用量和官网 API 单价折算的 API 等价成本；不代表订阅服务商实际扣费。":
      "Cost: complete request ledgers only, converted server-side from token usage at official API rates; this is not an amount actually charged by the subscription service.",
    "公开内测中的暂定分数；样本不足，结果仅供参考；IQ：每格最近 3 次，全部任务等权；时间：最近 3 次有效运行平均；价格：仅统计完整请求账本，由服务端根据 token 用量和官网 API 单价折算的 API 等价成本；不代表订阅服务商实际扣费。":
      "Provisional public-beta score; insufficient samples, for reference only; IQ: each cell uses its latest 3 runs with equal task weighting; time: average of the latest 3 valid runs; cost: complete request ledgers only, converted server-side from token usage at official API rates, not an amount actually charged by the subscription service.",
    "真实平均耗时和按当前标准 API 价重算的等价成本":
      "Actual average runtime and API-equivalent cost repriced at the current standard API tariff",
    "价格：仅统计完整请求账本，按当前 GLM 标准 API 单价重算历史 token 用量的 API 等价成本；不代表订阅服务商实际扣费。":
      "Cost: complete request ledgers only, repricing historical token usage at the current standard GLM API tariff; this is not an amount actually charged by the subscription service.",
    "公开内测期间暂不显示单题美元成本。":
      "Per-task USD cost is hidden during public beta.",
    "公开内测中": "Public beta",
    "内测中": "BETA",
    "Kimi Code 公开内测": "Kimi Code public beta",
    "建议优先使用最高档 Allegro 或次高档 Allegretto 订阅，并保持单并发跑题；这里指订阅套餐，不是模型推理强度。Kimi Code 单题额度消耗较高，多并发更容易提前撞上供应商 5 小时额度限制，导致在途任务来不及完成、已经消耗的额度也无法形成有效判分。":
      "Prefer the top-tier Allegro or second-tier Allegretto subscription plan, and run one task at a time; these are subscription plans, not model reasoning-effort levels. Kimi Code tasks can consume substantial quota; parallel runs are more likely to hit the service's 5-hour limit before in-flight tasks finish, wasting quota without producing valid grades.",
    "暂定分数": "Provisional score",
    "⚠ 数据不足": "⚠ INSUFFICIENT DATA",
    "样本不足，结果仅供参考 · 不参与推荐、排序与曲线":
      "Insufficient samples; for reference only · Excluded from recommendations, rankings, and trends",
    "公开内测": "PUBLIC BETA",
    "内测待定": "Beta pending",
    "内测积分暂缓发放，待规则稳定后统一补发":
      "Beta points are deferred and will be granted together after the rules stabilize",
    "公开内测中，结果进入暂定模型分数卡":
      "Public beta; results feed the provisional model scorecard",
    "Kimi Code 公开内测期间不按格子即时发放积分。":
      "Kimi Code does not award per-cell points immediately during public beta.",
    "Kimi Code 按 10×–20× 动态倍率计分，内测分数暂不参与正式推荐；ZCode 与 Grok 已参与正式推荐。":
      "Kimi Code uses a 10×–20× dynamic multiplier and its beta scores remain excluded from formal recommendations; ZCode and Grok now participate in formal recommendations.",
    "ZCode 与 Grok 已正式上线并参与推荐、排序和趋势分析；Kimi Code 仍处于公开内测。三者继续按服务端根据完整 token 用量和官网 API 单价折算的 API 等价成本计分。":
      "ZCode and Grok are generally available and now participate in recommendations, rankings, and trend analysis; Kimi Code remains in public beta. All three continue to score from API-equivalent cost derived server-side from complete token usage and official API rates.",
    "Kimi Code 已正式上线；提示词会先检查本机 Kimi 订阅认证，OAuth 凭据不经过网页或聊天。":
      "Kimi Code is now generally available. The prompt first checks your local Kimi subscription authentication; OAuth credentials never pass through the webpage or chat.",
    "ZCode 已正式上线；提示词会先在本机终端安全配置并验证智谱 Coding Plan API Key，Key 不经过网页或聊天。":
      "ZCode is now generally available. The prompt first configures and verifies the BigModel Coding Plan API key securely in your local terminal; the key never passes through the webpage or chat.",
    "Google Antigravity 已正式上线；提示词会先在本机验证 Google OAuth 和 Gemini 3.7 / 3.8 Flash 三档模型，凭据不经过网页或聊天。":
      "Google Antigravity is now generally available. The prompt first verifies local Google OAuth and all three tiers of each available Gemini Flash model; credentials never pass through the webpage or chat.",
    "CodeBuddy HY4 并发灰度需要本机 CodeBuddy OAuth；每个任务只会调用隔离的本机凭据副本，凭据不经过网页、聊天或 DRadar Server。":
      "The concurrent CodeBuddy HY4 canary requires local CodeBuddy OAuth. Each task uses an isolated local credential copy; credentials never pass through the webpage, chat, or DRadar Server.",
    "API 等价预估成本": "Estimated API-equivalent cost",
    "普通 Codex 格子越久没有有效实测，加成越高，为":
      "Ordinary Codex cells earn a higher multiplier the longer they go without a valid measured run:",
    "所有运行工具使用同一套中位价签规则。":
      "Every runtime uses the same median price-tag policy.",
    "服务端只用可信账号中判分完成、未隔离且用量完整的历史样本校准价签；同一账号重复跑同一格只算一票，至少三个独立账号才会把格子标成实测价。样本不足时使用服务端冷启动估价，不会拿本次实耗给本次加分。":
      "The server calibrates tags only from established accounts' graded, unquarantined history with complete usage. Repeated runs by one account count as one vote per cell, and at least three independent accounts are required before a cell is marked measured. Sparse cells use a server-side cold-start estimate; the current run's own usage never raises its own reward.",
    "有效判分会完整记录，待内测数据和奖励规则稳定后统一补发；模型通过或未通过都不会影响补发资格。":
      "Every valid grade is recorded and points will be granted together after beta data and reward rules stabilize; pass or fail does not affect eligibility.",
    "使用本机 ChatGPT 订阅额度": "Uses local ChatGPT subscription quota",
    "使用本机智谱 Coding Plan 额度的评测":
      "Benchmark using local BigModel Coding Plan quota",
    "目前仅支持接入 DeepSeek 官方 API": "Currently supports the official DeepSeek API only",
    "Kimi Code 订阅 · K3 · low / high / max": "Kimi Code subscription · K3 · low / high / max",
    "智谱 Coding Plan · GLM-5.3 · low / high / max":
      "BigModel Coding Plan · GLM-5.3 · low / high / max",
    "智谱 Coding Plan · GLM-5.3 / GLM-5.3 Flash · low / high / max":
      "BigModel Coding Plan · GLM-5.3 / GLM-5.3 Flash · low / high / max",
    "智谱 Coding Plan": "BigModel Coding Plan",
    "Grok 订阅 · Grok 4.6 · low / medium / high / xhigh":
      "Grok subscription · Grok 4.6 · low / medium / high / xhigh",
    "Google Antigravity 订阅 · Gemini 3.7 / 3.8 Flash · low / medium / high":
      "Google Antigravity subscription · Gemini 3.7 / 3.8 Flash · low / medium / high",
    "CodeBuddy 订阅 · HY4 Preview · max / high / low · 支持并发":
      "CodeBuddy subscription · HY4 Preview · max / high / low · concurrent runs",
    "订阅评测组合即将开放": "subscription benchmark pairing is coming soon",
    "订阅": "SUB",
    "按实际 token 计费的 API 评测": "API benchmark billed by actual token usage",
    "使用本机订阅额度的评测": "Benchmark using local subscription quota",
    "即将加入评测": "Benchmark coming soon",
    "庞贝测试集尚无实测数据": "No measured results for the Pompeii test set yet",
    "当前推荐仅使用样本较稳定的 Codex 订阅模型；DeepSeek 采用独立 API 计费，暂不进入推荐":
      "Recommendations currently use only stable-sample Codex subscription models. DeepSeek uses separately billed API access and is excluded for now.",
    "当前推荐使用样本稳定的 Codex、ZCode 与 Grok；DeepSeek 独立 API 与 Kimi Code 公开内测数据暂不进入推荐":
      "Recommendations use stable-sample Codex, ZCode, and Grok models. DeepSeek API and Kimi Code public-beta data remain excluded for now.",
    "7 月月榜已结算": "July Leaderboard Finalized",
    "恭喜月榜前三名蹬友！请加入雷达交流群，联系群主领取奖品。":
      "Congratulations to the top three riders! Join the Radar community and contact the group owner to claim your prize.",
    "进群领奖 →": "Claim your prize →",
    "DeepSeek × Codex 已接入雷达": "DeepSeek × Codex Is Now on Radar",
    "DeepSeek V4 Flash 已加入雷达，现在可以直接在 Codex 里运行 DeepSeek，参与真实开源任务实测。":
      "DeepSeek V4 Flash has joined Radar. You can now run DeepSeek directly inside Codex on real-world open-source tasks.",
    "去测 DeepSeek →": "Benchmark DeepSeek →",
    "小时": "hours",
    "分": "min",
    "秒": "sec",
    "选择 Benchmark": "Choose a Benchmark",
    "运行工具 + 模型能力看板": "Runtime + model capability dashboard",
    "每 60 秒自动刷新": "Auto-refreshes every 60 seconds",
    "立即刷新模型能力分数": "Refresh model capability scores now",
    "只刷新模型能力卡片里的分数和样本数":
      "Refresh only scores and sample counts in model capability cards",
    "刷新中…": "Refreshing…",
    "已刷新": "Updated",
    "刷新失败，请重试": "Refresh failed. Try again",
    "正在切换 Benchmark……": "Switching Benchmark…",
    "正在读取全站运行数据……": "Loading network-wide activity…",
    "当前 Benchmark": "Current Benchmark",
    "当前运行工具": "Current runtime",
    "选择格子": "Choose Cells",
    "选题上下文与切换": "Task context and selectors",
    "切换当前 Benchmark": "Switch current Benchmark",
    "切换当前运行工具": "Switch current runtime",
    "支持的运行工具与模型": "Supported runtimes and models",
    "当前 Benchmark 暂不支持": "Not supported by the current Benchmark",
    "运行工具选择": "Runtime selection",
    "选题跑题区": "Task selection and runs",
    "需要参与跑题时，从这里认领格子并开始运行":
      "To contribute runs, claim cells and start here",
    "软件工程能力": "Software engineering",
    "视觉推理能力": "Visual reasoning",
    "庞贝壁画修复": "Pompeii fresco repair",
    "第三方公开": "Public third-party",
    "雷达自研": "Radar original",
    "⌨ 软件工程能力": "⌨ Software engineering",
    "🧩 视觉推理能力": "🧩 Visual reasoning",
    "模型测试效率": "Model test efficiency",
    "全新开放": "Newly available",
    "开始探索": "Start exploring",
    "功能正在测试中，敬请期待。": "This feature is currently in testing. Stay tuned.",
    "真实开源仓库任务，恢复代码行为并由容器测试判分。":
      "Real open-source repository tasks graded by reproducible container tests.",
    "从无旋转壁画碎片中恢复直接邻接拓扑；不评绝对坐标、画布尺度或旋转。":
      "Recover direct adjacency topology from correctly oriented fresco fragments; absolute coordinates, canvas scale, and rotation are not scored.",
    "仅评直接邻接拓扑": "Direct adjacency topology only",
    "主分：Macro-F1": "Primary metric: Macro-F1",
    "每个 RP group 只取 1 题": "One task per RP group",
    "容器复现测试": "Reproducible container tests",
    "主分：平均通过率": "Primary metric: mean pass rate",
    "查看公开参考示例": "View the public reference example",
    "我们怎么评分的": "How we score",
    "拼合完成示意": "Assembled reconstruction",
    "点这里查看碎片拼合后的壁画": "Click here to view the assembled fresco",
    "关闭碎片预览提示": "Dismiss fragment preview tip",
    "公开示例": "Public example",
    "块碎片": "fragments",
    "庞贝": "Pompeii",
    "模型看到碎片图后，只输出能够确认的无向直接邻接边；评分只比较邻接拓扑，不要求绝对坐标、画布尺度或旋转。":
      "After seeing the fragment sheet, output only direct undirected adjacencies that can be supported; absolute coordinates, canvas scale, and rotation are not scored.",
    "参考例题": "Reference task",
    "标准答案邻接图": "Gold adjacency graph",
    "查看标准答案 JSON ↗": "View the gold answer JSON ↗",
    "按碎片数量筛选": "Filter by fragment count",
    "全部碎片数": "All fragment counts",
    "2–5 块": "2–5 fragments",
    "6–10 块": "6–10 fragments",
    "11 块以上": "11+ fragments",
    "🧩 恢复效率": "🧩 Recovery Efficiency",
    "平均值 · 恢复 IQ = 平均 F1 × 150 · 每 60 秒刷新":
      "Averages · Recovery IQ = mean F1 × 150 · Refreshes every 60 seconds",
    "庞贝壁画邻接恢复怎么判分？": "How is Pompeii fresco adjacency recovery scored?",
    "IQ 统计模式": "IQ calculation mode",
    "实时监控": "Live",
    "近期表现": "Recent",
    "等权最近3次实测": "equally weighted latest 3 measured runs",
    "IQ 曲线时间范围": "IQ chart time range",
    "按编程语言筛选模型智力与题目": "Filter model IQ and tasks by programming language",
    "语言": "Language",
    "加载中……": "Loading…",
    "加载大表中……": "Loading benchmark matrix…",
    "🧠 智力效率": "🧠 Intelligence Efficiency",
    "平均值 · 与上方 IQ 口径同步 · 每 60 秒刷新":
      "Averages · Uses the IQ mode above · Refreshes every 60 seconds",
    "IQ：每格最近 3 次，全部任务等权；价格和时间：最近 3 次有效运行，普通平均。":
      "IQ: latest 3 runs per cell with all tasks weighted equally; price and runtime: unweighted averages of the latest 3 valid runs.",
    "IQ：每格最近 3 次，全部任务等权；时间：最近 3 次有效运行，普通平均；价格：仅统计完整 token 证据，按当前 DeepSeek 低谷价重算同一批真实 token 用量。":
      "IQ: latest 3 runs per cell with all tasks weighted equally; runtime: unweighted average of the latest 3 valid runs; price: the same verified token usage repriced at the current DeepSeek off-peak tariff.",
    "IQ：每格最近 3 次，全部任务等权；时间：最近 3 次有效运行，普通平均；价格：仅统计完整 token 证据，按当前 DeepSeek 高峰价重算同一批真实 token 用量。":
      "IQ: latest 3 runs per cell with all tasks weighted equally; runtime: unweighted average of the latest 3 valid runs; price: the same verified token usage repriced at the current DeepSeek peak tariff.",
    "IQ、价格和时间：最近 3 次有效运行，普通平均。":
      "IQ, price, and runtime: unweighted averages of the latest 3 valid runs.",
    "IQ、价格和时间：最近 1 次有效运行，普通平均。":
      "IQ, price, and runtime: the latest valid run, without weighting.",
    "正在读取价格、耗时与 IQ……": "Loading price, runtime, and IQ…",
    "回到最新播报，停留3秒后重新滚动": "Jump to the latest update and resume scrolling after 3 seconds",
    "回到最新播报，停留 3 秒": "Jump to the latest update and pause for 3 seconds",
    "站长推荐": "Editor's Picks",
    "GPT-5.6 全模型（不计 low）": "GPT-5.6 all models (excluding low)",
    "DeepSeek V4 Flash（max + high）": "DeepSeek V4 Flash (max + high)",
    "GPT-5.5（xhigh + high）": "GPT-5.5 (xhigh + high)",
    "暂无足够实测数据": "Not enough measured data yet",
    "实时": "Live",
    "⚠️ 降智预警": "⚠️ Performance Alerts",
    "我的 Codex 订阅类型": "My Codex plan",
    "选择运行工具": "Choose runtime",
    "DSH（DeepSeek专武）": "DSH (DeepSeek-native)",
    "目前仅支持接入 DeepSeek 官方 API": "Currently supports the official DeepSeek API only",
    "DSH 单独领取": "DSH separate claim",
    "DSH 需要你自己的 DeepSeek API Key；未配置时，提示词会引导你在本机终端隐藏输入，Key 不经过网页或聊天。":
      "DSH requires your own DeepSeek API key. If it is not configured, the prompt guides you through hidden input in a local Terminal; the key never passes through the website or chat.",
    "等待首批 DSH 跑分": "Waiting for the first DSH runs",
    "等待 DSH 首批实测数据": "Waiting for the first measured DSH results",
    "暂无 DSH 实测耗时和费用": "No measured DSH runtime or cost yet",
    "🚴 一键跑分": "🚴 Benchmark now",
    "🚴 一键领题跑分": "🚴 Pick & benchmark",
    "🎯 换一批": "🎯 Pick another set",
    "点这里": "Click here",
    "📍 只看我的": "📍 My cells only",
    "🧹 一键释放": "🧹 Release tasks",
    "释放当前账号在所有设备、所有测试集、所有运行工具和所有副本上的未开跑任务":
      "Release all tasks not yet started for this account across every device, test set, runtime, and replica",
    "释放当前账号在所有设备、所有测试集、所有运行工具和所有副本上的未开跑任务？":
      "Release all tasks not yet started for this account across every device, test set, runtime, and replica?",
    "运行中的任务会受到保护并继续运行。":
      "Running tasks are protected and will keep running.",
    "释放全部未开跑任务": "Release all tasks not started",
    "释放中…": "Releasing…",
    "当前账号没有可释放的未开跑任务。":
      "This account has no tasks not yet started to release.",
    "如果其他设备仍设置为跑完后继续，请到对应设备停止本次运行，否则还可能继续领取同一种题。":
      "If another device is set to continue with matching tasks, stop this run there or it may keep claiming matching tasks.",
    "读取中…": "Loading…",
    "全部状态": "All statuses",
    "可认领": "Available",
    "已认领": "Claimed",
    "解题中": "Running",
    "判分中": "Grading",
    "冷却中": "Cooldown",
    "按状态筛选": "Filter by status",
    "全部模型": "All models",
    "按模型筛选": "Filter by model",
    "全部档位": "All tiers",
    "按推理档位筛选": "Filter by reasoning tier",
    "更多筛选": "More filters",
    "认领者": "Claimed by",
    "昵称": "Nickname",
    "最近结果": "Latest result",
    "全部结果": "All results",
    "最近通过": "Latest passed",
    "最近未通过": "Latest failed",
    "无最近结果": "No recent result",
    "周额度百分比": "Weekly quota percentage",
    "最小": "Min",
    "最大": "Max",
    "周额度百分比最小值": "Minimum weekly quota percentage",
    "周额度百分比最大值": "Maximum weekly quota percentage",
    "积分倍率": "Point multiplier",
    "积分倍率最小值": "Minimum point multiplier",
    "积分倍率最大值": "Maximum point multiplier",
    "重置筛选": "Reset filters",
    "未设置筛选，显示全部格子": "No filters applied · Showing all cells",
    "清除全部": "Clear all",
    "模型配置 A": "Model configuration A",
    "待配置": "To be configured",
    "待接入": "Not connected",
    "模型配置待接入": "Model configuration not connected",
    "模型和跑分数据暂未接入": "Model and benchmark data are not connected yet",
    "👈 向左滑动查看右侧 DeepSeek 两档——任务名已为你钉在左侧":
      "👈 Swipe left to see the two DeepSeek tiers on the right — task names stay pinned on the left",
    "复制安装检查提示词": "Copy setup prompt",
    "安装检查提示词已复制 ✓": "Setup prompt copied ✓",
    "复制环境检查提示词": "Copy environment-check prompt",
    "环境检查提示词已复制 ✓": "Environment-check prompt copied ✓",
    "月榜": "Monthly",
    "总榜": "All-time",
    "历史成绩": "History",
    "月份": "Month",
    "刷取美元": "USD burned",
    "按当时价签折算": "Converted using the original price tag",
    "折算 / API 实付": "Value / API paid",
    "非 API 任务按认领时价签折算，不含 DeepSeek API。":
      "Non-API tasks use their claim-time value; DeepSeek API is excluded.",
    "DeepSeek API：充值账户按实际 token × DeepSeek 官网单价累计，不占 ChatGPT 订阅额度。":
      "DeepSeek API: paid-account usage calculated from actual tokens at official DeepSeek rates; does not use ChatGPT subscription quota.",
    "DeepSeek 格子不使用订阅额度，而是你自己的 API 余额。北京时间工作日 09:00–12:00、14:00–18:00 为高峰价，其余时间及周六、周日全天为低谷价；页面刷新时自动选择当前价段，也可用按钮手动切换本页价签预览，实际 API 等价费用仍按每次请求发生时的价段分别核算。":
      "DeepSeek cells use your own API balance, not subscription quota. Peak pricing applies on weekdays at 09:00–12:00 and 14:00–18:00 Beijing time; other hours and all weekend are off-peak. Refreshing selects the current band automatically, while the buttons can override the preview for the current page. API-equivalent cost is still calculated per request time.",
    "普通订阅任务按认领时价签折算；DeepSeek API 按真实 token 费用单列，API 认领估值不计入。":
      "Subscription tasks use their claim-time value; DeepSeek API actual token spend is listed separately and its claim estimate is excluded.",
    "费用待核算": "Cost pending",
    "历史成绩将在首个月榜结算后显示。":
      "History will appear after the first monthly leaderboard settles.",
    "连接众测雷达": "Connect with Crowd Radar",
    "雷达交流群": "Radar WeChat Group",
    "众测雷达交流群": "Crowd Radar WeChat Group",
    "众测雷达交流群 1": "Crowd Radar WeChat Group 1",
    "众测雷达交流群 2": "Crowd Radar WeChat Group 2",
    "官方公众号": "Official WeChat Account",
    "交流跑题经验，参与雷达开发建设与领奖":
      "Share benchmark-running experience, help build Radar, and join community rewards",
    "官方唯一公众号 · 获取每日 AI 黄历":
      "The official account · Get the daily AI almanac",
    "众测雷达交流群微信二维码": "Crowd Radar WeChat group QR code",
    "众测雷达交流群 1 微信二维码": "Crowd Radar WeChat group 1 QR code",
    "众测雷达交流群 2 微信二维码": "Crowd Radar WeChat group 2 QR code",
    "众测雷达唯一官方公众号二维码": "Official Crowd Radar WeChat account QR code",
    "数据每分钟刷新": "Data refreshes every minute",
    "基线更新于": "Baseline updated",
    "重选": "Pick again",
    "清空": "Clear",
    "认领": "Claim",
    "关闭": "Close",
    "取消": "Cancel",
    "确定": "Confirm",
    "知道了": "Got it",
    "首次参与？先检查运行环境": "First time here? Check your environment first",
    "复制提示词不会占用格子，也不会启动正式跑题。":
      "Copying the prompt does not claim a cell or start a benchmark run.",
    "暂不认领": "Not now",
    "环境已准备好，继续认领": "Environment ready · Continue",
    "全部": "All",
    "全部编程语言": "All programming languages",
    "未知": "Unknown",
    "正在擦车": "Wrapping up",
    "已停车": "Parked",
    "启动中": "Starting",
    "正在蹬": "Pedaling",
    "订阅": "Subscription",
    "按量 API": "Metered API",
    "Codex 订阅": "Codex subscription",
    "运行来源：API": "Run source: API",
    "运行来源：订阅": "Run source: Subscription",
    "运行来源：API、订阅": "Run sources: API and Subscription",
    "答案已提交，正在等待评分结果。":
      "The answer has been submitted and is waiting to be graded.",
    "正在准备任务运行环境，尚未进入模型解题阶段。":
      "The task environment is being prepared; model execution has not started yet.",
    "任务运行状态正常，模型正在解题。本轮暂未提交答案或产生判分结果。":
      "The task is running normally and the model is solving. This ride has not submitted an answer or received a grade yet.",
    "任务运行状态正常，模型正在解题。":
      "The task is running normally and the model is solving.",
    "当前没有任务在运行；停止未满 10 分钟，正在擦车并暂时保留自行车和本轮统计。":
      "No task is running. It stopped less than 10 minutes ago, so the bike is wrapping up and its ride totals remain visible.",
    "当前没有任务在运行；本轮已进入后 10 分钟停车保留期，20 分钟内重新开跑仍会续在同一轮。":
      "No task is running. This ride is parked for the second 10-minute grace period; restarting within 20 minutes continues the same ride.",
    "这辆车已经完成解题，正在上传运行进度、提交结果，或刚提交完等待下一题接棒。":
      "This task has finished solving and is uploading progress, submitting the result, or briefly handing off to the next task.",
    "GitHub 身份": "GitHub identity",
    "雷达身份": "Radar identity",
    "切换 GitHub": "Switch GitHub",
    "退出": "Log out",
    "用 GitHub 登录": "Sign in with GitHub",
    "换账号登录": "Use another account",
    "当前显示 GitHub 用户名": "Showing GitHub username",
    "点击修改雷达昵称": "Edit Radar nickname",
    "当前使用雷达身份，点击切换为 GitHub 身份":
      "Using Radar identity · Click to switch to GitHub identity",
    "当前使用 GitHub 身份，点击切换为雷达身份":
      "Using GitHub identity · Click to switch to Radar identity",
    "切换公开展示使用的身份": "Switch the identity shown publicly",
    "前往 GitHub 官方页面添加或切换账号": "Open GitHub's official page to add or switch accounts",
    "待点亮": "Ready to unlock",
    "青铜": "Bronze",
    "黄金": "Gold",
    "铂金": "Platinum",
    "钻石": "Diamond",
    "星耀": "Star Glory",
    "王者": "King",
    "非凡王者": "Extraordinary King",
    "绝世王者": "Peerless King",
    "传奇王者": "Legendary King",
    "任务收割机": "Task Harvester",
    "算力深潜者": "Compute Deep Diver",
    "高价值猎手": "High-value Hunter",
    "月榜冲锋手": "Monthly Charger",
    "DeepSeek 开荒者": "DeepSeek Pioneer",
    "并发舰长": "Parallel Captain",
    "长燃引擎": "Endurance Engine",
    "闪电蹬手": "Lightning Rider",
    "待实测": "Awaiting data",
    "认领格子点亮实时值": "Claim cells to add live results",
    "暂无有效样本": "No valid samples yet",
    "有真实运行数据后自动绘制": "This chart appears automatically once real runs arrive",
    "模型多选": "Models",
    "全选": "Select all",
    "全不选": "Select none",
    "未选择模型": "No models selected",
    "请选择至少一个模型查看图表": "Select at least one model to view the charts",
    "选择图表中显示的模型": "Choose models shown in the charts",
    "越靠左上越高效": "Best ↖",
    "全屏": "Full screen",
    "↙ 退出": "↙ Exit full screen",
    "横轴在此截断": "The x-axis is compressed here",
    "断轴": "Break",
    "↓ 筛选同步作用于下方三张图": "↓ Filters apply to all three charts below",
    "推理强度形状图例": "Reasoning-effort shape legend",
    "综合成本指数说明": "Combined cost index explanation",
    "综合成本 × 智力": "Cost × IQ",
    "综合成本 × IQ": "Cost × IQ",
    "综合成本（对数）": "Combined cost (log)",
    "综合成本指数（最高 = 100 · 对数轴）": "Combined cost index (max = 100 · log scale)",
    "时间成本 × 智力": "Time × IQ",
    "时间成本 × IQ": "Time × IQ",
    "平均耗时（分钟 · 对数轴）": "Average runtime (minutes · log scale)",
    "费用成本 × 智力": "$ Cost × IQ",
    "费用成本 × IQ": "$ Cost × IQ",
    "平均价格（USD · 对数轴）": "Average cost (USD · log scale)",
    "模型 / 档位": "Model / Tier",
    "耗时": "Runtime",
    "费用": "Cost",
    "日常开发": "Daily Development",
    "难题攻坚": "Hard Problems",
    "后台自动化": "Background Automation",
    "跑龙虾类任务": "Long-running Agent Tasks",
    "暂无符合条件的档位": "No tier currently matches",
    "推荐规则：": "Selection rule: ",
    "示意图 · 数据积累中": "Preview · Collecting data",
    "曲线：": "Charts: ",
    "全站看板": "Live dashboard",
    "🚩 第二届 · 15 万刀夺旗赛": "🚩 Round 2 · $150K Flag Race",
    "第二届 · 15 万刀夺旗赛": "Round 2 · $150K Flag Race",
    "全站已蹬": "Network total",
    "刀 · 谁的有效提交把累计金额蹬过 15 万刀，立即获得":
      "USD · The verified submission that pushes it past $150K wins",
    "1500 积分": "1,500 points",
    "永久旗帜装饰": "a permanent flag decoration",
    "雷达天梯夺旗者": "Radar Ladder flag winner",
    "▶ 首届冠军 ymcui 冲线回放": "▶ Watch first champion ymcui finish",
    "关闭冲线录像": "Close finish-line video",
    "🏆 首届冠军 Crosner（@ymcui）· 精彩冲线":
      "🏆 First champion Crosner (@ymcui) · Finish replay",
    "你的浏览器暂不支持播放这段录像。":
      "Your browser does not support playing this video.",
    "📜 查看直播记录": "📜 View live log",
    "关闭直播记录": "Close live log",
    "📜 第二届 15 万刀夺旗赛 · 前台直播记录":
      "📜 Round 2 · $150K Flag Race live log",
    "加载直播记录中……": "Loading live log…",
    "▶ 本届夺旗回放": "▶ Watch this finish replay",
    "关闭本届夺旗回放": "Close this finish replay",
    "🏆 第二届冠军 雷达站长 · 15 万刀冲线回放":
      "🏆 Round 2 champion Radar Station Chief · $150K finish replay",
    "正在蹬": "Active",
    "待开跑": "Waiting",
    "跑题中": "Running",
    "总蹬速": "Network burn rate",
    "刀": "USD",
    "亿词元": "×100M tokens",
    "最近": "Recent",
    "绿=通过": "Green = passed",
    "红=未通过": "Red = failed",
    "刚刚": "just now",
    "微蹬了": "ran",
    "小蹬了": "ran",
    "中蹬了": "ran",
    "大蹬了": "ran",
    "猛蹬了": "ran",
    "匿名志愿者": "Anonymous volunteer",
    "未知模型": "Unknown model",
    "估价 $": "estimated $",
    "实耗 $": "actual $",
    "区分度": "Discrimination",
    "未开放": "Unavailable",
    "专属格": "Exclusive cell",
    "已认领，待开跑": "Claimed · Waiting to start",
    "正在解题": "Running",
    "已提交，排队判分中": "Submitted · Waiting for grading",
    "在跑": "running",
    "不参与24小时名次比较": "Not included in the 24-hour rank comparison",
    "暂无可比较的历史名次": "No comparable historical rank",
    "近24小时排名持平": "Rank unchanged over 24 hours",
    "只看在蹬": "Active riders only",
    "趋势": "Trend",
    "雷达蹬友": "Radar Rider",
    "积分": "Points",
    "积分分布": "Point distribution",
    "关闭积分分布": "Close point distribution",
    "其他奖励/调整": "Other rewards / adjustments",
    "贡献 tokens": "Tokens contributed",
    "折算": "Value",
    "已判分": "Graded",
    "本月提交": "Monthly submissions",
    "总提交": "Total submissions",
    "当前没有在蹬的蹬友。": "No riders are active right now.",
    "虚位以待——第一批志愿者的名字会刻在这里。":
      "The leaderboard is waiting for its first contributors.",
    "当前没有达到预警阈值的模型档位":
      "No model tier currently meets the alert threshold",
    "区分度排序 ↓": "Sorted by discrimination ↓",
    "历史通过率热力图": "Historical Pass-rate Heatmap",
    "致谢 · 雷达天梯 TOP 20": "Thank You · Radar Leaderboard Top 20",
    "每一次蹬踏，都让雷达测试得更准。致敬每一位贡献算力的蹬友 🫡":
      "Every run makes the Radar more accurate. Thank you to everyone donating compute 🫡",
    "众测雷达实时报告 · 图片生成时刻以页首为准":
      "Crowd Radar live report · See the header for generation time",
    "实时报告": "Live Report",
    "众测雷达数据全景": "Crowd Radar Snapshot",
    "正在读取实时数据…": "Loading live data…",
    "生成高清图片中": "Generating high-resolution image",
    "众测雷达实时报告预览": "Crowd Radar live report preview",
    "↻ 重新生成": "↻ Regenerate",
    "↓ 下载图片": "↓ Download image",
    "⧉ 复制图片": "⧉ Copy image",
    "正在绘制 2400 × 4840 高清图片…": "Rendering a 2400 × 4840 high-resolution image…",
    "实时报告已生成 · PNG 高清原图": "Live report ready · Full-resolution PNG",
    "✓ 已复制": "✓ Copied",
    "图片已复制到剪贴板，可以直接粘贴": "Image copied to clipboard · Ready to paste",
    "数据读取失败": "Could not load radar data",
    "天梯读取失败": "Could not load leaderboard data",
    "趋势读取失败": "Could not load trend data",
    "图片编码失败": "Could not encode the image",
    "生成失败，请稍后重试": "Generation failed · Please try again",
    "当前浏览器不支持复制图片，请使用下载图片":
      "This browser cannot copy images · Please download the image instead",
    "复制失败，请改用下载图片": "Copy failed · Please download the image instead",
    "本地文件模式无法读取实时数据，请通过本地网站地址打开主页":
      "Live data is unavailable in file mode · Open the page through a local web server",
    "全站累计蹬掉": "Total compute burned",
    "全站累计贡献": "Total tokens contributed",
    "全站志愿者": "Total volunteers",
    "GPT-5.6 全模型": "All GPT-5.6 Models",
    "人": "volunteers",
    "格": "cells",
    "题": "tasks",
    "⛶ 全屏": "⛶ Full screen",
    "1 · 用 GitHub 登录": "1 · Sign in with GitHub",
    "2 · 选好你的订阅档位": "2 · Select your plan",
    "3 · 首次使用先准备环境": "3 · Prepare your environment",
    "4 · 选格子认领": "4 · Select and claim cells",
    "5 · 粘给 codex 跑起来": "5 · Paste into Codex and run",
    "6 · 回来看表": "6 · Return to the matrix",
    "2 / 5 / 10 / 20 / 40 个": "2 / 5 / 10 / 20 / 40 cells",
    "100% = 150 分": "100% = 150 IQ",
    "0% = 0 分": "0% = 0 IQ",
    "。比如 86% 就是 129 分。": ". For example, 86% becomes an IQ of 129.",
    "普通 Codex 格子越久没有有效实测，加成越高，最高":
      "The longer an ordinary Codex cell goes without a valid run, the larger its bonus, up to",
    "普通 DeepSeek 与 DSH 格子均为": "Standard DeepSeek and DSH cells both range from",
    "40 并发 / 一次 40 题": "40 at once / claim 40 at a time",
    "10 并发 / 一次 10 题": "10 at once / claim 10 at a time",
    "5 并发 / 一次 5 题": "5 at once / claim 5 at a time",
    "独家定制3D打印雷达奖杯和神秘小礼物一份":
      "custom 3D-printed Radar trophies and a mystery gift",
    "近24小时排名变化": "Rank change over the past 24 hours",
    "只显示当前有自行车的蹬友": "Show only contributors who are currently active",
    "真实平均耗时和实际用量费用": "Actual average runtime and usage cost",
    "真实平均耗时和按所选价段重算的 Token 用量费用":
      "Actual average runtime and verified token usage repriced for the selected tariff",
    "DeepSeek / DSH 价签可切换低谷价或高峰价":
      "Switch DeepSeek / DSH prices between off-peak and peak",
    "默认低谷价，实际认领与结算按发生时价段。":
      "Off-peak is the default; claims and settlement use the rate in effect when they occur.",
    "选择 DeepSeek 价格档位": "Choose the DeepSeek price band",
    "低谷价": "Off-peak",
    "高峰价": "Peak",
    "谷价": "Off-peak",
    "峰价": "Peak",
    "。": ".",
    "，": ", ",
    "；": "; ",
    "：": ": "
  };

  Object.assign(EXACT, {
    "什么是众测雷达": "What Is Crowd Radar?",
    "3 分钟看懂众测雷达：社区志愿者用自己的 Codex 订阅实测 GPT-5.6 的真实编码能力，服务端独立判分，降智无处逃。":
      "Crowd Radar in three minutes: volunteers use their own Codex subscriptions to measure GPT-5.6 on real coding tasks, with independent server-side grading.",
    "📡 众测雷达": "📡 Crowd Radar",
    "← 返回众测大表": "← Back to the benchmark matrix",
    "你的 GPT": "Is your GPT ",
    "又双叒": "getting worse ",
    "降智": "again",
    "了?": "?",
    "别猜了,也别吵了——": "Stop guessing and arguing—",
    "咱们直接测给全网看。": "let's benchmark it for everyone to see.",
    "人人蹬一脚 · 降智无处逃": "One run each · Performance drops have nowhere to hide",
    "去认领格子 →": "Claim a cell →",
    "四步上手": "Get started in four steps",
    "个格子": "cells",
    "112 道真实开源编程题": "112 real open-source coding tasks",
    "19 个模型档位": "19 model tiers",
    "每个格子 = 一个模型在这道题、这个推理档位的":
      "Each cell shows a model's ",
    "最近实测通过率": "latest measured pass rate",
    ",由社区志愿者用自己的 Codex 订阅跑出来,实时点亮。":
      " on that task at that reasoning tier, generated live by volunteers using their own Codex subscriptions.",
    "官方跑分是静态成绩单,雷达测的是":
      "Official benchmarks are static report cards. Radar measures the model ",
    "此刻": "right now",
    "的模型;还把上一代": " and compares it in the same arena with the previous generation, ",
    "GPT-5.5 拉进同场对照": "GPT-5.5",
    ",降没降智一眼见分晓。": ", so performance changes are visible at a glance.",
    "Sol · 6 档": "Sol · 6 tiers",
    "Terra · 6 档": "Terra · 6 tiers",
    "Luna · 5 档": "Luna · 5 tiers",
    "5.5 high/xhigh · 上代对照": "5.5 high/xhigh · Previous-gen baseline",
    "社区志愿者": "Community volunteers",
    "服务端独立判分": "Independent server-side grades",
    "百亿级": "10B+",
    "累计贡献 tokens": "Tokens contributed",
    "怎么参与": "How to Join",
    "四步上车,一条命令都不用敲": "Four steps · No commands to type",
    "GitHub 登录众测站": "Sign in with GitHub",
    "只用来确认身份、发访问令牌,": "Used only to verify your identity and issue an access token. ",
    "不碰你的 OpenAI 账号": "Your OpenAI account is never accessed",
    "在大表挑格子认领": "Choose cells from the matrix",
    "每格标着透明价签(约占你 7 天额度的 %),":
      "Every cell has a transparent estimate (its approximate share of your 7-day quota). ",
    "量力认领": "Claim what fits your budget",
    ",最多 10 个;懒得挑就点\"🎯 系统推荐 10 格\"。":
      ", up to 10 at a time; or select “🎯 Auto-pick 10 cells.”",
    "复制命令,粘给你的 Codex": "Copy the prompt and paste it into Codex",
    "它自己配环境、自己跑题、自己上传。":
      "It configures the environment, runs the tasks, and uploads the results. ",
    "你去干别的,它跑完叫你。": "You can do something else while it works.",
    "回来看格子点亮": "Come back to see your cells light up",
    "你跑过的格子上有你的头像,名字登上":
      "Your avatar appears on every cell you run, and your name joins the ",
    "值不值": "Is It Worth It?",
    "烧的是额度,攒的是江湖地位": "Spend quota · Build reputation",
    "你付出": "You contribute",
    "自己订阅里的一点额度——": "A little quota from your own subscription—",
    "价签全透明": "every estimate is transparent",
    ",跑之前就知道大概花多少,绝不盲烧":
      ", so you know the approximate cost before a run starts.",
    "你得到": "You receive",
    "积分 = 烧掉的额度,": "Points reflect the quota used, and ",
    "过不过都给分": "both passes and failures earn points",
    "——啃硬骨头不亏,失败也是有效数据":
      "—hard problems are never wasted, because failures are valid data too.",
    "天梯排名 + GitHub 头像亮相,总榜积分":
      "Leaderboard rank and GitHub visibility, with all-time points that ",
    "永久累计、永不缩水": "accumulate permanently",
    "第一手知道模型什么时候降智——": "Be the first to know when model performance changes—",
    "你就是雷达本达": "you are part of the Radar",
    "🏆 每月结算:月榜": "🏆 Monthly awards: the ",
    "冠亚季军": "top three",
    "各得一座": " each receive a ",
    "独家定制 3D 打印雷达奖杯": "custom 3D-printed Radar trophy",
    ",月初积分重赛,人人有机会。":
      ". Monthly points reset at the start of each month, so everyone gets another chance.",
    "凭什么信": "Why Trust It?",
    "数据真实,是这座雷达的命": "Trustworthy data is the Radar's foundation",
    "成绩会不会有人刷?": "Can someone fake a score?",
    "刷不了。你只上传补丁,": "No. You upload only a patch; ",
    "服务器在干净环境里重新跑测试判分":
      "the server reruns the tests and grades it in a clean environment",
    "——谁自报的结果都不算数,包括我们自己。":
      ". Self-reported results never count—including ours.",
    "我的账号安全吗?": "Is my account safe?",
    "订阅凭据": "Your subscription credentials ",
    "全程留在你自己机器上": "stay on your own machine at all times",
    ",从不经过我们服务器;上传前自动脱敏、扫密钥,带密钥的补丁直接拒收。":
      " and never pass through our servers. Uploads are scrubbed and scanned for secrets; patches containing a secret are rejected.",
    "跑一半挂了额度白烧?": "What if a run stops halfway?",
    "中断可": "Interrupted runs support ",
    "断点续跑": "continue from saved progress",
    ";上传失败自动补传;平台自身故障导致的损失":
      "; failed uploads retry automatically; losses caused by platform failures receive ",
    "照价补积分": "matching point compensation",
    "有人作弊怎么办?": "What happens when someone cheats?",
    "全程轨迹审计(联网搜索直接作废)、异常提交先隔离复核——":
      "Full trajectory audits invalidate prohibited web searches, and suspicious submissions are isolated for review—",
    "误伤有出口,作弊无收益": "false positives can be restored; cheating brings no reward",
    "现在上车": "Join Now",
    "下一格,等你来点亮": "The next cell is waiting for you",
    "进入众测大表 →": "Open the benchmark matrix →",
    "你需要:": "You need: ",
    "Codex 订阅": "a Codex subscription",
    "(Plus 就够) ·": " (Plus is enough) · ",
    "开源客户端": "Open-source client: ",
    "社区群:主站": "Community: scan the QR code on ",
    "扫码,反馈直达开发者": " to reach the developers directly",
    "众测雷达 · powered by codexradar":
      "Crowd Radar · powered by codexradar"
  });

  var PHRASES = [
    ["随着雷达测试志愿者持续增加，总算力显著提升，这是社区共同参与带来的好消息。雷达现已将格子刷新周期从 ",
      "As more volunteers join the Radar, our shared compute capacity keeps growing. Cell refreshes have now been shortened from "],
    ["，超过 12 小时的冷却格子会自动开放。更多格子、更快复测，让雷达数据更实时。",
      ". Cells cooling down for more than 12 hours reopen automatically. More available cells and faster retests keep the Radar current."],
    ["18 小时缩短至 12 小时", "18 hours to 12 hours"],
    ["每格取最新1次有效结果，适合快速发现模型降质或恢复。",
      "Uses the latest valid result in each cell to spot changes quickly."],
    ["每格取最近3次有效结果，适合观察稳定能力和整体趋势。",
      "Uses the three most recent valid results in each cell to show stable performance and broader trends."],
    ["表里每个格子的百分比 = 跑这道题大约占用你所选档位 7 天额度的比例。同一道题对 Plus 可能是 6%，对 20x Pro 只有 0.3%——选对档位，价签才是你的真实成本。",
      "Each cell shows the estimated share of your selected plan's 7-day quota needed for that task. The same task might use 6% on Plus but only 0.3% on 20x Pro—choose your plan for a realistic estimate."],
    ["自动从测得少的格子中推荐一批，数量按你的月榜档位决定——再点一次换一批",
      "Automatically picks under-tested cells; the number picked follows your monthly rank tier. Click again for another set."],
    ["高亮你认领/在跑/刚判完还没重开的格子，再点一次收起筛选、只看这些",
      "Highlights cells you claimed, are running, or recently finished and have not reopened. Click again to show only those cells."],
    ["右上角登录，只用来确认身份、发一个访问令牌。", "Sign in at the top right to verify your identity and receive an access token. "],
    ["不会碰你的 OpenAI 账号", "Your OpenAI account is never accessed"],
    ["——订阅凭据全程留在你自己机器上，从不经过我们服务器。",
      "—your subscription credentials always stay on your machine and never pass through our servers."],
    ["在表格上方的“我的 Codex 订阅类型”选择你的订阅档（Plus / 5x Pro / 20x Pro）——格子里的百分比是",
      "Choose your plan (Plus / 5x Pro / 20x Pro) under “My Codex plan” above the matrix. Each percentage estimates "],
    ["这道题大约占你选中档位 7 天额度的比例",
      "the share of your selected plan's 7-day quota used by that task"],
    ["，同一道题对 Plus 可能是 6%，对 20x Pro 只有 0.3%。选对档位，看到的才是你的真实成本。",
      ". The same task might use 6% on Plus but only 0.3% on 20x Pro. Select the right plan to see your real cost."],
    ["第一次来，建议先让 Codex 安装并检查环境，", "On your first visit, let Codex install and check the environment. "],
    ["这一步不会占用任务格子，也不会启动正式跑题",
      "This does not claim a cell or start a benchmark run"],
    ["。全部检查通过后再选题，认领后的 20 分钟都能真正留给启动任务。",
      ". Choose tasks after every check passes, so the full 20-minute claim window remains available to start them."],
    ["点表里可认领的格子勾选，单次最多 ", "Select available cells in the matrix—up to "],
    ["（按月榜排名解锁），底部按“认领”；懒得挑就点“🚴 一键领题跑分”。20 分钟没开跑自动放回。",
      " at a time, unlocked by monthly rank—then press “Claim” at the bottom. Or use “🚴 Pick & benchmark.” Cells return automatically if a run does not start within 20 minutes."],
    ["粘贴进你的 codex，它会自动配好环境、装好 dradar，把认领的题全部跑完——",
      "Paste the prompt into Codex. It configures the environment, installs dradar, and runs every claimed task—"],
    ["不用你敲一条命令", "no commands to type"],
    ["高级玩法：", "Advanced: "],
    ["直接问 Codex“dradar CLI 能做什么”，或让它“自动认领一批并跑完”“按本机配置并发跑已认领任务”“查看进度并补跑失败项”。不用背命令，描述目标就行。",
      "Ask Codex what the dradar CLI can do, or tell it to claim and run tasks automatically, run claimed tasks side by side on this machine, check progress, or retry failures. Describe the goal—there are no commands to memorize."],
    ["你跑过的格子会点亮，名字也登上雷达天梯。发现问题或想改进？欢迎到 ",
      "The cells you run light up, and your name appears on the leaderboard. Found an issue or have an improvement? Visit the "],
    ["DRadar 开源仓库 ↗", "open-source DRadar repository ↗"],
    [" 提交 Issue 或 PR，一起把雷达做得更好。",
      " to open an issue or pull request and help improve the Radar."],
    ["测试的是什么题库？", "Which benchmark tasks are tested?"],
    ["目前开放的是 ", "The current benchmark uses "],
    [" 真实开源仓库任务，具体数量以雷达表实时显示为准。计划扩展到 DeepSWE 之外的",
      " real-world tasks from open-source repositories; the live matrix shows the current task count. We plan to expand beyond DeepSWE to "],
    ["公版 benchmark", "public benchmarks"],
    ["，以及社区自建的", " and "],
    ["个性化评测题库", "community-built custom evaluations"],
    ["百分比得分和 Codex 雷达的 IQ 分数怎么换算？",
      "How does the percentage score convert to Codex Radar IQ?"],
    ["。这里的通过率百分比乘以 1.5，就是 ", ". Multiply the pass-rate percentage by 1.5 to get the IQ score shown on "],
    ["Codex 雷达", "Codex Radar"],
    ["上的 IQ 分数——满分对齐：", ". The scales align at the endpoints: "],
    [" 分。比如 86% 就是 129 分。", ". For example, 86% becomes an IQ of 129."],
    ["会支持其他 coding agent 和模型吗？", "Will other coding agents and models be supported?"],
    ["会。", "Yes."],
    ["Codex 对话里选择的模型会影响实际跑题模型吗？",
      "Does the model selected in the Codex conversation affect the model that runs the task?"],
    ["不会。每个任务实际使用的模型和推理档位由 DRadar 在认领时明确指定，并在隔离的 Docker 环境中运行；外层 Codex 对话选择什么模型都不会替换任务配置。",
      "No. DRadar fixes the model and reasoning tier for each task when it is claimed, and runs it in an isolated Docker environment. The model selected for the outer Codex conversation never replaces the task configuration."],
    ["“一键领取”只负责认领任务，不会自动开始跑题。领取后仍需复制运行提示词并启动 DRadar；如果任务没有完成，请检查 Docker、任务运行和环境检查状态，而不是更换外层对话模型。",
      "One-click claim only claims tasks; it does not start them automatically. After claiming, copy the run prompt and start DRadar. If a task does not finish, check Docker, task execution, and environment checks instead of changing the outer conversation model."],
    ["会烧我多少额度？", "How much quota will this use?"],
    ["额度是你自己的，dradar ", "The quota is yours. dradar "],
    ["不替你管、也不读取普通志愿者账号的余量",
      "does not manage or read the remaining quota of regular volunteers"],
    ["。Codex 已取消 5 小时滚动限制，现在只有", ". Codex no longer has a rolling 5-hour limit; the only constraint is the "],
    ["7 天额度", "7-day quota"],
    ["一道约束，表里的价签全部按周额度换算——大多数题只占你周额度的百分之几，比 5h 时代宽裕约 6 倍。价签按你的订阅档估算（用上方档位切换），认领时量力而行即可。万一跑到一半撞上额度墙，任务会直接失败、格子自动放回给别人——不会白占着，也不会偷偷替你等额度刷新。价签由历史实测 + 志愿者数据每 15 分钟自动校准；档位总容量由站方超级账号在真实任务前后通过 Codex app-server 测量，累计实耗至少 $50 才会生成候选值，并且必须经过人工确认才会更新。",
      ". Every estimate is expressed as a share of weekly quota. Most tasks use only a few percent—about six times more headroom than the 5-hour era. Estimates follow the plan selected above. If a run hits the quota limit, it fails and the cell returns for others; it never occupies a cell while secretly waiting for a reset. Estimates recalibrate every 15 minutes from historical runs and volunteer data. Total plan capacity is measured with a station-owned super account before and after real tasks; a candidate update requires at least $50 of measured usage and manual approval."],
    ["积分怎么算？", "How are points calculated?"],
    ["统一公式：", "Unified formula: "],
    ["贡献积分 = 基础分或可核验的 API 等价成本 × 基础倍率 × 荒地倍率。所有运行工具、所有题库都使用同一套格子语义；服务端在认领时锁定最终倍率，提交时不会变低。",
      "Contribution points = base score or verified API-equivalent cost × base multiplier × wasteland multiplier. Every runtime and test set uses the same cell semantics. The server locks the final multiplier at claim time, so it cannot decrease at submission."],
    ["基础倍率：", "Base multipliers: "],
    ["Codex 原生 GPT 为 ", "Codex-native GPT: "],
    ["；Codex DeepSeek API 与 DSH 均为 ", "; Codex DeepSeek API and DSH: "],
    ["；Kimi K3 为 ", "; Kimi K3: "],
    ["；ZCode GLM-5.3 为 ", "; ZCode GLM-5.3: "],
    ["；ZCode GLM-5.3 Flash 为 ", "; ZCode GLM-5.3 Flash: "],
    ["；Grok 4.6 与 Antigravity Gemini 3.7 / 3.8 Flash 均为 ",
      "; Grok 4.6 and Antigravity Gemini 3.7 / 3.8 Flash: "],
    ["；CodeBuddy HY4 Preview 为 ", "; CodeBuddy HY4 Preview: "],
    ["。区间内倍率随格子空闲时间逐档提高。",
      ". Within each range, the multiplier rises in steps with cell idle time."],
    ["荒地倍率：", "Wasteland multiplier: "],
    ["精确到“题目 × 运行工具/模型 × 推理档位”的格子。只要从未产生过有效且干净的判分记录，就是荒地，最终倍率额外乘固定 ",
      "Wasteland is tracked for the exact task × runtime/model × effort cell. A cell with no valid clean grade is wasteland and receives a fixed "],
    ["，格子上会直接显示“荒地 1.5×”。第一次有效判分完成后，无论通过还是未通过，都永久退出荒地；异常、无效、待复核记录不算。",
      ", shown directly on the cell as ‘Wasteland 1.5×’. After the first valid grade, pass or fail, the cell permanently leaves wasteland. Anomalous, invalid, and pending-review records do not count."],
    ["荒地满倍率示例：", "Wasteland maximum examples: "],
    ["Codex 原生 GPT 为 ", "Codex-native GPT: "],
    ["；Codex DeepSeek API 与 DSH 为 ", "; Codex DeepSeek API and DSH: "],
    ["；Kimi K3 与 ZCode GLM-5.3 Flash 为 ", "; Kimi K3 and ZCode GLM-5.3 Flash: "],
    ["；ZCode GLM-5.3 与 CodeBuddy HY4 Preview 为 ",
      "; ZCode GLM-5.3 and CodeBuddy HY4 Preview: "],
    ["；Grok 4.6 与 Antigravity Gemini 3.7 / 3.8 Flash 为 ",
      "; Grok 4.6 and Antigravity Gemini 3.7 / 3.8 Flash: "],
    ["。", "."],
    ["成本口径：", "Cost basis: "],
    ["DeepSeek 按每条请求发生时的官网峰价或谷价复算实际成本；Kimi、ZCode、Grok、Antigravity 与 CodeBuddy 按完整请求账本和官网标准 API 单价折算 API 等价成本。输入缓存与 thinking token 均按各服务商账本语义去重，绝不重复计算；CodeBuddy 请求账本不完整时只显示“–”且不结算，其他证据不足的旧口径会明确显示“兜底估价”或不结算，绝不把估价冒充实耗。",
      "DeepSeek actual cost is repriced using the official peak or off-peak rate for each request. Kimi, ZCode, Grok, Antigravity, and CodeBuddy use complete request ledgers and official standard API rates. Cached input and thinking tokens follow each service's ledger semantics and are never counted twice. Incomplete CodeBuddy ledgers display ‘–’ and remain unsettled; other legacy insufficient-evidence paths are labeled as fallback estimates or left unsettled, never presented as verified usage."],
    ["历史已结算积分不追溯重算；目前不设其他临时倍率奖励。",
      "Previously settled points are not recalculated; no other temporary multiplier rewards currently apply."],
    ["DeepSeek 格子不使用订阅额度，而是你自己的 API 余额。北京时间工作日 ",
      "DeepSeek cells use your own API balance, not subscription quota. On weekdays in Beijing time, "],
    [" 为高峰价，其余时间及周六、周日全天为低谷价；页面刷新时自动选择当前价段，也可用按钮手动切换本页价签预览，实际 API 等价费用仍按每次请求发生时的价段分别核算。",
      " are peak periods; all other times and all weekend are off-peak. Refreshing selects the current band automatically, while the buttons can override the preview for the current page. Actual API-equivalent cost is still calculated from each request's tariff band."],
    ["GLM-5.3 与 GLM-5.3 Flash 统一使用", "GLM-5.3 and GLM-5.3 Flash both use "],
    ["当前官方标准 API 单价", "the current official standard API tariff"],
    ["折算 API 等价成本，成本本身不套用 Coding Plan 的峰谷优惠或其他订阅折扣。",
      " for API-equivalent cost. The cost basis itself excludes Coding Plan bands and other subscription discounts."],
    ["。模型卡片只统计请求账本完整的运行，并按当前标准 API 单价重算其历史 token 用量；历史已结算积分保持不变。",
      ". Model cards include only runs with complete request ledgers and reprice their historical token usage at the current standard API tariff; previously settled points remain unchanged."],
    ["连续贡献奖励：", "Daily streak rewards: "],
    ["每天按北京时间完成至少一道有效判分任务得 ",
      "Complete at least one valid graded task per Beijing day to earn "],
    ["5 分", "5 points"],
    ["；连续 3 / 7 / 14 / 30 天再得 ",
      "; reach streaks of 3 / 7 / 14 / 30 days for another "],
    ["5 / 15 / 30 / 60 分", "5 / 15 / 30 / 60 points"],
    ["。同一天多跑不重复领取，断签后开始新一轮。",
      ". Multiple tasks on the same day do not pay twice; a missed day starts a new streak."],
    ["天梯排名怎样影响并发和领题数？", "How does leaderboard rank affect tasks run at once and tasks per claim?"],
    ["每天认领数量", "Daily claims are "],
    ["不限", "unlimited"],
    ["。并发上限和单次领题数按", ". Simultaneous-run and per-claim limits follow your "],
    ["当前月榜", "current monthly rank"],
    ["排名逐步解锁：第 1–5 名为 ", ": ranks 1–5 get "],
    ["，第 6–10 名为 ", "; ranks 6–10 get "],
    ["，第 11–20 名为 ", "; ranks 11–20 get "],
    ["，第 21–50 名为 ", "; ranks 21–50 get "],
    ["，第 51 名以后及尚未上榜的新手为 ", "; rank 51+ and unranked newcomers get "],
    ["。跑完腾出位子就能继续领；排名变化后自动按新档位生效。",
      ". Finish runs to free slots and claim more; rank changes update these limits automatically."],
    ["自行车和蹬踏时间怎么算？", "How are bikes and active time calculated?"],
    ["开始真实跑题就会显示自行车；同时有几路题目正在运行且状态正常，就依次显示几辆自行车和对应路数，约 15 秒刷新。最后一次有效跑题或提交后的 ",
      "A bike appears when a real run starts. Each task running normally adds a bike and contributes to the simultaneous-task count, refreshed about every 15 seconds. Bikes remain visible for "],
    ["内继续显示：前 10 分钟为“正在擦车”，后 10 分钟为“已停车”；期间接着跑会续在同一轮，超过 20 分钟才下掉并在下次重新计轮。",
      " after the last valid run or submission: the first 10 minutes show wrapping up and the next 10 show parked. Continuing within 20 minutes extends the same ride; after that, the bike leaves and the next run starts a new ride. "],
    ["蹬踏时间", "Active time"],
    ["只算实际跑题时间，排队、换题、断线和留榜宽限不计时，并发重叠只算一次。",
      " counts only real task runtime. Queuing, switching tasks, disconnects, and leaderboard grace periods are excluded; overlapping concurrent runs count once."],
    ["可以并行跑题吗？", "Can tasks run concurrently?"],
    ["可以", "Yes"],
    ["——并发上限与当前月榜档位一致：第 1–5 名为 40，第 6–10 名为 20，第 11–20 名为 10，第 21–50 名为 5，第 51 名以后及尚未上榜的新手为 2。新手默认 1 车；Mac mini M4（16GB 内存）最多可同时运行 10 车。如果你有高性能服务器，并且排名已经解锁，可以挑战 40 车。车数是同一账号在所有设备上的总并发上限。",
      "—concurrency follows the current monthly rank tier: 40 for ranks 1–5, 20 for ranks 6–10, 10 for ranks 11–20, 5 for ranks 21–50, and 2 for rank 51+ and unranked newcomers. Newcomers default to one car; a Mac mini M4 with 16GB memory can run up to 10. With a high-performance server and the required rank unlocked, you can challenge 40. The limit is shared by the same account across all devices."],
    ["数据安全吗？", "Is my data safe?"],
    ["每道题都在独立、一次性的 Docker 容器里跑和判分，测完即销毁，跟别的题、别人的环境互不串扰。上传前后两道敏感信息扫描，带密钥的补丁直接拒收；凭据文件从不上传。公开的只有昵称、积分和判分干净的轨迹。",
      "Every task runs and is graded in its own disposable Docker container. Containers are destroyed afterward and isolated from other tasks and users. Sensitive-data scans run before and after upload; patches containing secrets are rejected, and credential files are never uploaded. Only nicknames, points, and clean graded trajectories are public."],
    ["分数怎么保证真实？", "How are scores kept trustworthy?"],
    ["客户端自报的结果一概不算数：每个补丁都在服务端的干净容器里重跑验证器打分。另有任务持有时间差、轨迹审计等多层检测，可疑提交",
      "Client-reported results never count. Every patch is rerun and graded by a verifier in a clean server-side container. Task-hold timing, trajectory audits, and other checks flag suspicious submissions, which are "],
    ["先冻结", "frozen first"],
    ["——积分暂扣、不上榜、不计晋升，人工复核后：误伤的原数奉还（分一分不少），坐实的清零封号。",
      "—points are withheld, leaderboard placement and rank benefits pause, and a human review follows. False positives receive every point back; confirmed abuse results in zeroed points and a ban."],
    ["每一次蹬踏，都让雷达测试得更准。致敬每一位贡献算力的蹬友 🫡",
      "Every run makes the Radar more accurate. Thank you to everyone donating compute 🫡"],
    ["环境安装和初始化可能需要几分钟。建议先让 Codex 完成安装并通过 ",
      "Installation and initialization can take a few minutes. Let Codex finish setup and pass "],
    ["，再回来认领，避免任务因 20 分钟内未启动被自动释放。",
      ", then return to claim tasks so they are not released for failing to start within 20 minutes."],
    ["请先交给 Codex 执行；检查完成后回来点“环境已准备好，继续认领”。",
      "Give this to Codex first. When the checks finish, return and select “Environment ready · Continue.”"],
    ["浏览器没能复制，请允许剪贴板权限后重试。",
      "The browser could not copy this. Allow clipboard access and try again."],
    ["浏览器没能复制提示词，请允许剪贴板权限后重试。",
      "The browser could not copy the prompt. Allow clipboard access and try again."],
    ["请先点右上角“用 GitHub 登录”。登录后再点这里复制安装检查提示词，不需要先认领任务。",
      "Select “Sign in with GitHub” at the top right first. After signing in, copy the setup prompt here before claiming any tasks."],
    ["这个功能要先用 GitHub 登录，才知道哪些格子是你的。",
      "Sign in with GitHub first so Radar can identify your cells."],
    ["暂时无法同步你的格子和头像，请刷新后重试。",
      "Could not sync your cells and avatar. Refresh and try again."],
    ["你手上现在没有在跑/待重开的格子——先去认领几个吧。",
      "You have no running or pending-reopen cells. Claim a few first."],
    ["认领任务需要先用 GitHub 登录确认身份（只用来确认你是谁 + 给你发访问令牌，不会碰你的订阅账号）。现在去 GitHub 登录？",
      "Claiming requires GitHub sign-in to verify your identity and issue an access token. Your subscription account is never accessed. Sign in now?"],
    ["去 GitHub 登录", "Sign in with GitHub"],
    ["这个题目配置已经变了，刷新一下页面再试",
      "This task configuration changed. Refresh the page and try again."],
    ["这格暂时进不去（满员或冷却中）",
      "This cell is temporarily unavailable because it is full or cooling down."],
    ["DeepSeek 运行协议已升级，请强制刷新页面后再认领",
      "The DeepSeek runtime protocol was upgraded. Hard-refresh the page before claiming again."],
    ["请先用 GitHub 登录", "Please sign in with GitHub first"],
    ["登录已失效，请重新用 GitHub 登录", "Your session expired. Sign in with GitHub again."],
    ["这个账号已被封禁", "This account has been suspended"],
    ["这个站还没开启 GitHub 登录", "GitHub sign-in is not enabled on this site"],
    ["这个 GitHub 账号已经绑定过另一个账号了",
      "This GitHub account is already linked to another account"],
    ["生成账号昵称时出了点问题，请重试", "Could not generate an account nickname. Try again."],
    ["昵称太长：最多 20 个英文字符或 10 个中文字符",
      "Nickname is too long: use at most 20 Latin characters or 10 Chinese characters"],
    ["GitHub 没有返回可用的身份信息，请重试",
      "GitHub did not return a usable identity. Try again."],
    ["GitHub 授权码无效或已过期，请重新登录",
      "The GitHub authorization code is invalid or expired. Sign in again."],
    ["GitHub 授权失败，请重试", "GitHub authorization failed. Try again."],
    ["连接 GitHub 时出了点问题，请重试", "Could not connect to GitHub. Try again."],
    ["你已达到当前月榜档位的并发上限——先把手上的跑完或放回（没开跑的 20 分钟后自动放回），再认领新的",
      "You have reached your monthly-rank concurrency limit. Finish or release current tasks before claiming more; tasks that have not started return automatically after 20 minutes."],
    ["认领需要先用 GitHub 登录", "Sign in with GitHub before claiming"],
    ["未知错误", "Unknown error"],
    ["操作没成功，请刷新后重试", "The action failed. Refresh and try again."],
    ["上一批已到硬截止，但仍有任务正在运行或可以恢复；请先完成、恢复或放回上一批，再认领新题",
      "The previous claim reached its hard deadline while work is still running or resumable. Finish, resume, or release it before claiming new tasks."],
    ["GitHub 登录暂不可用：", "GitHub sign-in is temporarily unavailable: "],
    ["GitHub 登录校验失败，请重新登录", "GitHub sign-in verification failed. Sign in again."],
    ["GitHub 登录失败：", "GitHub sign-in failed: "],
    ["设置失败，稍后再试", "Could not save this setting. Try again later."],
    ["改名失败，稍后再试", "Could not change the nickname. Try again later."],
    ["改名失败：", "Could not change the nickname: "],
    ["新昵称（最多 20 个英文字符或 10 个中文字符，可混合）",
      "New nickname (up to 20 Latin characters or 10 Chinese characters; mixed scripts are supported)"],
    ["中文/字母/数字/- _ . 都可以", "Chinese characters, letters, numbers, -, _, and . are allowed"],
    ["⚠ 请勿在昵称中打广告或填写推广信息", "⚠ Do not use nicknames for ads or promotions"],
    ["一次最多选 ", "You can select at most "],
    [" 个格子——先把这些认领跑掉，跑完再来选。",
      " cells at a time. Claim and run these, then select more."],
    ["已开始运行的任务不会被释放。", "Tasks that have already started will not be released."],
    ["这个功能要先用 GitHub 登录，且只会释放你自己账号的任务。",
      "Sign in with GitHub first. This only releases tasks held by your own account."],
    ["释放失败：", "Release failed: "],
    ["你手上尚未开始运行的上一批会自动换成这一批；",
      "Your previous unstarted set of tasks will be replaced by this one; "],
    ["你已达到并发上限。", "You have reached your concurrency limit."],
    ["是否放回之前尚未开跑的任务，改领这 ",
      "Release previous tasks that have not started and claim these "],
    [" 个新格子？", " new cells?"],
    ["已经开跑的任务不会被释放；如果新格子不能全部认领，旧任务也不会改变。",
      "Tasks that have started will not be released. If all new cells cannot be claimed, your old tasks will remain unchanged."],
    ["放回旧题并认领", "Release old tasks and claim"],
    ["整批认领", "This claim"],
    [" 个未开跑的旧任务。", " old tasks that had not started."],
    [" 个任务正在运行，已开跑任务不会自动释放；请先跑完一些再认领。",
      " running tasks are protected from automatic release. Finish some before claiming more."],
    ["网络请求失败，请稍后再试", "Network request failed. Try again later."],
    ["服务端推荐了最缺人的替代格子，一键补上？",
      "The server found under-tested replacement cells. Claim them with one click?"],
    ["这些没领到（原因见每条）：", "These cells could not be claimed (see each reason):"],
    ["复制后粘贴到你正在使用的编程助手中，由它检查环境并开始运行",
      "Copy and paste this into the coding assistant you're using. It will check the environment and start "],
    ["这些 DSH Minimal 题目，", "these DSH Minimal tasks. "],
    ["这些 Kimi Code 题目，", "these Kimi Code tasks. "],
    ["这些 ZCode 题目，", "these ZCode tasks. "],
    ["这些 Grok 题目，", "these Grok tasks. "],
    ["这些题，", "these tasks. "],
    ["20 分钟内没检测到真正开始跑，会自动放回待认领。",
      "If no real run starts within 20 minutes, the cells return automatically."],
    ["复制运行提示词", "Copy run prompt"],
    ["运行提示词已复制 ✓", "Run prompt copied ✓"],
    ["跑完后继续领取同一种题（可选）", "Continue with matching tasks after these finish (optional)"],
    ["默认关闭，只运行已领取题目。开启后会等当前题目全部提交成功，再继续领取相同运行工具、模型和档位的题；总题数包含当前题目，并由服务端在多台设备间共享上限。",
      "Off by default: run only the tasks already claimed. When enabled, matching tasks continue only after all current tasks submit successfully, using the same runtime, model, and level. The total includes current tasks and is shared across devices."],
    ["同时运行数量", "Tasks to run at the same time"],
    ["这次总题数上限", "Maximum tasks for this run"],
    ["请输入有效整数：同时运行数量为 1–40；总题数不得小于已领取题数或同时运行数量。",
      "Enter valid integers: simultaneous tasks must be 1–40, and the total cannot be lower than the claimed-task or simultaneous-task count."],
    ["暂时没拿到可选的推荐格子，稍等片刻再试（表格可能刚更新）。",
      "No recommended cells are available right now. Wait a moment and try again; the matrix may have just refreshed."],
    ["推荐服务暂时不可用：", "Recommendations are temporarily unavailable: "],
    ["你已经开始运行的任务占满了当前月榜档位的名额；请先跑完一些，再领取新推荐。未开始的任务不会占用这次换批名额。",
      "Running tasks already fill your monthly-rank simultaneous-run slots. Finish some before requesting new recommendations. Tasks that have not started do not count against this replacement claim."],
    ["当前还没有实测数据", "No measured data yet"],
    ["最近1小时全站已提交任务的真实消耗总额，仅计 Pier 实报或按实际 token 计算的费用",
      "Actual network-wide cost of tasks submitted in the past hour, using Pier-reported cost or cost calculated from real token usage"],
    ["全体志愿者累计烧掉的额度，按当前价签估算成美元",
      "Cumulative quota used by all volunteers, estimated in USD at current prices"],
    ["全体志愿者累计贡献的模型词元", "Cumulative model tokens contributed by all volunteers"],
    ["开启：按照题目综合区分度从大到小排序；关闭：按任务 ID 字母排序",
      "On: sort tasks by overall discrimination. Off: sort alphabetically by task ID."],
    ["区分度数据暂不可用，当前按任务 ID 字母排序",
      "Discrimination data is unavailable; tasks are sorted alphabetically by ID."],
    ["取消倍率排序，恢复原来的题目顺序", "Clear multiplier sorting and restore the original task order"],
    ["这个站的大表还没开启（", "The benchmark matrix is not available on this site ("],
    ["）——参与方式见下方，数据稍后自动重试。",
      "). See participation instructions below; the data will retry automatically."],
    ["众测雷达 · powered by ", "Crowd Radar · powered by "],
    [" · 数据每分钟刷新 ·", " · Data refreshes every minute ·"],
    [" · 基线更新于 ", " · Baseline updated "],
    [" · 返回主站", " · Back to main site"]
  ];

  var PATTERNS = [
    [/^数据不足：已覆盖 (\d+)\/(\d+) 道（([\d.]+)%），低于 60%$/,
      "Insufficient data: $1/$2 tasks covered ($3), below 60%"],
    [/^最近1小时全站已提交任务的缓存折扣后 API 等价费用；tokens 为 input \+ output，cached input 只计一次；token 证据已计价 (\d+)\/(\d+) 次提交(?:；输入缓存命中率 ([\d.]+)%)?(?:；另有 (\d+) 次仅有认领估价，未计入美元主数字)?(?:；另有 (\d+) 次暂无可用价格)?$/,
      function (m, priced, submitted, cacheRatio, estimated, unpriced) {
        var result = "Cache-adjusted API-equivalent cost for network-wide " +
          "submissions in the past hour; tokens = input + output, with cached " +
          "input counted once; token evidence priced for " + priced + "/" +
          submitted + " submissions";
        if (cacheRatio != null) result += "; input cache hit rate " + cacheRatio + "%";
        if (estimated != null) result += "; " + estimated +
          (estimated === "1" ? " claim-only estimate excluded" :
            " claim-only estimates excluded") + " from the dollar total";
        if (unpriced != null) result += "; " + unpriced +
          (unpriced === "1" ? " submission currently unpriced" :
            " submissions currently unpriced");
        return result;
      }],
    [/^总蹬速 缓存折扣后 API 等价，(.+)，(.+)$/,
      "Network burn rate · cache-adjusted API equivalent: $1, $2"],
    [/^运行范围：(.+) \/ (.+) \/ (.+)；停止或失败后不再继续领取，已领取任务不会被自动放回。$/,
      "Run scope: $1 / $2 / $3; stopping or failing prevents further matching claims, while already-claimed tasks are not returned automatically."],
    [/^已释放当前账号的 (\d+) 个未开跑任务。$/,
      "Released $1 tasks not yet started for this account."],
    [/^(\d+) 个任务此前已经释放。请刷新页面查看最新状态。$/,
      "$1 tasks had already been released. Refresh the page to see the latest status."],
    [/^跳过 (\d+) 个任务。$/, "Skipped $1 tasks."],
    [/^保留 (\d+) 个正在运行的任务；它们会继续运行。$/,
      "Kept $1 running tasks; they will continue running."],
    [/^总榜 TOP (\d+)%$/, "All-time Top $1%"],
    [/^(\d+)月榜 TOP (\d+)%$/, "Month $1 · Top $2%"],
    [/^已判 (\d+) 次 · 距晋级还差 (\d+) 次$/, "$1 graded · $2 more to advance"],
    [/^已判 (\d+) 次 · 已达最高段位$/, "$1 graded · Highest rank reached"],
    [/^永久段位 · 累计有效判分 (\d+) 次 · 距离 (.+) 还差 (\d+) 次$/,
      "Permanent rank · $1 valid grades · $3 more to $2"],
    [/^永久段位 · 累计有效判分 (\d+) 次 · 已达最高段位$/,
      "Permanent rank · $1 valid grades · Highest rank reached"],
    [/^累计有效任务 TOP (\d+)%$/, "Valid tasks · Top $1%"],
    [/^单题 tokens TOP (\d+)%$/, "Tokens per task · Top $1%"],
    [/^单题积分 TOP (\d+)%$/, "Points per task · Top $1%"],
    [/^本月有效任务 TOP (\d+)%$/, "Monthly valid tasks · Top $1%"],
    [/^DeepSeek API 实测 TOP (\d+)%$/, "DeepSeek API runs · Top $1%"],
    [/^当前 (\d+) 路并发$/, "$1 tasks at the same time"],
    [/^本轮持续 (.+) 小时$/, "Current ride · $1 hours"],
    [/^本轮蹬速 (\d+) 积分\/时$/, "Current speed · $1 points/hour"],
    [/^🔥 连续 (\d+) 天$/, "🔥 $1-day streak"],
    [/^🔥 连续待点亮$/, "🔥 Streak waiting"],
    [/^今日 \+([\d.]+) 积分$/, "Today +$1 points"],
    [/^今日完成 1 题 \+([\d.]+) 积分$/, "Complete 1 task today · +$1 points"],
    [/^今日有效贡献已点亮 · 当前连续 (\d+) 天 · 最长连续 (\d+) 天 · 本月连续贡献奖励 \+([\d.]+) 积分(?: · 再坚持 (\d+) 天额外 \+([\d.]+) 积分)?$/,
      function (m, current, longest, month, remaining, bonus) {
        return "Today's contribution is lit · Current streak " + current +
          " days · Longest " + longest + " days · Monthly streak rewards +" +
          month + " points" + (remaining
            ? " · " + remaining + " more days for +" + bonus + " points" : "");
      }],
    [/^今日连续贡献待点亮 · 当前连续 (\d+) 天 · 最长连续 (\d+) 天 · 本月连续贡献奖励 \+([\d.]+) 积分(?: · 再坚持 (\d+) 天额外 \+([\d.]+) 积分)?$/,
      function (m, current, longest, month, remaining, bonus) {
        return "Today's streak is waiting · Current streak " + current +
          " days · Longest " + longest + " days · Monthly streak rewards +" +
          month + " points" + (remaining
            ? " · " + remaining + " more days for +" + bonus + " points" : "");
      }],
    [/^实付 \$(.+)$/, "paid $$$1"],
    [/^另 (\d+) 次 API 费用待核算$/, "$1 API costs pending"],
    [/^已选 (\d+)\/(\d+) 个(?: · )?(.*)$/i, function (m, selected, max, rest) {
      return "Selected " + selected + "/" + max + (rest ? " · " + translateText(rest) : "");
    }],
    [/^新格 ×(.+) — DSH 单独领取$/, "New cells ×$1 — DSH separate claim"],
    [/^认领这 (\d+) 个$/, "Claim these $1"],
    [/^认领这 (\d+) 个 DSH 格子$/, "Claim these $1 DSH cells"],
    [/^认领这 (\d+) 个格子？$/, "Claim these $1 cells?"],
    [/^提醒：你选择的这些格子最近一次结果(全部通过|全部未通过)。集中重测同一种结果，可能让 IQ 在短期内单向变化；你仍然可以继续认领。$/,
      function (_match, verdict) {
        return "Note: the latest results for all selected cells " +
          (verdict === "全部通过" ? "passed" : "failed") +
          ". Re-testing only one result type may move IQ in one direction temporarily; " +
          "you can still continue with the claim.";
      }],
    [/^已认领 (\d+) 个格子$/, "Claimed $1 cells"],
    [/^已自动放回 (\d+) 个未开跑的旧任务。$/,
      "Automatically released $1 old tasks that had not started."],
    [/^已有 (\d+) 个任务正在运行，已开跑任务不会自动释放；请先跑完一些再认领。$/,
      "$1 running tasks are protected from automatic release. Finish some before claiming more."],
    [/^换成这 (\d+) 个认领$/, "Claim these $1 replacements"],
    [/^请在 (\d+) 分钟内执行，否则任务将会被释放。$/,
      "Start within $1 minutes or the tasks will be released."],
    [/^重选中…$/, "Picking…"],
    [/^预计 ~(\d+) 分钟$/, "Est. ~$1 min"],
    [/^，约占你 (.+) 的 7 天额度 (.+)$/, " · About $2 of your $1 7-day quota"],
    [/^跑一次 ≈ (.+) 周额度 · 约 (.+) 分钟(?:（估价）)?$/,
      "One run ≈ $1 of weekly quota · about $2 min"],
    [/^使用你自己的 DeepSeek API key 按量计费，不占 ChatGPT 周额度(?: · 约 (.+) 分钟)?$/,
      function (_match, minutes) {
        return "Uses your own metered DeepSeek API key; does not consume ChatGPT weekly quota" +
          (minutes ? " · about " + minutes + " min" : "");
      }],
    [/^当前价段：北京时间高峰价（09:00–12:00、14:00–18:00）$/,
      "Current band: Beijing weekday peak (09:00–12:00, 14:00–18:00)"],
    [/^当前价段：北京时间非高峰价（高峰价 50%）$/,
      "Current band: Beijing off-peak (50% of peak)"],
    [/^官网单价 \/ 100万 token：未命中缓存 \$(.+) · 命中缓存 \$(.+) · 输出 \$(.+)$/,
      "Official rates / 1M tokens: cache miss $$$1 · cache hit $$$2 · output $$$3"],
    [/^同题预计：非高峰 (.+) · 高峰 (.+)$/,
      "Same-cell estimate: off-peak $1 · peak $2"],
    [/^预计 API 消耗 ≈ (.+)（服务端认领价签）$/,
      "Estimated API cost ≈ $1 (server claim price)"],
    [/^预计积分 ≈ (.+)（(.+) 基础分 × (.+) 倍率）$/,
      "Estimated points ≈ $1 ($2 base × $3 multiplier)"],
    [/^荒地：首次有效判分前享受固定 1\.5× 加成$/,
      "Wasteland: fixed 1.5× bonus until the first valid grade"],
    [/^倍率：基础 (.+)× × 荒地 (.+)× = 最终 (.+)×$/,
      "Multiplier: $1× base × $2× wasteland = $3× final"],
    [/^最近一次 API 消耗 (.+)（逐请求 token × 当时 DeepSeek 官网价段）$/,
      "Latest API cost $1 (per-request tokens × the official band at that time)"],
    [/^预计 API 消耗 ≈ (.+)（认领价签：同题同档 Flash × 3）$/,
      "Estimated API cost ≈ $1 (claim price: 3× the matching Flash cell)"],
    [/^预计 API 消耗 ≈ (.+)（认领价签估值）$/,
      "Estimated API cost ≈ $1 (claim-price estimate)"],
    [/^最近一次 API 消耗待核算$/, "Latest API cost is pending"],
    [/^最近一次判分实得 (.+) 积分$/, "Latest graded run earned $1 points"],
    [/^积分计算：(.+) API 等价实际成本 × (.+) 锁定倍率 = (.+)$/,
      "Points: $1 API-equivalent actual cost × $2 locked multiplier = $3"],
    [/^积分计算：(.+) API 等价成本 × (.+) 锁定倍率 = (.+)$/,
      "Points: $1 API-equivalent cost × $2 locked multiplier = $3"],
    [/^积分计算：(.+) 兜底估价 × (.+) 锁定倍率 = (.+)$/,
      "Points: $1 fallback estimate × $2 locked multiplier = $3"],
    [/^积分计算：(.+) 兜底估价 × (.+) 动态倍率 = (.+)$/,
      "Points: $1 fallback estimate × $2 dynamic multiplier = $3"],
    [/^预计积分 ≈ (.+)（(.+) API 等价预估成本 × (.+) 动态倍率）$/,
      "Estimated points ≈ $1 ($2 API-equivalent estimated cost × $3 dynamic multiplier)"],
    [/^预计积分 ≈ (.+)（(.+) API 等价预估成本 × (.+) 最终倍率）$/,
      "Estimated points ≈ $1 ($2 API-equivalent estimated cost × $3 final multiplier)"],
    [/^预计积分 ≈ (.+)（(.+) 基础分 × (.+) 最终倍率）$/,
      "Estimated points ≈ $1 ($2 base × $3 final multiplier)"],
    [/^积分计算：(.+) 基础分 × (.+) 锁定倍率 = (.+)$/,
      "Points: $1 base × $2 locked multiplier = $3"],
    [/^累计通过 (\d+)\/(\d+) 次$/, "$1/$2 passed overall"],
    [
      /^冷却中，(.+)后重开$/,
      function (_match, duration) {
        return (
          "Cooling down · Reopens " +
          (/内$/.test(duration)
            ? translateText(duration)
            : "in " + translateText(duration))
        );
      },
    ],
    [/^点击选中(?:（另有 (\d+) 人在测）)?$/, function (m, others) {
      return others ? "Select this cell · " + others + " others are running it" : "Select this cell";
    }],
    [/^(\d+) 份提交判分中$/, "$1 submissions are being graded"],
    [/^(\d+) 在跑$/, "$1 running"],
    [/^(\d+)分钟$/, "$1 min"],
    [/^<1分钟$/, "<1 min"],
    [/^(\d+)小时$/, "$1 hr"],
    [/^(\d+)小时(\d+)分钟$/, "$1h $2m"],
    [/^(\d+)时(\d+)分钟$/, "$1h $2m"],
    [/^(\d+)时$/, "$1h"],
    [/^(\d+)分钟内$/, "within $1 min"],
    [/^(\d+)小时后重开$/, "Reopens in $1 hr"],
    [/^(\d+)分钟后重开$/, "Reopens in $1 min"],
    [/^1分钟内后重开$/, "Reopens within 1 min"],
    [/^\$(.+)\/小时$/, "$$$1/hr"],
    [/^实耗 \$(.+)$/, "actual $$$1"],
    [/^估价 \$(.+)$/, "estimated $$$1"],
    [/^兜底估价 \$(.+)$/, "fallback estimate $$$1"],
    [/^API 等价 \$(.+)$/, "API-equivalent $$$1"],
    [/^(\d+)车正在冲线$/, "$1 tasks finishing"],
    [/^(\d+)车正在蹬$/, "$1 tasks running"],
    [/^1车独行$/, "1 task running"],
    [/^(\d+)车并行$/, "$1 tasks running together"],
    [/^已交(\d+)题$/, "$1 submitted"],
    [/^已判(\d+)题$/, "$1 graded"],
    [/^\+([\d.]+)积分$/, "+$1 points"],
    [/^仅看推荐 (\d+) 格$/, "$1 recommended cells only"],
    [/^最近 (\d+) 次$/, "Latest $1 runs"],
    [/^最近 (\d+) 小时$/, "Past $1 hours"],
    [/^最近 (\d+) 小时 IQ 趋势，悬停查看时间和分数$/,
      "IQ trend over the past $1 hours · Hover for time and score"],
    [/^最近 (\d+) 小时多档位 IQ 对比，悬停查看时间和分数$/,
      "Multi-tier IQ comparison over the past $1 hours · Hover for time and score"],
    [/^(\d+) 分钟前$/, "$1 min ago"],
    [/^(\d+) 小时前$/, "$1 hr ago"],
    [/^(\d+) 天前$/, "$1 days ago"],
    [/^(\d+) 分钟$/, "$1 min"],
    [/^(F1 [\d.]+%) · (\d+) 次$/, "$1 · $2 runs"],
    [/^(\d+) 次$/, "$1 runs"],
    [/^(\d+) 次费用、(\d+) 次耗时$/, "$1 cost samples · $2 runtime samples"],
    [/^(\d+) 次实报$/, "$1 reported samples"],
    [/^(\d+) 次按实际 token 用量计算$/, "$1 calculated from actual token usage"],
    [/^(\d+) 次历史不完整用量已排除$/, "$1 incomplete historical samples excluded"],
    [/^(\d+) 次缺原始用量$/, "$1 missing raw usage"],
    [/^(\d+) 人$/, "$1 volunteers"],
    [/^(\d+)月(\d+)日 00:00（北京时间）结算$/, function (m, month, day) {
      var monthName = new Intl.DateTimeFormat("en-US", {month: "short"})
        .format(new Date(2000, Number(month) - 1, 1));
      return "Settles " + monthName + " " + day + " at 00:00 Beijing time";
    }],
    [/^(\d+) 题$/, "$1 tasks"],
    [/^(\d+)题 × (\d+)档$/, "$1 tasks × $2 tiers"],
    [/^(\d+)档$/, "$1 tiers"],
    [/^([\d.]+) 亿$/, function (m, value) {
      return (Number(value) / 10).toLocaleString("en-US", {
        maximumFractionDigits: 1
      }) + "B";
    }],
    [/^(\d+) 路正在蹬，(\d+) 路正在冲线$/, "$1 running · $2 finishing"],
    [/^1 路正在蹬$/, "1 task running"],
    [/^1 路正在冲线$/, "1 task finishing"],
    [/^(\d+) 路正在蹬$/, "$1 tasks running"],
    [/^(\d+) 路正在冲线$/, "$1 tasks finishing"],
    [/^(\d+) 路并发正在蹬$/, "$1 tasks running at the same time"],
    [/^24小时上升(\d+)名$/, "Up $1 places in 24 hours"],
    [/^24小时下降(\d+)名$/, "Down $1 places in 24 hours"],
    [/^展开全部 (\d+) 名（还有 (\d+) 位）$/, "Show all $1 contributors ($2 more)"],
    [/^收起，只看前 (\d+) 名及在线蹬友$/, "Collapse to the top $1 and active riders"],
    [/^每月 Top 10 · 从 (\d{4}-\d{2}) 开始记录$/,
      "Monthly Top 10 · Recorded since $1"],
    [/^按 (.+) (.+) 的倍率从高到低排序$/, "Sort by $1 $2 multiplier, highest first"],
    [/^最近跑过这格，(通过 ✓|未通过 ✗)$/, function (m, result) {
      return "Most recent run " + (result.indexOf("通过") === 0 ? "passed ✓" : "failed ✗");
    }],
    [/^(\d+)月(\d+)日 0点（北京时间）结算，距结算 (\d+) 天 · 月初积分重赛，总榜永久累计$/,
      "Settles Jul $2 at 00:00 Beijing time · $3 days remaining · Monthly points reset; all-time points remain"],
    [/^🏆 月榜冠亚季军得独家定制3D打印雷达奖杯和神秘小礼物一份 · (.*)$/,
      "🏆 Monthly top 3 win custom 3D-printed Radar trophies and a mystery gift · $1"],
    [/^· (\d+)月(\d+)日 0点（北京时间）结算，距结算 (\d+) 天 · 月初积分重赛，总榜永久累计$/,
      function (m, month, day, days) {
        var monthName = new Intl.DateTimeFormat("en-US", {month: "short"})
          .format(new Date(2000, Number(month) - 1, 1));
        return "· Settles " + monthName + " " + day +
          " at 00:00 Beijing time · " + days +
          " days remaining · Monthly points reset; all-time points remain";
      }],
    [/^([\d.]+)积分$/, "$1 points"]
  ];

  var TOKENS = [
    ["实时监控（每格最新1次）", "Live (latest valid result per cell)"],
    ["近期表现（每格最近3次）", "Recent (latest 3 valid results per cell)"],
    ["近期表现（每格最近3次，全部任务等权）",
      "Recent performance (latest 3 per cell, all tasks weighted equally)"],
    ["最新有效格子", "latest valid cells"],
    ["最近3次实测", "latest 3 measured runs"],
    ["点击加入", "Click to add"],
    ["的对比曲线，再点一次取消", " to the comparison chart; click again to remove"],
    ["当前 IQ", "current IQ"],
    ["当前还没有实测数据", "no measured data yet"],
    ["真实平均耗时", "actual average runtime"],
    ["实际用量均价", "average actual usage cost"],
    ["完整会话", "complete sessions · "],
    ["暂无有效运行耗时", "no valid runtime samples"],
    ["暂无完整会话运行费用", "no complete-session cost samples"],
    ["暂无有效运行费用", "no valid cost samples"],
    ["次有效运行", " valid runs"],
    ["次按实际 token 用量计算", " calculated from actual token usage"],
    ["次历史不完整用量已排除", " incomplete historical usage samples excluded"],
    ["次缺原始用量", " missing raw-usage samples"],
    ["次实报", " reported samples"],
    ["次费用", " cost samples"],
    ["次耗时", " runtime samples"],
    ["综合成本指数", "combined cost index"],
    ["综合成本 × 智力", "Cost × IQ"],
    ["综合成本 × IQ", "Cost × IQ"],
    ["时间成本 × 智力", "Time × IQ"],
    ["时间成本 × IQ", "Time × IQ"],
    ["费用成本 × 智力", "$ Cost × IQ"],
    ["费用成本 × IQ", "$ Cost × IQ"],
    ["选择图表中显示的模型", "Choose models shown in the charts"],
    ["显示 ", "Show "],
    ["模型多选", "Models"],
    ["全选", "Select all"],
    ["全不选", "Select none"],
    ["未选择模型", "No models selected"],
    ["请选择至少一个模型查看图表", "Select at least one model to view the charts"],
    ["已选择全部 ", "Selected all "],
    ["已选择 ", "Selected "],
    [" 个模型", " models"],
    ["断轴", "Break"],
    ["越靠左上越高效", "Best ↖"],
    ["🧑‍💻　日常开发", "🧑‍💻　Daily Development"],
    ["⛏️　难题攻坚", "⛏️　Hard Problems"],
    ["🔁　后台自动化", "🔁　Background Automation"],
    ["🦞　跑龙虾类任务", "🦞　Long-running Agent Tasks"],
    ["智力", "Intelligence"],
    ["共 ", ""],
    ["最近 ", "Past "],
    ["综合成本", "combined cost"],
    ["平均耗时", "average runtime"],
    ["平均价格", "average cost"],
    ["全屏查看", "View full screen: "],
    ["个模型档位", " model tiers"],
    ["横轴从有效样本最低值开始", "the x-axis starts at the lowest valid sample"],
    ["使用对数刻度展开低值并压缩高值", "a log scale expands low values and compresses high values"],
    ["低价离群区间使用断轴压缩", "a broken axis compresses the low-cost outlier range"],
    ["按“2.5 倍价格可换 1.35 倍速度”的权重折算",
      "weighted so 2.5× cost is equivalent to 1.35× speed"],
    ["图中最高综合成本归一为 100", "the highest combined cost is normalized to 100"],
    ["模型 / 强度 / 阶梯 / 档内临界", "model / effort / monotonicity / within-tier threshold"],
    ["（模型 ", " (model "],
    ["综合区分度", "overall discrimination"],
    ["档内临界", "within-tier threshold"],
    ["强度", "effort"],
    ["阶梯", "monotonicity"],
    ["样本", "samples"],
    ["推荐规则", "Selection rule"],
    ["不再分档", "without IQ bands"],
    ["在同一候选池中分别以平均耗时和费用与耗时综合成本为基准",
      "use one candidate pool and evaluate average runtime and combined time-and-cost"],
    ["对应指标溢价", "premium on that metric"],
    ["去重后取 2 个", "deduplicate and choose two tiers"],
    ["更高 IQ 至少领先 1.5 IQ", "a higher-IQ tier must lead by at least 1.5 IQ"],
    ["且每领先 1 IQ 可接受最多", "and each additional IQ allows at most"],
    ["且每领先 1 IQ 可接受最多 2% 耗时溢价",
      "and each additional IQ allows at most 2% more runtime"],
    ["且每领先 1 IQ 可接受最多 2% 费用溢价",
      "and each additional IQ allows at most 2% more cost"],
    ["且每领先 1 IQ 可接受最多 5% 费用和 2% 耗时溢价",
      "and each additional IQ allows at most 5% more cost and 2% more runtime"],
    ["以平均耗时最短者为基准", "start from the fastest average runtime"],
    ["以平均费用最低者为基准", "start from the lowest average cost"],
    ["按同一速度优先规则取 1 个", "choose one with the same speed-first rule"],
    ["不设上限", "with no upper IQ limit"],
    ["先取综合成本最低者", "start from the lowest combined-cost option"],
    ["符合时优先 IQ 最高", "when eligible, prefer the highest IQ"],
    ["依次取 2 个", "repeat the rule to choose two tiers"],
    ["成本优先", "Cost first"],
    ["速度位", "Speed pick"],
    ["均衡位", "Balanced pick"],
    ["原始 IQ", "raw IQ"],
    ["性价比位", "Value pick"],
    ["聪明位", "High-IQ pick"],
    ["整数 IQ", "rounded IQ"],
    ["按费用与耗时综合成本最低取 1 个", "choose the lowest combined time-and-cost option"],
    ["按综合成本最低取 1 个", "choose the lowest combined-cost option"],
    ["所有有实测数据的档位中，按 IQ 从高到低取 2 个",
      "choose the two highest-IQ tiers with measured data"],
    ["IQ 相同时按模型顺序与综合成本排序",
      "break IQ ties by model order and combined cost"],
    ["按费用与耗时综合成本最低取 2 个", "choose the two lowest combined time-and-cost tiers"],
    ["自身历史", "Own history"],
    ["最近三次平滑口径", "latest-three smoothed window · "],
    ["下降 ", "down "],
    ["回升 ", "up "],
    ["较24小时高点", "from 24h high"],
    ["较48小时高点", "from 48h high"],
    ["总览纵轴波动已放大 2 倍", "overview y-axis movement is magnified 2×"],
    ["IQ 分数走势", "IQ trend"],
    ["同色虚线", "matching dashed line"],
    ["平均 IQ", "average IQ"],
    ["统一纵轴跨度", "shared y-axis span"],
    ["历史点还不足", "does not yet have"],
    ["降智曲线", "Performance trend"],
    ["这里将显示每小时 IQ 分数走势", "hourly IQ scores will appear here"],
    ["IQ 分 = 通过率 ×150", "IQ = pass rate × 150"],
    ["当前曲线只是示意图，不代表任何实测结果", "this preview is not measured data"],
    ["每格测得越多、数据攒够后会自动换成真实曲线",
      "it switches to a real chart automatically as enough cell data accumulates"],
    ["所选档位的历史点还不足", "the selected tiers do not yet have"],
    ["暂时无法绘制对比曲线", "not enough data to draw a comparison chart"],
    ["数据不足未绘制", "not drawn due to insufficient data"],
    ["所有曲线共用纵轴", "all lines share the y-axis"],
    ["所选档位合并平均 IQ", "pooled average IQ across selected tiers"],
    ["跑一次 ≈", "One run ≈"],
    ["周额度", "of weekly quota"],
    ["最近一次判分实得", "Latest graded run earned"],
    ["累计通过", "Passed overall"],
    ["点击选中", "Select this cell"],
    ["冷却中", "Cooling down"],
    ["后重开", " · Reopens in"],
    ["已认领，还没开跑", "Claimed · Not started"],
    ["已认领，待开跑", "Claimed · Waiting to start"],
    ["正在解题", "Running"],
    ["份提交判分中", " submissions being graded"],
    ["编程语言", "Programming language"],
    ["最近跑过这格", "Most recent run"],
    ["未通过", "failed"],
    ["通过", "passed"],
    ["实耗 $", "actual $"],
    ["估价 $", "estimated $"],
    ["API 等价 $", "API-equivalent $"],
    ["月榜冠亚季军得", "Monthly top 3 win "],
    ["北京时间", "Beijing time"],
    ["距结算", "remaining"],
    ["月初积分重赛", "monthly points reset"],
    ["总榜永久累计", "all-time points remain"],
    ["正在擦车", "Wrapping up"],
    ["路正在蹬", " tasks running"],
    ["路正在冲线", " tasks finishing"],
    ["路并发正在蹬", " tasks running at the same time"],
    ["本月提交", "Monthly submissions"],
    ["总提交", "Total submissions"],
    ["分钟", " min"],
    ["小时", " hr"],
    ["积分", " points"]
  ];

  var SORTED_PHRASES = PHRASES.map(function (pair) {
    return [pair[0].trim(), pair[1]];
  }).sort(function (a, b) { return b[0].length - a[0].length; });
  var SORTED_TOKENS = TOKENS.slice().sort(function (a, b) {
    return b[0].length - a[0].length;
  });

  function hasHan(value) {
    return /[\u3400-\u9fff\uf900-\ufaff，。；：]/.test(String(value));
  }

  function translateCore(value) {
    if (Object.prototype.hasOwnProperty.call(EXACT, value)) return EXACT[value];
    var result = value;
    for (var i = 0; i < PATTERNS.length; i += 1) {
      var pattern = PATTERNS[i][0], replacement = PATTERNS[i][1];
      if (pattern.test(result)) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, replacement);
        break;
      }
      pattern.lastIndex = 0;
    }
    for (var j = 0; j < SORTED_PHRASES.length; j += 1) {
      if (result.indexOf(SORTED_PHRASES[j][0]) !== -1) {
        result = result.split(SORTED_PHRASES[j][0]).join(SORTED_PHRASES[j][1]);
      }
    }
    for (var k = 0; k < SORTED_TOKENS.length; k += 1) {
      if (result.indexOf(SORTED_TOKENS[k][0]) !== -1) {
        result = result.split(SORTED_TOKENS[k][0]).join(SORTED_TOKENS[k][1]);
      }
    }
    if (result !== value) {
      result = result.replace(/，/g, ", ").replace(/；/g, "; ")
        .replace(/（/g, " (").replace(/）/g, ")").replace(/：/g, ": ")
        .replace(/。/g, ".").replace(/、/g, ", ")
        .replace(/(\d+)\s*次/g, "$1 samples")
        .replace(/(\d+)\s*天/g, "$1 days")
        .replace(/(\d)\s{2,}(hr|min)(?=[A-Za-z])/g, "$1 $2 ")
        .replace(/[ \t]{2,}/g, " ");
    }
    return result;
  }

  function translateText(value) {
    var input = String(value == null ? "" : value);
    if (!hasHan(input)) return input;
    if (/[\r\n]/.test(input)) {
      return input.split(/(\r?\n)/).map(function (part) {
        return /^\r?\n$/.test(part) ? part : translateText(part);
      }).join("");
    }
    var leading = (input.match(/^\s*/) || [""])[0];
    var trailing = (input.match(/\s*$/) || [""])[0];
    var core = input.slice(leading.length, input.length - trailing.length);
    return leading + translateCore(core) + trailing;
  }

  function languageFromEnvironment() {
    var query = new URLSearchParams(root.location ? root.location.search : "");
    var requested = query.get("lang");
    if (requested === "en" || requested === "zh") return requested;
    if (root.location && /^\/en\/?$/.test(root.location.pathname)) return "en";
    try {
      var stored = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "zh") return stored;
    } catch (_) {}
    return "zh";
  }

  function shouldSkip(element) {
    return !!(element && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|CODE|PRE)$/.test(element.tagName));
  }

  function translateTextNode(node) {
    if (!node || !node.parentElement || shouldSkip(node.parentElement)) return;
    var current = node.nodeValue;
    var record = textRecords.get(node);
    if (currentLanguage === "zh") {
      if (record && current !== record.source) node.nodeValue = record.source;
      return;
    }
    if (record && current === record.translated) return;
    var source = current;
    var translated = translateText(source);
    if (translated === source) return;
    record = {source: source, translated: translated};
    textRecords.set(node, record);
    translatedTextNodes.add(node);
    node.nodeValue = translated;
  }

  function translateAttribute(element, name) {
    if (!element || !element.hasAttribute(name)) return;
    var records = attributeRecords.get(element);
    var record = records && records[name];
    var current = element.getAttribute(name);
    if (currentLanguage === "zh") {
      if (record && current !== record.source) element.setAttribute(name, record.source);
      return;
    }
    if (record && current === record.translated) return;
    var translated = translateText(current);
    if (translated === current) return;
    if (!records) {
      records = {};
      attributeRecords.set(element, records);
    }
    records[name] = {source: current, translated: translated};
    translatedElements.add(element);
    element.setAttribute(name, translated);
  }

  function translateElement(element) {
    if (!element || shouldSkip(element)) return;
    ATTRIBUTES.forEach(function (name) { translateAttribute(element, name); });
    if (element.tagName === "META" && element.hasAttribute("content")) {
      translateAttribute(element, "content");
    }
    Array.prototype.slice.call(element.childNodes || []).forEach(function (child) {
      if (child.nodeType === 3) translateTextNode(child);
      else if (child.nodeType === 1) translateElement(child);
    });
  }

  function forgetDetachedNode(node) {
    if (!node || node.isConnected) return;
    if (node.nodeType === 3) {
      translatedTextNodes.delete(node);
      return;
    }
    if (node.nodeType !== 1) return;
    translatedElements.delete(node);
    Array.prototype.slice.call(node.childNodes || []).forEach(forgetDetachedNode);
  }

  function restoreChinese() {
    translatedTextNodes.forEach(function (node) {
      var record = textRecords.get(node);
      if (record && node.isConnected && node.nodeValue !== record.source) node.nodeValue = record.source;
    });
    translatedElements.forEach(function (element) {
      var records = attributeRecords.get(element);
      if (!records || !element.isConnected) return;
      Object.keys(records).forEach(function (name) {
        if (element.getAttribute(name) !== records[name].source) {
          element.setAttribute(name, records[name].source);
        }
      });
    });
  }

  function updateLanguageButton() {
    if (!documentRef) return;
    var button = documentRef.getElementById("language-switch");
    if (!button) return;
    var english = currentLanguage === "en";
    button.textContent = english ? "中文" : "EN";
    button.setAttribute("aria-label", english ? "Switch to Chinese" : "Switch to English");
    button.setAttribute("aria-pressed", String(english));
    button.setAttribute("title", english ? "Switch to Chinese" : "Switch to English");
  }

  function isHomePath(pathname) {
    return pathname === "/" || pathname === "/index.html" ||
      pathname === "/en" || pathname === "/en/";
  }

  function localizeUrl(url) {
    if (isHomePath(url.pathname)) {
      url.pathname = currentLanguage === "en" ? "/en" : "/";
      url.searchParams.delete("lang");
    } else if (currentLanguage === "en") {
      url.searchParams.set("lang", "en");
    } else {
      url.searchParams.delete("lang");
    }
    return url;
  }

  function syncInternalLinks() {
    if (!documentRef || !root.location) return;
    Array.prototype.slice.call(documentRef.querySelectorAll("a[href]")).forEach(function (link) {
      if (typeof link.hasAttribute === "function" &&
          link.hasAttribute("data-language-neutral")) return;
      var raw = link.getAttribute("href") || "";
      if (raw.charAt(0) !== "/" || raw.indexOf("//") === 0) return;
      var url = localizeUrl(new URL(raw, root.location.href));
      link.setAttribute("href", url.pathname + url.search + url.hash);
    });
  }

  function updateUrl() {
    if (!root.history || !root.location || root.location.protocol === "about:") return;
    var url = localizeUrl(new URL(root.location.href));
    root.history.replaceState(root.history.state, "", url.pathname + url.search + url.hash);
  }

  function applyLanguage(language, options) {
    currentLanguage = language === "en" ? "en" : "zh";
    if (documentRef) {
      documentRef.documentElement.lang = currentLanguage === "en" ? "en" : "zh-CN";
      documentRef.documentElement.setAttribute("data-language", currentLanguage);
      if (currentLanguage === "en") translateElement(documentRef.documentElement);
      else restoreChinese();
      updateLanguageButton();
      syncInternalLinks();
    }
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, currentLanguage);
    } catch (_) {}
    if (options && options.updateUrl) updateUrl();
    if (documentRef) {
      documentRef.dispatchEvent(new CustomEvent("dradar:languagechange", {
        detail: {language: currentLanguage}
      }));
    }
  }

  function installObserver() {
    if (!documentRef || typeof MutationObserver === "undefined") return;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
        } else if (mutation.type === "attributes") {
          translateAttribute(mutation.target, mutation.attributeName);
        } else {
          Array.prototype.slice.call(mutation.removedNodes || []).forEach(forgetDetachedNode);
          Array.prototype.slice.call(mutation.addedNodes || []).forEach(function (node) {
            if (node.nodeType === 3) translateTextNode(node);
            else if (node.nodeType === 1) translateElement(node);
          });
        }
      });
    });
    observer.observe(documentRef.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ATTRIBUTES.concat(["content"])
    });
  }

  root.DRadarI18n = {
    language: function () { return currentLanguage; },
    isEnglish: function () { return currentLanguage === "en"; },
    locale: function () { return currentLanguage === "en" ? "en-US" : "zh-CN"; },
    translateText: translateText,
    setLanguage: function (language) { applyLanguage(language, {updateUrl: true}); }
  };

  if (!documentRef) return;
  currentLanguage = languageFromEnvironment();
  applyLanguage(currentLanguage, {updateUrl: true});
  installObserver();
  var switchButton = documentRef.getElementById("language-switch");
  if (switchButton) {
    switchButton.addEventListener("click", function () {
      applyLanguage(currentLanguage === "en" ? "zh" : "en", {updateUrl: true});
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
