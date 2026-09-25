import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Download,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildStrategyResult,
  createFastEstimator,
  getCopy,
  normalizeRecords,
  readFastMeasurements,
  type FastEstimator,
  type ModelRecord,
  type ScoredRecord,
  type StrategyKey,
  type SubscriptionKey,
} from "@ai-radar/core";
import "./App.css";

type ViewKey =
  "overview" | "analysis" | "recommendations" | "history" | "settings";
type StrategyResult = ReturnType<typeof buildStrategyResult>;

interface LocalDataStatus {
  enabled: boolean;
  sourceCount: number;
  validSourceCount: number;
  unsupportedSourceCount: number;
  snapshotCount: number;
  status: "disabled" | "ready" | "unavailable" | "stale";
  lastSync: string | null;
  sourceOverride: string | null;
}

interface RadarSnapshot {
  endpoint: string;
  url: string;
  retrievedAt: string;
  httpStatus: number;
  contentType: string | null;
  sourceUpdatedAt: string | null;
  etag: string | null;
  lastModified: string | null;
  sha256: string;
  body: unknown;
  fromCache: boolean;
  stale: boolean;
}

interface FeatureMetric {
  name: string;
  value: number;
}

interface QuotaUsagePoint {
  capturedAt: string | null;
  period: string | null;
  usedShare: number | null;
}

interface UsageSession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  plan: string | null;
  model: string | null;
  effort: string | null;
  mode: string | null;
  activeMinutes: number | null;
  quota5hUsedShare: number | null;
  weeklyUsedShare: number | null;
}

interface UsageDashboard {
  enabled: boolean;
  status: string;
  capturedAt: string | null;
  sourceCount: number;
  sessions: UsageSession[];
  featureUsage: FeatureMetric[];
  modelUsage: FeatureMetric[];
  effortUsage: FeatureMetric[];
  modeUsage: FeatureMetric[];
  quota5hHistory: QuotaUsagePoint[];
  weeklyHistory: QuotaUsagePoint[];
  rawSnapshotRef: string | null;
  message: string | null;
}

interface DesktopPreferences {
  plan: SubscriptionKey;
  strategy: StrategyKey;
  includeFast: boolean;
}

const RADAR_ENDPOINTS = ["efficiency", "fast-history"] as const;
const PREFERENCES_KEY = "ai-radar.desktop.preferences.v1";

const navigation: Array<{
  key: ViewKey;
  label: string;
  icon: typeof Activity;
}> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "analysis", label: "分析", icon: BarChart3 },
  { key: "recommendations", label: "推荐", icon: Sparkles },
  { key: "history", label: "额度历史", icon: Activity },
  { key: "settings", label: "设置", icon: Settings2 },
];

