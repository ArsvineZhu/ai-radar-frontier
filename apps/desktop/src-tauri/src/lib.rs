use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::Entry;
use reqwest::header::{ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const KEY_SERVICE: &str = "com.arsvine.airadar";
const KEY_NAME: &str = "local-stats-encryption-key";
const MAX_SOURCE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    local_stats_enabled: bool,
    source_override: Option<String>,
}

struct AppState {
    config: Mutex<AppConfig>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexSource {
    path: String,
    kind: String,
    byte_length: u64,
    modified_at: Option<String>,
    parser_status: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDataStatus {
    enabled: bool,
    source_count: usize,
    valid_source_count: usize,
    unsupported_source_count: usize,
    snapshot_count: usize,
    status: String,
    last_sync: Option<String>,
    source_override: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageSession {
    session_id: String,
    started_at: Option<String>,
    ended_at: Option<String>,
    plan: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    mode: Option<String>,
    active_minutes: Option<f64>,
    quota5h_used_share: Option<f64>,
    weekly_used_share: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureMetric {
    name: String,
    value: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuotaUsagePoint {
    captured_at: Option<String>,
    period: Option<String>,
    used_share: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageDashboard {
    enabled: bool,
    status: String,
    captured_at: Option<String>,
    source_count: usize,
    sessions: Vec<UsageSession>,
    feature_usage: Vec<FeatureMetric>,
    model_usage: Vec<FeatureMetric>,
    effort_usage: Vec<FeatureMetric>,
    mode_usage: Vec<FeatureMetric>,
    quota5h_history: Vec<QuotaUsagePoint>,
    weekly_history: Vec<QuotaUsagePoint>,
    raw_snapshot_ref: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedUsageSnapshot {
    schema_version: u32,
    captured_at: String,
    source_id: String,
    sessions: Vec<UsageSession>,
    feature_usage: Vec<FeatureMetric>,
    #[serde(default)]
    model_usage: Vec<FeatureMetric>,
    #[serde(default)]
    effort_usage: Vec<FeatureMetric>,
    #[serde(default)]
    mode_usage: Vec<FeatureMetric>,
    quota5h_history: Vec<QuotaUsagePoint>,
    weekly_history: Vec<QuotaUsagePoint>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RadarSnapshot {
    endpoint: String,
    url: String,
    retrieved_at: String,
    http_status: u16,
    content_type: Option<String>,
    source_updated_at: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    sha256: String,
    body: Value,
    from_cache: bool,
    stale: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RadarCacheMeta {
    endpoint: String,
    url: String,
    retrieved_at: String,
    http_status: u16,
    content_type: Option<String>,
    source_updated_at: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    sha256: String,
}

struct SourceRead {
    raw: Option<Vec<u8>>,
    parsed: ParsedUsageSnapshot,
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

fn load_config(app: &AppHandle) -> AppConfig {
    config_path(app)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn known_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(value) = std::env::var("APPDATA") {
        let base = PathBuf::from(value);
        roots.push(base.join("Codex").join("web").join("Codex"));
        roots.push(base.join("Codex"));
        roots.push(base.join("OpenAI").join("Codex"));
    }
    if let Ok(value) = std::env::var("LOCALAPPDATA") {
        let base = PathBuf::from(value);
        roots.push(base.join("Codex"));
        roots.push(base.join("OpenAI").join("Codex"));
    }
    if let Ok(value) = std::env::var("USERPROFILE") {
        roots.push(PathBuf::from(value).join(".codex"));
    }
    roots
}

fn candidate_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "stats.json" | "usage.json" | "analytics.json"
    ) || lower.starts_with("state_") && lower.ends_with(".sqlite")
        || lower.starts_with("thread_history_") && lower.ends_with(".sqlite")
}

fn source_kind(name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".json") {
        return Some("json".to_string());
    }
    if lower.starts_with("state_") && lower.ends_with(".sqlite") {
        return Some("codex-state".to_string());
    }
    if lower.starts_with("thread_history_") && lower.ends_with(".sqlite") {
        return Some("codex-thread-history".to_string());
    }
    None
}

fn walk_known_root(root: &Path, depth: usize, out: &mut Vec<CodexSource>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            walk_known_root(&path, depth + 1, out);
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !candidate_file(name) {
            continue;
        }
        let Some(kind) = source_kind(name) else {
            continue;
        };
        if kind == "json" && metadata.len() > MAX_SOURCE_BYTES {
            continue;
        }
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string());
        out.push(CodexSource {
            path: path.to_string_lossy().to_string(),
            kind: kind.clone(),
            byte_length: metadata.len(),
            modified_at,
            parser_status: if kind == "json" {
                "unverified".to_string()
            } else {
                "codex-usage-derived".to_string()
            },
        });
    }
}

fn discover_sources(source_override: Option<&str>) -> Vec<CodexSource> {
    let roots = source_override
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .map(|path| vec![path])
        .unwrap_or_else(known_roots);
    let mut sources = Vec::new();
    for root in roots {
        walk_known_root(&root, 0, &mut sources);
    }
    sources.sort_by(|left, right| left.path.cmp(&right.path));
    sources.dedup_by(|left, right| left.path == right.path);
    sources
}

fn encryption_key() -> Result<[u8; 32], String> {
    let entry = Entry::new(KEY_SERVICE, KEY_NAME).map_err(|error| error.to_string())?;
    if let Ok(value) = entry.get_password() {
        let bytes = BASE64.decode(value).map_err(|error| error.to_string())?;
        return bytes
            .try_into()
            .map_err(|_| "stored local-stats key has invalid length".to_string());
    }
    let key = Aes256Gcm::generate_key(&mut OsRng);
    entry
        .set_password(&BASE64.encode(key.as_slice()))
        .map_err(|error| error.to_string())?;
    Ok(key.into())
}

fn encrypt_snapshot(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = encryption_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let encrypted = cipher
        .encrypt(&nonce, bytes)
        .map_err(|error| error.to_string())?;
    let digest = Sha256::digest(bytes);
    let mut payload = Vec::with_capacity(nonce.len() + digest.len() + encrypted.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&digest);
    payload.extend_from_slice(&encrypted);
    Ok(payload)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn as_object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn first<'a>(object: &'a Map<String, Value>, names: &[&str]) -> Option<&'a Value> {
    names.iter().find_map(|name| object.get(*name))
}

fn string_value(object: &Map<String, Value>, names: &[&str]) -> Option<String> {
    first(object, names)
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .filter(|value| !value.is_empty())
}

fn number_value(object: &Map<String, Value>, names: &[&str]) -> Option<f64> {
    first(object, names)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

fn contains_sensitive_key(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, value)| {
            let lower = key.to_ascii_lowercase();
            matches!(
                lower.as_str(),
                "prompt"
                    | "message"
                    | "content"
                    | "conversation"
                    | "transcript"
                    | "credential"
                    | "credentials"
                    | "password"
                    | "cookie"
                    | "authorization"
                    | "accesstoken"
                    | "access_token"
                    | "refreshtoken"
                    | "refresh_token"
                    | "idtoken"
                    | "id_token"
                    | "code"
            ) || contains_sensitive_key(value)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_key),
        _ => false,
    }
}

fn parse_session(value: &Value) -> Option<UsageSession> {
    let object = as_object(value)?;
    let session_id = string_value(object, &["sessionId", "session_id", "id"])?;
    let mode =
        string_value(object, &["mode"]).filter(|value| value == "standard" || value == "fast");
    Some(UsageSession {
        session_id,
        started_at: string_value(object, &["startedAt", "started_at"]),
        ended_at: string_value(object, &["endedAt", "ended_at"]),
        plan: string_value(object, &["plan"]),
        model: string_value(object, &["model"]),
        effort: string_value(object, &["effort"]),
        mode,
        active_minutes: number_value(object, &["activeMinutes", "active_minutes"]),
        quota5h_used_share: number_value(object, &["quota5hUsedShare", "quota_5h_used_share"]),
        weekly_used_share: number_value(object, &["weeklyUsedShare", "weekly_used_share"]),
    })
}

fn parse_history(value: Option<&Value>) -> Vec<QuotaUsagePoint> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| {
                    let object = as_object(value)?;
                    Some(QuotaUsagePoint {
                        captured_at: string_value(object, &["capturedAt", "captured_at", "at"]),
                        period: string_value(object, &["period", "window"]),
                        used_share: number_value(object, &["usedShare", "used_share"]),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_usage_source(bytes: &[u8], source: &CodexSource) -> Result<ParsedUsageSnapshot, String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "invalid-json".to_string())?;
    if contains_sensitive_key(&value) {
        return Err("sensitive-payload-rejected".to_string());
    }
    let object = as_object(&value).ok_or_else(|| "root-is-not-an-object".to_string())?;
    let schema_version = number_value(object, &["schemaVersion", "schema_version"])
        .and_then(|value| u32::try_from(value as i64).ok())
        .ok_or_else(|| "unknown-schema-version".to_string())?;
    let known_payload = first(
        object,
        &[
            "sessions",
            "featureUsage",
            "feature_usage",
            "quota5hHistory",
            "quota_5h_history",
            "weeklyHistory",
            "weekly_history",
        ],
    )
    .is_some();
    if !known_payload {
        return Err("unknown-schema".to_string());
    }
    let sessions = first(object, &["sessions"])
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(parse_session).collect())
        .unwrap_or_default();
    let mut feature_usage = Vec::new();
    if let Some(features) =
        first(object, &["featureUsage", "feature_usage"]).and_then(Value::as_object)
    {
        for (name, value) in features {
            if let Some(number) = value.as_f64().filter(|value| value.is_finite()) {
                feature_usage.push(FeatureMetric {
                    name: name.clone(),
                    value: number,
                });
            }
        }
    }
    feature_usage.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(ParsedUsageSnapshot {
        schema_version,
        captured_at: string_value(object, &["capturedAt", "captured_at"])
            .unwrap_or_else(now_string),
        source_id: source.path.clone(),
        sessions,
        feature_usage,
        model_usage: Vec::new(),
        effort_usage: Vec::new(),
        mode_usage: Vec::new(),
        quota5h_history: parse_history(first(object, &["quota5hHistory", "quota_5h_history"])),
        weekly_history: parse_history(first(object, &["weeklyHistory", "weekly_history"])),
    })
}

fn sqlite_connection(path: &str) -> Result<Connection, String> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|error| error.to_string())
}

fn count_metrics(metrics: BTreeMap<String, f64>) -> Vec<FeatureMetric> {
    metrics
        .into_iter()
        .map(|(name, value)| FeatureMetric { name, value })
        .collect()
}

fn parse_codex_state(source: &CodexSource) -> Result<ParsedUsageSnapshot, String> {
    let connection = sqlite_connection(&source.path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, created_at_ms, updated_at_ms, model, reasoning_effort, tokens_used, has_user_event FROM threads",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut sessions = Vec::new();
    let mut model_usage = BTreeMap::new();
    let mut effort_usage = BTreeMap::new();
    let mut tasks = 0.0;
    let mut tokens = 0.0;
    for row in rows {
        let (id, created_at, updated_at, model, effort, tokens_used, has_user_event) =
            row.map_err(|error| error.to_string())?;
        if has_user_event != 0 {
            tasks += 1.0;
        }
        tokens += tokens_used as f64;
        if let Some(value) = &model {
            *model_usage.entry(value.clone()).or_insert(0.0) += 1.0;
        }
        if let Some(value) = &effort {
            *effort_usage.entry(value.clone()).or_insert(0.0) += 1.0;
        }
        sessions.push(UsageSession {
            session_id: id,
            started_at: Some(created_at.to_string()),
            ended_at: Some(updated_at.to_string()),
            plan: None,
            model,
            effort,
            mode: None,
            active_minutes: None,
            quota5h_used_share: None,
            weekly_used_share: None,
        });
    }
    let mut feature_usage = BTreeMap::new();
    feature_usage.insert(
        "任务".to_string(),
        if tasks > 0.0 {
            tasks
        } else {
            sessions.len() as f64
        },
    );
    feature_usage.insert("会话".to_string(), sessions.len() as f64);
    feature_usage.insert("已用 tokens".to_string(), tokens);
    Ok(ParsedUsageSnapshot {
        schema_version: 1,
        captured_at: now_string(),
        source_id: source.path.clone(),
        sessions,
        feature_usage: count_metrics(feature_usage),
        model_usage: count_metrics(model_usage),
        effort_usage: count_metrics(effort_usage),
        mode_usage: Vec::new(),
        quota5h_history: Vec::new(),
        weekly_history: Vec::new(),
    })
}

fn parse_codex_thread_history(source: &CodexSource) -> Result<ParsedUsageSnapshot, String> {
    let connection = sqlite_connection(&source.path)?;
    let mut statement = connection
        .prepare(
            "SELECT thread_id, MIN(started_at), MAX(completed_at), COALESCE(SUM(COALESCE(duration_ms, 0)), 0), COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) FROM thread_turns GROUP BY thread_id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut sessions = Vec::new();
    let mut turns = 0.0;
    let mut completed_turns = 0.0;
    let mut active_minutes = 0.0;
    for row in rows {
        let (thread_id, started_at, completed_at, duration_ms, thread_turns, completed) =
            row.map_err(|error| error.to_string())?;
        turns += thread_turns as f64;
        completed_turns += completed as f64;
        active_minutes += duration_ms as f64 / 60_000.0;
        sessions.push(UsageSession {
            session_id: thread_id,
            started_at: started_at.map(|value| value.to_string()),
            ended_at: completed_at.map(|value| value.to_string()),
            plan: None,
            model: None,
            effort: None,
            mode: None,
            active_minutes: Some(duration_ms as f64 / 60_000.0),
            quota5h_used_share: None,
            weekly_used_share: None,
        });
    }
    let mut feature_usage = BTreeMap::new();
    feature_usage.insert("回合".to_string(), turns);
    feature_usage.insert("已完成回合".to_string(), completed_turns);
    feature_usage.insert("活动分钟".to_string(), active_minutes);
    Ok(ParsedUsageSnapshot {
        schema_version: 1,
        captured_at: now_string(),
        source_id: source.path.clone(),
        sessions,
        feature_usage: count_metrics(feature_usage),
        model_usage: Vec::new(),
        effort_usage: Vec::new(),
        mode_usage: Vec::new(),
        quota5h_history: Vec::new(),
        weekly_history: Vec::new(),
    })
}

fn read_source(source: &CodexSource) -> Result<SourceRead, String> {
    match source.kind.as_str() {
        "json" => {
            let bytes = fs::read(&source.path).map_err(|error| error.to_string())?;
            let parsed = parse_usage_source(&bytes, source)?;
            Ok(SourceRead {
                raw: Some(bytes),
                parsed,
            })
        }
        "codex-state" => Ok(SourceRead {
            raw: None,
            parsed: parse_codex_state(source)?,
        }),
        "codex-thread-history" => Ok(SourceRead {
            raw: None,
            parsed: parse_codex_thread_history(source)?,
        }),
        _ => Err("unsupported-schema".to_string()),
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("local-data.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                captured_at TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                parser_status TEXT NOT NULL,
                payload BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS derived_snapshots (
                id TEXT PRIMARY KEY,
                captured_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn store_source_snapshot(
    app: &AppHandle,
    source: &CodexSource,
    read: SourceRead,
) -> Result<(), String> {
    let encrypted = read.raw.as_deref().map(encrypt_snapshot).transpose()?;
    let snapshot_id = sha256(source.path.as_bytes());
    let parsed_json = serde_json::to_string(&read.parsed).map_err(|error| error.to_string())?;
    let connection = open_database(app)?;
    connection
        .execute(
            "INSERT OR REPLACE INTO snapshots (id, source_path, captured_at, sha256, parser_status, payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![snapshot_id, source.path, read.parsed.captured_at, read.raw.as_deref().map(sha256).unwrap_or_default(), if encrypted.is_some() { "accepted" } else { "derived-only" }, encrypted.unwrap_or_default()],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT OR REPLACE INTO derived_snapshots (id, captured_at, payload_json) VALUES (?1, ?2, ?3)",
            params![snapshot_id, read.parsed.captured_at, parsed_json],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn snapshot_count(app: &AppHandle) -> usize {
    open_database(app)
        .ok()
        .and_then(|connection| {
            connection
                .query_row("SELECT COUNT(*) FROM snapshots", [], |row| row.get(0))
                .ok()
        })
        .unwrap_or(0)
}

fn last_sync(app: &AppHandle) -> Option<String> {
    open_database(app).ok().and_then(|connection| {
        connection
            .query_row(
                "SELECT MAX(captured_at) FROM derived_snapshots",
                [],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten()
    })
}

fn status_for(
    app: &AppHandle,
    enabled: bool,
    sources: &[CodexSource],
    valid_source_count: usize,
    unsupported_source_count: usize,
    source_override: Option<String>,
) -> LocalDataStatus {
    LocalDataStatus {
        enabled,
        source_count: sources.len(),
        valid_source_count,
        unsupported_source_count,
        snapshot_count: snapshot_count(app),
        status: if !enabled {
            "disabled".to_string()
        } else if valid_source_count > 0 {
            "ready".to_string()
        } else {
            "unavailable".to_string()
        },
        last_sync: last_sync(app),
        source_override,
    }
}

fn classify_sources(sources: &[CodexSource], read_contents: bool) -> (usize, usize) {
    if !read_contents {
        return (0, 0);
    }
    let mut valid = 0;
    let mut unsupported = 0;
    for source in sources {
        if read_source(source).is_ok() {
            valid += 1;
        } else {
            unsupported += 1;
        }
    }
    (valid, unsupported)
}

fn config_snapshot(state: &State<'_, AppState>) -> Result<AppConfig, String> {
    state
        .config
        .lock()
        .map(|config| config.clone())
        .map_err(|_| "application state poisoned".to_string())
}

fn radar_url(endpoint: &str) -> Result<&'static str, String> {
    match endpoint {
        "efficiency" => {
            Ok("https://api.codexradar.com/api/v1/intelligence-efficiency?benchmark=deep-swe")
        }
        "fast-history" => Ok("https://codexradar.com/data/fast-radar-history.json"),
        _ => Err("endpoint is not in the Radar allowlist".to_string()),
    }
}

fn cache_paths(app: &AppHandle, endpoint: &str) -> Result<(PathBuf, PathBuf), String> {
    let directory = app_data_dir(app)?.join("radar-cache");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok((
        directory.join(format!("{endpoint}.json")),
        directory.join(format!("{endpoint}.meta.json")),
    ))
}

fn read_cached_radar(
    app: &AppHandle,
    endpoint: &str,
    stale: bool,
) -> Result<RadarSnapshot, String> {
    let (body_path, meta_path) = cache_paths(app, endpoint)?;
    let meta: RadarCacheMeta =
        serde_json::from_slice(&fs::read(meta_path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    let bytes = fs::read(body_path).map_err(|error| error.to_string())?;
    let body = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    Ok(RadarSnapshot {
        endpoint: meta.endpoint,
        url: meta.url,
        retrieved_at: meta.retrieved_at,
        http_status: meta.http_status,
        content_type: meta.content_type,
        source_updated_at: meta.source_updated_at,
        etag: meta.etag,
        last_modified: meta.last_modified,
        sha256: meta.sha256,
        body,
        from_cache: true,
        stale,
    })
}

async fn fetch_radar_snapshot_impl(
    app: &AppHandle,
    endpoint: &str,
) -> Result<RadarSnapshot, String> {
    let url = radar_url(endpoint)?;
    let (body_path, meta_path) = cache_paths(app, endpoint)?;
    let cached_meta = fs::read(&meta_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<RadarCacheMeta>(&bytes).ok());
    let client = reqwest::Client::new();
    let mut request = client.get(url).header("accept", "application/json");
    if let Some(meta) = &cached_meta {
        if let Some(etag) = &meta.etag {
            request = request.header(IF_NONE_MATCH, etag);
        }
        if let Some(last_modified) = &meta.last_modified {
            request = request.header(IF_MODIFIED_SINCE, last_modified);
        }
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return cached_meta
                .and_then(|_| read_cached_radar(app, endpoint, true).ok())
                .ok_or_else(|| error.to_string());
        }
    };
    if response.status().as_u16() == 304 {
        return read_cached_radar(app, endpoint, false);
    }
    if !response.status().is_success() {
        return cached_meta
            .and_then(|_| read_cached_radar(app, endpoint, true).ok())
            .ok_or_else(|| format!("Radar request failed: {}", response.status()));
    }
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let content_type = headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let etag = headers
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let last_modified = headers
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let source_updated_at = headers
        .get("x-source-updated-at")
        .or_else(|| headers.get(LAST_MODIFIED))
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let body: Value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let meta = RadarCacheMeta {
        endpoint: endpoint.to_string(),
        url: url.to_string(),
        retrieved_at: now_string(),
        http_status: status,
        content_type: content_type.clone(),
        source_updated_at: source_updated_at.clone(),
        etag: etag.clone(),
        last_modified: last_modified.clone(),
        sha256: sha256(&bytes),
    };
    fs::write(&body_path, &bytes).map_err(|error| error.to_string())?;
    fs::write(
        &meta_path,
        serde_json::to_vec_pretty(&meta).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(RadarSnapshot {
        endpoint: endpoint.to_string(),
        url: url.to_string(),
        retrieved_at: meta.retrieved_at,
        http_status: status,
        content_type,
        source_updated_at,
        etag,
        last_modified,
        sha256: meta.sha256,
        body,
        from_cache: false,
        stale: false,
    })
}

fn empty_dashboard(enabled: bool, status: &str, message: &str) -> UsageDashboard {
    UsageDashboard {
        enabled,
        status: status.to_string(),
        captured_at: None,
        source_count: 0,
        sessions: Vec::new(),
        feature_usage: Vec::new(),
        model_usage: Vec::new(),
        effort_usage: Vec::new(),
        mode_usage: Vec::new(),
        quota5h_history: Vec::new(),
        weekly_history: Vec::new(),
        raw_snapshot_ref: None,
        message: Some(message.to_string()),
    }
}

#[tauri::command]
fn discover_codex_sources(state: State<'_, AppState>) -> Result<Vec<CodexSource>, String> {
    let config = config_snapshot(&state)?;
    Ok(discover_sources(config.source_override.as_deref()))
}

#[tauri::command]
fn get_local_data_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LocalDataStatus, String> {
    let config = config_snapshot(&state)?;
    let sources = discover_sources(config.source_override.as_deref());
    let (valid, unsupported) = classify_sources(&sources, config.local_stats_enabled);
    Ok(status_for(
        &app,
        config.local_stats_enabled,
        &sources,
        valid,
        unsupported,
        config.source_override.clone(),
    ))
}

#[tauri::command]
fn set_local_stats_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<LocalDataStatus, String> {
    let mut config = config_snapshot(&state)?;
    config.local_stats_enabled = enabled;
    save_config(&app, &config)?;
    *state
        .config
        .lock()
        .map_err(|_| "application state poisoned".to_string())? = config.clone();
    if !enabled {
        let sources = discover_sources(config.source_override.as_deref());
        return Ok(status_for(
            &app,
            false,
            &sources,
            0,
            0,
            config.source_override.clone(),
        ));
    }
    sync_codex_stats(app, state)
}

#[tauri::command]
fn set_codex_source_override(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<LocalDataStatus, String> {
    let normalized = path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = &normalized {
        if !Path::new(value).is_dir() {
            return Err("source override must be an existing directory".to_string());
        }
    }
    let mut config = config_snapshot(&state)?;
    config.source_override = normalized;
    save_config(&app, &config)?;
    *state
        .config
        .lock()
        .map_err(|_| "application state poisoned".to_string())? = config.clone();
    let sources = discover_sources(config.source_override.as_deref());
    let (valid, unsupported) = classify_sources(&sources, config.local_stats_enabled);
    Ok(status_for(
        &app,
        config.local_stats_enabled,
        &sources,
        valid,
        unsupported,
        config.source_override.clone(),
    ))
}

#[tauri::command]
fn sync_codex_stats(app: AppHandle, state: State<'_, AppState>) -> Result<LocalDataStatus, String> {
    let config = config_snapshot(&state)?;
    let sources = discover_sources(config.source_override.as_deref());
    if !config.local_stats_enabled {
        return Ok(status_for(
            &app,
            false,
            &sources,
            0,
            0,
            config.source_override.clone(),
        ));
    }
    let mut valid = 0;
    let mut unsupported = 0;
    for source in &sources {
        match read_source(source) {
            Ok(read) => {
                store_source_snapshot(&app, source, read)?;
                valid += 1;
            }
            Err(_) => unsupported += 1,
        }
    }
    Ok(status_for(
        &app,
        true,
        &sources,
        valid,
        unsupported,
        config.source_override.clone(),
    ))
}

#[tauri::command]
fn get_usage_dashboard(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UsageDashboard, String> {
    let config = config_snapshot(&state)?;
    if !config.local_stats_enabled {
        return Ok(empty_dashboard(false, "disabled", "本地统计未开启"));
    }
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare("SELECT payload_json FROM derived_snapshots ORDER BY captured_at DESC")
        .map_err(|error| error.to_string())?;
    let payloads = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut feature_usage = BTreeMap::new();
    let mut model_usage = BTreeMap::new();
    let mut effort_usage = BTreeMap::new();
    let mut mode_usage = BTreeMap::new();
    let mut sessions = Vec::new();
    let mut latest_captured_at = None;
    let mut source_ids = Vec::new();
    for payload in payloads {
        let payload = payload.map_err(|error| error.to_string())?;
        let parsed: ParsedUsageSnapshot = match serde_json::from_str(&payload) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };
        latest_captured_at = Some(parsed.captured_at.clone());
        source_ids.push(parsed.source_id);
        for metric in parsed.feature_usage {
            *feature_usage.entry(metric.name).or_insert(0.0) += metric.value;
        }
        for metric in parsed.model_usage {
            *model_usage.entry(metric.name).or_insert(0.0) += metric.value;
        }
        for metric in parsed.effort_usage {
            *effort_usage.entry(metric.name).or_insert(0.0) += metric.value;
        }
        for metric in parsed.mode_usage {
            *mode_usage.entry(metric.name).or_insert(0.0) += metric.value;
        }
        if sessions.len() < 500 {
            sessions.extend(parsed.sessions.into_iter().take(500 - sessions.len()));
        }
    }
    if source_ids.is_empty() {
        return Ok(empty_dashboard(
            true,
            "unavailable",
            "没有可识别的本地统计快照",
        ));
    }
    let source_count = discover_sources(config.source_override.as_deref()).len();
    Ok(UsageDashboard {
        enabled: true,
        status: "ready".to_string(),
        captured_at: latest_captured_at,
        source_count,
        sessions,
        feature_usage: count_metrics(feature_usage),
        model_usage: count_metrics(model_usage),
        effort_usage: count_metrics(effort_usage),
        mode_usage: count_metrics(mode_usage),
        quota5h_history: Vec::new(),
        weekly_history: Vec::new(),
        raw_snapshot_ref: Some(source_ids.join("\n")),
        message: None,
    })
}

#[tauri::command]
fn export_local_data(app: AppHandle, destination: String) -> Result<String, String> {
    let destination = PathBuf::from(destination.trim());
    if destination.as_os_str().is_empty() {
        return Err("export destination is required".to_string());
    }
    fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, source_path, captured_at, sha256, parser_status, payload FROM snapshots",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Vec<u8>>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut manifest = Vec::new();
    for row in rows {
        let (id, source_path, captured_at, digest, parser_status, payload) =
            row.map_err(|error| error.to_string())?;
        let file_name = format!("{id}.snapshot.enc");
        let has_encrypted_payload = !payload.is_empty();
        if has_encrypted_payload {
            fs::write(destination.join(&file_name), payload).map_err(|error| error.to_string())?;
        }
        manifest.push(serde_json::json!({
            "id": id,
            "sourcePath": source_path,
            "capturedAt": captured_at,
            "sha256": digest,
            "parserStatus": parser_status,
            "file": if has_encrypted_payload { Some(file_name) } else { None::<String> },
            "encrypted": has_encrypted_payload,
        }));
    }
    let manifest_path = destination.join("manifest.json");
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(manifest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_local_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LocalDataStatus, String> {
    let database = database_path(&app)?;
    if database.exists() {
        fs::remove_file(database).map_err(|error| error.to_string())?;
    }
    let cache = app_data_dir(&app)?.join("radar-cache");
    if cache.exists() {
        fs::remove_dir_all(cache).map_err(|error| error.to_string())?;
    }
    if let Ok(entry) = Entry::new(KEY_SERVICE, KEY_NAME) {
        let _ = entry.delete_credential();
    }
    let mut config = config_snapshot(&state)?;
    config.local_stats_enabled = false;
    save_config(&app, &config)?;
    *state
        .config
        .lock()
        .map_err(|_| "application state poisoned".to_string())? = config.clone();
    let sources = discover_sources(config.source_override.as_deref());
    Ok(status_for(
        &app,
        false,
        &sources,
        0,
        0,
        config.source_override.clone(),
    ))
}

#[tauri::command]
async fn fetch_radar_snapshot(app: AppHandle, endpoint: String) -> Result<RadarSnapshot, String> {
    fetch_radar_snapshot_impl(&app, endpoint.trim()).await
}

#[tauri::command]
fn get_cached_radar_snapshot(app: AppHandle, endpoint: String) -> Result<RadarSnapshot, String> {
    radar_url(endpoint.trim())?;
    read_cached_radar(&app, endpoint.trim(), true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config = load_config(app.handle());
            app.manage(AppState {
                config: Mutex::new(config),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            discover_codex_sources,
            get_local_data_status,
            set_local_stats_enabled,
            set_codex_source_override,
            sync_codex_stats,
            get_usage_dashboard,
            export_local_data,
            delete_local_data,
            fetch_radar_snapshot,
            get_cached_radar_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(kind: &str) -> CodexSource {
        CodexSource {
            path: "C:\\stats.json".to_string(),
            kind: kind.to_string(),
            byte_length: 32,
            modified_at: None,
            parser_status: "unverified".to_string(),
        }
    }

    #[test]
    fn radar_allowlist_rejects_arbitrary_hosts() {
        assert!(radar_url("efficiency").is_ok());
        assert!(radar_url("https://example.com").is_err());
    }

    #[test]
    fn unknown_local_schema_is_not_interpreted() {
        let result = parse_usage_source(
            br#"{"schemaVersion":99,"payload":{"value":1}}"#,
            &source("json"),
        );
        assert_eq!(result.err().as_deref(), Some("unknown-schema"));
    }

    #[test]
    fn sensitive_local_payload_is_rejected_before_storage() {
        let result = parse_usage_source(
            br#"{"schemaVersion":1,"sessions":[],"prompt":"private"}"#,
            &source("json"),
        );
        assert_eq!(result.err().as_deref(), Some("sensitive-payload-rejected"));
    }
}