function readPreferences(): DesktopPreferences {
  const fallback: DesktopPreferences = {
    plan: "plus",
    strategy: "effectiveness",
    includeFast: true,
  };
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<DesktopPreferences>;
    return {
      plan:
        value.plan === "pro5" || value.plan === "pro20" ? value.plan : "plus",
      strategy:
        value.strategy === "quality" ||
        value.strategy === "budget" ||
        value.strategy === "speed"
          ? value.strategy
          : "effectiveness",
      includeFast: value.includeFast !== false,
    };
  } catch {
    return fallback;
  }
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function minutes(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} 分钟`;
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 100_000_000_000 ? numeric : numeric * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}

function family(record: ModelRecord | ScoredRecord): string {
  return record.label.replace(new RegExp(`\\s+${record.effort}$`, "i"), "");
}

function statusLabel(record: ScoredRecord): string {
  if (record.mode === "fast")
    return `Fast · ${record.fastEvidenceLevel ?? "未知"}`;
  if (record.sampleCount !== null && record.sampleCount < 112) {
    return `早期 · ${record.sampleCount} 次`;
  }
  return "Standard";
}

function MetricCard({
  accent,
  label,
  value,
  detail,
}: {
  accent: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-accent ${accent}`} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function App() {
  const preferences = useMemo(readPreferences, []);
  const [view, setView] = useState<ViewKey>("overview");
  const [plan, setPlan] = useState<SubscriptionKey>(preferences.plan);
  const [strategy, setStrategy] = useState<StrategyKey>(preferences.strategy);
  const [includeFast, setIncludeFast] = useState(preferences.includeFast);
  const [records, setRecords] = useState<ModelRecord[]>([]);
  const [fastEstimator, setFastEstimator] = useState<FastEstimator | null>(
    null,
  );
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalDataStatus>({
    enabled: false,
    sourceCount: 0,
    validSourceCount: 0,
    unsupportedSourceCount: 0,
    snapshotCount: 0,
    status: "disabled",
    lastSync: null,
    sourceOverride: null,
  });
  const [dashboard, setDashboard] = useState<UsageDashboard | null>(null);
  const [radarMeta, setRadarMeta] = useState<RadarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        plan,
        strategy,
        includeFast,
      } satisfies DesktopPreferences),
    );
  }, [includeFast, plan, strategy]);

  const loadLocal = async () => {
    try {
      let status = await invoke<LocalDataStatus>("get_local_data_status");
      if (status.enabled) {
        status = await invoke<LocalDataStatus>("sync_codex_stats");
      }
      const usage = await invoke<UsageDashboard>("get_usage_dashboard");
      setLocalStatus(status);
      setDashboard(usage);
    } catch {
      setDashboard(null);
    }
  };

  const loadRadar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [efficiency, fast] = await Promise.all(
        RADAR_ENDPOINTS.map((endpoint) =>
          invoke<RadarSnapshot>("fetch_radar_snapshot", { endpoint }),
        ),
      );
      const normalized = normalizeRecords(efficiency.body);
      const estimator = createFastEstimator(
        readFastMeasurements(null, fast.body),
        getCopy("zh"),
        Date.parse(efficiency.sourceUpdatedAt ?? "") || Date.now(),
      );
      setRecords(normalized);
      setFastEstimator(estimator);
      setRadarMeta(efficiency);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRadar();
    void loadLocal();
  }, []);

  useEffect(() => {
    if (records.length === 0 || !fastEstimator) return;
    setResult(
      buildStrategyResult(records, fastEstimator, strategy, plan, includeFast),
    );
  }, [fastEstimator, includeFast, plan, records, strategy]);

  const ordered = useMemo(
    () => result?.orderedScored.slice(0, 12) ?? [],
    [result],
  );

  const refresh = async () => {
    await Promise.all([loadRadar(), loadLocal()]);
  };

  const toggleLocalStats = async (enabled: boolean) => {
    if (enabled) {
      const confirmed = window.confirm(
        "开启后，AI 雷达只读取已识别的 Codex 统计文件；数据仅保存在本机并使用系统密钥加密。继续？",
      );
      if (!confirmed) return;
    }
    try {
      const status = await invoke<LocalDataStatus>("set_local_stats_enabled", {
        enabled,
      });
      setLocalStatus(status);
      const usage = await invoke<UsageDashboard>("get_usage_dashboard");
      setDashboard(usage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <span aria-hidden="true">×</span>
          <div>
            <strong>AI 雷达</strong>
            <small>效率前沿</small>
          </div>
        </div>
        <div className="sidebar-caption">CODEX / DESKTOP</div>
        <nav aria-label="主导航">
          {navigation.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={view === key ? "nav-item active" : "nav-item"}
              onClick={() => setView(key)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-status">
            <span
              className={localStatus.enabled ? "status-dot on" : "status-dot"}
            />
            <span>
              {localStatus.enabled ? "本地统计已启用" : "本地统计未读取"}
            </span>
          </div>
          <small>
            {radarMeta?.stale
              ? "Radar 缓存 · 过期"
              : "Radar API · 当前公开数据"}
          </small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI RADAR / FRONTIER</p>
            <h1>{navigation.find((item) => item.key === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              title="刷新 Radar 与本地统计"
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} />
            </button>
            <span className="api-pill">
              <span />
              {radarMeta?.fromCache ? "Radar 缓存" : "Radar API"}
            </span>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {view === "overview" && (
          <Overview
            result={result}
            ordered={ordered}
            plan={plan}
            setPlan={setPlan}
            strategy={strategy}
            setStrategy={setStrategy}
            includeFast={includeFast}
            setIncludeFast={setIncludeFast}
            localStatus={localStatus}
            dashboard={dashboard}
            loading={loading}
            error={error}
          />
        )}
        {view === "analysis" && <Analysis dashboard={dashboard} />}
        {view === "recommendations" && (
          <Recommendations
            ordered={ordered}
            result={result}
            plan={plan}
            setPlan={setPlan}
            strategy={strategy}
            setStrategy={setStrategy}
            includeFast={includeFast}
            setIncludeFast={setIncludeFast}
          />
        )}
        {view === "history" && (
          <History localStatus={localStatus} dashboard={dashboard} />
        )}
        {view === "settings" && (
          <Settings
            localStatus={localStatus}
            onToggle={toggleLocalStats}
            onRefresh={refresh}
            onStatus={setLocalStatus}
            onDashboard={setDashboard}
          />
        )}
      </main>
    </div>
  );
}

function Controls({
  plan,
  setPlan,
  strategy,
  setStrategy,
  includeFast,
  setIncludeFast,
}: {
  plan: SubscriptionKey;
  setPlan: (value: SubscriptionKey) => void;
  strategy: StrategyKey;
  setStrategy: (value: StrategyKey) => void;
  includeFast: boolean;
  setIncludeFast: (value: boolean) => void;
}) {
  return (
    <div className="control-row">
      <label className="sr-only" htmlFor="plan-select">
        订阅
      </label>
      <select
        id="plan-select"
        value={plan}
        onChange={(event) => setPlan(event.target.value as SubscriptionKey)}
      >
        <option value="plus">Plus</option>
        <option value="pro5">Pro 5x</option>
        <option value="pro20">Pro 20x</option>
      </select>
      <label className="sr-only" htmlFor="strategy-select">
        策略
      </label>
      <select
        id="strategy-select"
        value={strategy}
        onChange={(event) => setStrategy(event.target.value as StrategyKey)}
      >
        <option value="effectiveness">综合成效</option>
        <option value="quality">质量</option>
        <option value="budget">经济</option>
        <option value="speed">速度</option>
      </select>
      <label className="switch-control">
        <input
          type="checkbox"
          checked={includeFast}
          onChange={(event) => setIncludeFast(event.target.checked)}
        />
        <span />
        Fast
      </label>
    </div>
  );
}

function Overview({
  result,
  ordered,
  plan,
  setPlan,
  strategy,
  setStrategy,
  includeFast,
  setIncludeFast,
  localStatus,
  dashboard,
  loading,
  error,
}: {
  result: StrategyResult | null;
  ordered: ScoredRecord[];
  plan: SubscriptionKey;
  setPlan: (value: SubscriptionKey) => void;
  strategy: StrategyKey;
  setStrategy: (value: StrategyKey) => void;
  includeFast: boolean;
  setIncludeFast: (value: boolean) => void;
  localStatus: LocalDataStatus;
  dashboard: UsageDashboard | null;
  loading: boolean;
  error: string | null;
}) {
  const winner = result?.winner;
  const localTasks = dashboard?.featureUsage.find(
    (metric) => metric.name === "任务",
  );
  return (
    <>
      <section className="hero-row">
        <div>
          <h2>推荐概览</h2>
          <p>按当前订阅、策略和 Fast 设置列出可用模型。</p>
        </div>
        <Controls
          {...{
            plan,
            setPlan,
            strategy,
            setStrategy,
            includeFast,
            setIncludeFast,
          }}
        />
      </section>
      <section className="metric-grid">
        <MetricCard
          accent="orange"
          label="可行候选"
          value={loading ? "…" : `${ordered.length}`}
          detail="当前可比较结果"
        />
        <MetricCard
          accent="violet"
          label="当前首选"
          value={winner ? family(winner) : "—"}
          detail={
            winner
              ? `${winner.effort} · IQ ${winner.qualityIq}`
              : (error ?? "等待数据")
          }
        />
        <MetricCard
          accent="cyan"
          label="本地任务"
          value={
            dashboard?.status === "ready"
              ? `${Math.round(localTasks?.value ?? 0)}`
              : "—"
          }
          detail={
            dashboard?.status === "ready"
              ? `${localStatus.sourceCount} 个 Codex 来源`
              : "设置中开启本地统计"
          }
        />
        <MetricCard
          accent="green"
          label="Fast 证据"
          value={result ? `${result.fastCandidateCount}` : "—"}
          detail={result ? `${result.fastExactCount} 个精确证据` : "等待 Radar"}
        />
      </section>
      <section className="panel recommendation-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CURRENT FRONTIER</p>
            <h3>当前推荐</h3>
          </div>
          <span className="data-fresh">
            {dashboard?.capturedAt
              ? `本地 ${dateLabel(dashboard.capturedAt)}`
              : "公开 Radar 数据"}
          </span>
        </div>
        <RecommendationTable rows={ordered} plan={plan} />
      </section>
    </>
  );
}

function quotaShare(
  record: ScoredRecord,
  plan: SubscriptionKey,
): number | null {
  return plan === "plus"
    ? record.effectiveShortWindowShare
    : record.effectiveWeeklyShare;
}

function RecommendationTable({
  rows,
  plan,
}: {
  rows: ScoredRecord[];
  plan: SubscriptionKey;
}) {
  const scale = plan === "plus" ? "5h" : "周";
  return (
    <div className="recommendation-table">
      <div className="table-head">
        <span>模型 / 档位</span>
        <span>IQ</span>
        <span>每任务 / {scale}</span>
        <span>典型耗时</span>
        <span>证据</span>
      </div>
      {rows.map((record, index) => (
        <div className="table-row" key={record.key}>
          <span className="model-cell">
            <b>#{String(index + 1).padStart(2, "0")}</b>
            <strong>{family(record)}</strong>
            <em>
              {record.effort}
              {record.mode === "fast" ? " · Fast" : ""}
            </em>
          </span>
          <span className="number-cell">{record.qualityIq.toFixed(2)}</span>
          <span
            className="number-cell"
            title={
              plan === "plus"
                ? `周额度：${percent(record.effectiveWeeklyShare)}`
                : undefined
            }
          >
            {percent(quotaShare(record, plan))}
          </span>
          <span className="number-cell">
            {minutes(record.effectiveMinutes)}
          </span>
          <span>
            <span className="evidence-chip">{statusLabel(record)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Analysis({ dashboard }: { dashboard: UsageDashboard | null }) {
  const localReady = dashboard?.status === "ready";
  const localMetric = (name: string) =>
    dashboard?.featureUsage.find((metric) => metric.name === name)?.value ?? 0;
  return (
    <>
      <section className="hero-row">
        <div>
          <h2>本地用量</h2>
          <p>来自 Codex 本机数据库的真实使用记录。</p>
        </div>
        <span className={`source-badge ${localReady ? "ready" : "muted"}`}>
          {localReady ? `${dashboard?.sourceCount ?? 0} 个来源` : "未同步"}
        </span>
      </section>
      <section className="metric-grid">
        <MetricCard
          accent="orange"
          label="任务"
          value={localReady ? `${Math.round(localMetric("任务"))}` : "—"}
          detail="Codex 本地会话"
        />
        <MetricCard
          accent="violet"
          label="回合"
          value={localReady ? `${Math.round(localMetric("回合"))}` : "—"}
          detail={`${Math.round(localMetric("已完成回合"))} 个已完成`}
        />
        <MetricCard
          accent="cyan"
          label="活动时间"
          value={
            localReady ? `${localMetric("活动分钟").toFixed(0)} 分钟` : "—"
          }
          detail="来自 thread history"
        />
        <MetricCard
          accent="green"
          label="tokens"
          value={localReady ? formatCompact(localMetric("已用 tokens")) : "—"}
          detail="本地统计值"
        />
      </section>
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LOCAL DATA</p>
            <h3>使用分布</h3>
          </div>
          <span className="data-fresh">
            {dashboard?.capturedAt
              ? `更新于 ${dateLabel(dashboard.capturedAt)}`
              : "—"}
          </span>
        </div>
        {localReady ? (
          <div className="breakdown-grid">
            <BreakdownTable title="模型" rows={dashboard?.modelUsage ?? []} />
            <BreakdownTable
              title="推理档位"
              rows={dashboard?.effortUsage ?? []}
            />
          </div>
        ) : (
          <EmptyState
            icon={<Database size={20} />}
            title={dashboard?.message ?? "本地统计未开启"}
            detail="到设置开启后，重新同步即可看到会话、任务、模型和回合数据。"
          />
        )}
      </section>
      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h3>最近会话</h3>
          </div>
          <span className="data-fresh">仅统计字段</span>
        </div>
        {localReady && dashboard?.sessions.length ? (
          <SessionTable rows={dashboard.sessions.slice(0, 12)} />
        ) : (
          <EmptyState
            icon={<Clock3 size={20} />}
            title="没有会话记录"
            detail="同步 Codex 本地数据后显示。"
          />
        )}
      </section>
    </>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: FeatureMetric[];
}) {
  return (
    <div className="breakdown-block">
      <h4>{title}</h4>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.name}>
            <span>{row.name}</span>
            <strong>{row.value.toLocaleString("zh-CN")}</strong>
          </div>
        ))
      ) : (
        <p className="muted empty-inline">暂无可用字段</p>
      )}
    </div>
  );
}

function SessionTable({ rows }: { rows: UsageSession[] }) {
  return (
    <div className="session-list">
      {rows.map((row) => (
        <div className="session-row" key={row.sessionId}>
          <div>
            <strong>{row.model ?? "Codex 会话"}</strong>
            <span>
              {row.effort ?? "—"}
              {row.mode ? ` · ${row.mode}` : ""}
            </span>
          </div>
          <div>
            <b>
              {row.activeMinutes === null
                ? "—"
                : `${row.activeMinutes.toFixed(1)} 分钟`}
            </b>
            <small>{dateLabel(row.startedAt)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function Recommendations({
  ordered,
  result,
  plan,
  setPlan,
  strategy,
  setStrategy,
  includeFast,
  setIncludeFast,
}: {
  ordered: ScoredRecord[];
  result: StrategyResult | null;
  plan: SubscriptionKey;
  setPlan: (value: SubscriptionKey) => void;
  strategy: StrategyKey;
  setStrategy: (value: StrategyKey) => void;
  includeFast: boolean;
  setIncludeFast: (value: boolean) => void;
}) {
  return (
    <>
      <section className="hero-row">
        <div>
          <h2>推荐</h2>
          <p>当前设置下的完整候选、证据和排除结果。</p>
        </div>
        <Controls
          {...{
            plan,
            setPlan,
            strategy,
            setStrategy,
            includeFast,
            setIncludeFast,
          }}
        />
      </section>
      <section className="panel recommendation-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MODEL × EFFORT × MODE</p>
            <h3>可行候选</h3>
          </div>
          <span className="data-fresh">
            {result?.orderedScored.length ?? 0} 个可评分
          </span>
        </div>
        <RecommendationTable rows={ordered} plan={plan} />
        <div className="panel-footer">
          <span>所有结果来自当前公开 Radar 快照。</span>
          <span>
            {result?.excluded.fastEvidenceUnavailable.length ?? 0} 个 Fast
            证据不足
          </span>
        </div>
      </section>
      {result && <ExclusionSummary result={result} />}
    </>
  );
}

function ExclusionSummary({ result }: { result: StrategyResult }) {
  const groups = [
    ["Plus 5h 风险", result.excluded.resourceShortWindowRisk],
    ["周额度风险", result.excluded.resourceWeekly],
    ["Fast 证据不足", result.excluded.fastEvidenceUnavailable],
    ["实用性压缩", result.excluded.practicalDominated],
  ] as const;
  return (
    <section className="panel exclusion-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">EXPLANATION</p>
          <h3>被排除或压缩的结果</h3>
        </div>
        <CircleHelp size={17} />
      </div>
      <div className="exclusion-list">
        {groups.map(([label, values]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{values.length}</strong>
            <ChevronRight size={15} />
          </div>
        ))}
      </div>
    </section>
  );
}

function History({
  localStatus,
  dashboard,
}: {
  localStatus: LocalDataStatus;
  dashboard: UsageDashboard | null;
}) {
  return (
    <>
      <section className="hero-row">
        <div>
          <h2>用量历史</h2>
          <p>本地 Codex 活动与公开额度数据分开呈现。</p>
        </div>
      </section>
      <div className="history-grid">
        <LocalActivityPanel
          dashboard={dashboard}
          enabled={localStatus.enabled}
        />
        <HistoryPanel
          title="5 小时限额"
          points={dashboard?.quota5hHistory ?? []}
          enabled={localStatus.enabled}
        />
        <HistoryPanel
          title="每周限额"
          points={dashboard?.weeklyHistory ?? []}
          enabled={localStatus.enabled}
        />
      </div>
    </>
  );
}

function HistoryPanel({
  title,
  points,
  enabled,
}: {
  title: string;
  points: QuotaUsagePoint[];
  enabled: boolean;
}) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <span className="muted">按本机 Codex 统计聚合</span>
        </div>
        <Gauge size={18} />
      </div>
      {points.length ? (
        <div className="history-list">
          {points.map((point, index) => (
            <div key={`${point.capturedAt}-${index}`}>
              <span>
                {dateLabel(point.capturedAt)}
                {point.period ? ` · ${point.period}` : ""}
              </span>
              <strong>{percent(point.usedShare)}</strong>
            </div>
          ))}
        </div>
      ) : enabled ? (
        <EmptyState
          icon={<Gauge size={22} />}
          title="本地来源没有额度窗口字段"
          detail="这里不会把活动时长换算成 5h 或周额度；公开 Radar 额度仍用于推荐。"
        />
      ) : (
        <EmptyState
          icon={<LockKeyhole size={22} />}
          title="本地统计未开启"
          detail="可在设置中明确开启；关闭时不会读取 Codex 文件。"
        />
      )}
    </section>
  );
}

function LocalActivityPanel({
  dashboard,
  enabled,
}: {
  dashboard: UsageDashboard | null;
  enabled: boolean;
}) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <h3>本地 Codex 活动</h3>
          <span className="muted">state + thread history</span>
        </div>
        <Activity size={18} />
      </div>
      {dashboard?.sessions.length ? (
        <SessionTable rows={dashboard.sessions.slice(0, 10)} />
      ) : enabled ? (
        <EmptyState
          icon={<Clock3 size={22} />}
          title="本地同步没有会话记录"
          detail="检查 Codex 是否已创建 state_*.sqlite。"
        />
      ) : (
        <EmptyState
          icon={<LockKeyhole size={22} />}
          title="本地统计未开启"
          detail="在设置中开启后读取 Codex 的统计列。"
        />
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-history">
      {icon}
      <span>{title}</span>
      <small>{detail}</small>
    </div>
  );
}

function Settings({
  localStatus,
  onToggle,
  onRefresh,
  onStatus,
  onDashboard,
}: {
  localStatus: LocalDataStatus;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => Promise<void>;
  onStatus: (status: LocalDataStatus) => void;
  onDashboard: (dashboard: UsageDashboard) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sourceOverride, setSourceOverride] = useState(
    localStatus.sourceOverride ?? "",
  );
  const update = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  const exportData = () =>
    update(async () => {
      const destination = window.prompt(
        "输入导出目录的完整路径（统计索引和允许保存的快照）",
      );
      if (!destination) return;
      const path = await invoke<string>("export_local_data", { destination });
      window.alert(`已导出：${path}`);
    });
  const deleteData = () =>
    update(async () => {
      if (
        !window.confirm(
          "删除本机加密快照、派生数据、Radar 缓存和加密密钥？此操作不可撤销。",
        )
      )
        return;
      const status = await invoke<LocalDataStatus>("delete_local_data");
      onStatus(status);
      onDashboard({
        enabled: false,
        status: "disabled",
        capturedAt: null,
        sourceCount: 0,
        sessions: [],
        featureUsage: [],
        modelUsage: [],
        effortUsage: [],
        modeUsage: [],
        quota5hHistory: [],
        weeklyHistory: [],
        rawSnapshotRef: null,
        message: "本地数据已删除",
      });
    });
  const saveSourceOverride = () =>
    update(async () => {
      const status = await invoke<LocalDataStatus>(
        "set_codex_source_override",
        { path: sourceOverride.trim() || null },
      );
      onStatus(status);
    });
  return (
    <>
      <section className="hero-row">
        <div>
          <h2>设置</h2>
          <p>控制推荐范围、数据来源与隐私边界。</p>
        </div>
      </section>
      <section className="settings-stack">
        <section className="panel setting-row">
          <div className="setting-icon">
            <ShieldCheck size={19} />
          </div>
          <div className="setting-copy">
            <h3>本地 Codex 统计</h3>
            <p>
              默认关闭。开启后读取 Codex state 和 thread history
              的统计列，数据只保存在本机。
            </p>
            <small>
              {localStatus.sourceCount
                ? `发现 ${localStatus.sourceCount} 个候选来源 · 可识别 ${localStatus.validSourceCount} 个 · 不支持 ${localStatus.unsupportedSourceCount} 个`
                : "尚未发现候选来源"}
            </small>
          </div>
          <label className="switch-control large">
            <input
              type="checkbox"
              checked={localStatus.enabled}
              disabled={busy}
              onChange={(event) => onToggle(event.target.checked)}
            />
            <span />
            {localStatus.enabled ? "已开启" : "未开启"}
          </label>
        </section>
        <section className="panel setting-row">
          <div className="setting-icon">
            <Database size={19} />
          </div>
          <div className="setting-copy">
            <h3>Radar 数据</h3>
            <p>
              只访问固定的 codexradar.com、deng.codexradar.com 和
              api.codexradar.com 公开端点。
            </p>
            <small>
              {localStatus.lastSync
                ? `本地同步：${dateLabel(localStatus.lastSync)}`
                : "失败时使用带 ETag/Last-Modified 的缓存"}
            </small>
          </div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void update(onRefresh)}
          >
            <RefreshCw size={15} />
            重新检查
          </button>
        </section>
        <section className="panel setting-row source-setting">
          <div className="setting-icon">
            <Database size={19} />
          </div>
          <div className="setting-copy">
            <h3>统计目录覆盖</h3>
            <p>
              可选；只扫描这个目录下的 Codex state_*.sqlite 和
              thread_history_*.sqlite，不扫描整个磁盘。
            </p>
            <div className="source-input-row">
              <input
                value={sourceOverride}
                onChange={(event) => setSourceOverride(event.target.value)}
                placeholder="留空使用预定义目录"
                aria-label="Codex 统计目录覆盖"
              />
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void saveSourceOverride()}
              >
                保存目录
              </button>
            </div>
          </div>
        </section>
        <section className="panel setting-row">
          <div className="setting-icon">
            <Download size={19} />
          </div>
          <div className="setting-copy">
            <h3>数据控制</h3>
            <p>
              导出包含本地统计索引、允许保存的加密快照和
              manifest；删除会同时清除本地数据、缓存和密钥。
            </p>
          </div>
          <div className="setting-actions">
            <button
              className="secondary-button"
              disabled={busy || !localStatus.snapshotCount}
              onClick={() => void exportData()}
            >
              <Download size={15} />
              导出
            </button>
            <button
              className="danger-button"
              disabled={busy || !localStatus.snapshotCount}
              onClick={() => void deleteData()}
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        </section>
        <section className="panel setting-row compact">
          <div className="setting-icon">
            <LockKeyhole size={19} />
          </div>
          <div className="setting-copy">
            <h3>存储边界</h3>
            <p>
              不读取标题、聊天正文、提示词、代码、rollout、凭据或认证
              token；只读取模型、档位、时间、回合和 token 计数。
            </p>
          </div>
        </section>
      </section>
    </>
  );
}

export default App;
