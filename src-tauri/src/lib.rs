use std::io::{BufRead, BufReader, Write};
use std::collections::{HashMap, HashSet};
use std::process::{Child, Command, Stdio};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Configures the command to run without spawning a visible console window (Windows only).
#[cfg(windows)]
fn run_hidden(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn run_hidden(_cmd: &mut Command) {}
use tauri::{AppHandle, Emitter, Manager, State};
use serde_json::json;

struct MimoProcess {
    child: Mutex<Option<Child>>,
    session_id: Arc<Mutex<Option<String>>>,
    mimo_path: Mutex<Option<std::path::PathBuf>>,
    custom_path: Mutex<Option<std::path::PathBuf>>,
    project_path: Mutex<Option<std::path::PathBuf>>,
    change_tracker: Mutex<ChangeTracker>,
}

#[derive(Clone)]
struct CachedProjectFile {
    modified: u128,
    size: u64,
    content: String,
}

#[derive(Clone)]
struct ProjectChangeRecord {
    path: String,
    status: String,
    before: String,
    after: String,
    additions: usize,
    deletions: usize,
    timestamp: i64,
}

#[derive(Default)]
struct ChangeTracker {
    project_path: Option<std::path::PathBuf>,
    baseline: HashMap<String, CachedProjectFile>,
    current: HashMap<String, CachedProjectFile>,
    changes: HashMap<String, ProjectChangeRecord>,
}

fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

fn ignored_project_dir(name: &str) -> bool {
    matches!(name, "node_modules" | ".git" | "__pycache__" | ".venv" | "venv" |
        "dist" | "build" | ".next" | ".nuxt" | "target" | ".cache" |
        "coverage" | ".idea" | ".vscode" | "vendor")
}

fn is_trackable_text_file(path: &std::path::Path, size: u64) -> bool {
    if size > 2 * 1024 * 1024 { return false; }
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(),
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "json" | "jsonl" |
        "css" | "scss" | "sass" | "less" | "html" | "vue" | "svelte" |
        "rs" | "py" | "go" | "java" | "kt" | "kts" | "c" | "cc" | "cpp" |
        "h" | "hpp" | "cs" | "php" | "rb" | "swift" | "dart" | "lua" |
        "sh" | "ps1" | "bat" | "cmd" | "toml" | "yaml" | "yml" | "xml" |
        "md" | "txt" | "sql" | "graphql" | "env" | "ini" | "cfg" | "conf")
        || path.file_name().and_then(|value| value.to_str()).map(|name|
            matches!(name, "Dockerfile" | "Makefile" | "AGENTS.md" | ".gitignore" | ".env")
        ).unwrap_or(false)
}

fn scan_project_metadata(
    root: &std::path::Path,
    dir: &std::path::Path,
    output: &mut HashMap<String, (std::path::PathBuf, u128, u64)>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !ignored_project_dir(&name) && !name.starts_with('.') {
                scan_project_metadata(root, &path, output);
            }
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue; };
        if !is_trackable_text_file(&path, metadata.len()) { continue; }
        let modified = metadata.modified().ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        output.insert(relative, (path, modified, metadata.len()));
    }
}

fn line_change_counts(before: &str, after: &str) -> (usize, usize) {
    let old: Vec<&str> = before.lines().collect();
    let new: Vec<&str> = after.lines().collect();
    let mut prefix = 0;
    while prefix < old.len() && prefix < new.len() && old[prefix] == new[prefix] { prefix += 1; }
    let mut suffix = 0;
    while suffix + prefix < old.len() && suffix + prefix < new.len()
        && old[old.len() - 1 - suffix] == new[new.len() - 1 - suffix] { suffix += 1; }
    (new.len().saturating_sub(prefix + suffix), old.len().saturating_sub(prefix + suffix))
}

fn initialize_change_tracker(tracker: &mut ChangeTracker, project_path: &std::path::Path) {
    let mut metadata = HashMap::new();
    scan_project_metadata(project_path, project_path, &mut metadata);
    let mut snapshot = HashMap::new();
    let mut entries: Vec<_> = metadata.into_iter().collect();
    entries.sort_by_key(|(_, (_, _, size))| *size);
    let mut cached_bytes = 0_u64;
    let mut cached_files = 0_usize;
    const MAX_CACHE_BYTES: u64 = 24 * 1024 * 1024;
    const MAX_CACHE_FILES: usize = 2500;
    for (relative, (absolute, modified, size)) in entries {
        let content = if cached_files < MAX_CACHE_FILES && cached_bytes.saturating_add(size) <= MAX_CACHE_BYTES {
            match std::fs::read_to_string(absolute) {
                Ok(content) => {
                    cached_bytes = cached_bytes.saturating_add(size);
                    cached_files += 1;
                    content
                }
                Err(_) => String::new(),
            }
        } else {
            String::new()
        };
        snapshot.insert(relative, CachedProjectFile { modified, size, content });
    }
    tracker.project_path = Some(project_path.to_path_buf());
    tracker.baseline = snapshot.clone();
    tracker.current = snapshot;
    tracker.changes.clear();
}

fn refresh_change_tracker(tracker: &mut ChangeTracker, project_path: &std::path::Path) {
    if tracker.project_path.as_deref() != Some(project_path) {
        initialize_change_tracker(tracker, project_path);
        return;
    }
    let mut metadata = HashMap::new();
    scan_project_metadata(project_path, project_path, &mut metadata);
    let seen: HashSet<String> = metadata.keys().cloned().collect();

    for (relative, (absolute, modified, size)) in metadata {
        let unchanged = tracker.current.get(&relative)
            .map(|cached| cached.modified == modified && cached.size == size)
            .unwrap_or(false);
        if unchanged { continue; }
        let Ok(after) = std::fs::read_to_string(absolute) else { continue; };
        tracker.current.insert(relative.clone(), CachedProjectFile { modified, size, content: after.clone() });
        let existed_in_baseline = tracker.baseline.contains_key(&relative);
        let before = tracker.baseline.get(&relative).map(|cached| cached.content.clone()).unwrap_or_default();
        if existed_in_baseline && before == after {
            tracker.changes.remove(&relative);
            continue;
        }
        let (additions, deletions) = line_change_counts(&before, &after);
        tracker.changes.insert(relative.clone(), ProjectChangeRecord {
            path: relative,
            status: if existed_in_baseline { "modified".into() } else { "added".into() },
            before,
            after,
            additions,
            deletions,
            timestamp: now_millis(),
        });
    }

    let removed: Vec<String> = tracker.current.keys().filter(|path| !seen.contains(*path)).cloned().collect();
    for relative in removed {
        let current = tracker.current.remove(&relative);
        let before = tracker.baseline.get(&relative)
            .map(|cached| cached.content.clone())
            .or_else(|| current.map(|cached| cached.content))
            .unwrap_or_default();
        let deletions = before.lines().count();
        tracker.changes.insert(relative.clone(), ProjectChangeRecord {
            path: relative,
            status: "deleted".into(),
            before,
            after: String::new(),
            additions: 0,
            deletions,
            timestamp: now_millis(),
        });
    }
}

fn find_mimo(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let mut checked: Vec<String> = Vec::new();

    // 1. Resource dir (Tauri v2 bundles resources here)
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("mimo.exe");
        checked.push(format!("resource_dir: {}", p.display()));
        if p.exists() { return Ok(p); }
        // 1b. Resource dir /resources subdirectory
        let p = dir.join("resources").join("mimo.exe");
        checked.push(format!("resource_dir/resources: {}", p.display()));
        if p.exists() { return Ok(p); }
        // 1c. Resource dir parent (if ../ is preserved in resource path)
        if let Some(parent) = dir.parent() {
            let p = parent.join("mimo.exe");
            checked.push(format!("resource_dir/..: {}", p.display()));
            if p.exists() { return Ok(p); }
        }
    }

    // 2. Alongside the running exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("mimo.exe");
            checked.push(format!("exe_dir: {}", p.display()));
            if p.exists() { return Ok(p); }
            // 2b. exe_dir /resources/ (common Tauri layout)
            let p = dir.join("resources").join("mimo.exe");
            checked.push(format!("exe_dir/resources: {}", p.display()));
            if p.exists() { return Ok(p); }
            // 2c. exe_dir /_up_/ (Tauri dev bundle)
            let p = dir.join("_up_").join("mimo.exe");
            checked.push(format!("exe_dir/_up_: {}", p.display()));
            if p.exists() { return Ok(p); }
        }
    }

    // 3. Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join("mimo.exe");
        checked.push(format!("cwd: {}", p.display()));
        if p.exists() { return Ok(p); }
        // 3b. Parent of cwd
        if let Some(parent) = cwd.parent() {
            let p = parent.join("mimo.exe");
            checked.push(format!("cwd/..: {}", p.display()));
            if p.exists() { return Ok(p); }
        }
    }

    // 4. System PATH
    if let Ok(output) = Command::new("where").arg("mimo.exe").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                checked.push(format!("PATH: {}", line));
                let p = std::path::PathBuf::from(line);
                if p.exists() { return Ok(p); }
            }
        }
    }

    Err(format!(
        "mimo.exe not found. Checked paths:\n{}",
        checked.join("\n")
    ))
}

fn verify_mimo_executable(path: &std::path::Path) -> Result<String, String> {
    let mut cmd = Command::new(path);
    cmd.arg("--version").env("NO_COLOR", "1");
    if let Some(parent) = path.parent() {
        cmd.current_dir(parent);
    }
    run_hidden(&mut cmd);

    let output = cmd.output().map_err(|error| {
        format!(
            "Không thể khởi chạy mimo.exe tại {}: {}. Hãy kiểm tra Windows Security/Defender có chặn hoặc cách ly file hay không.",
            path.display(), error
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "mimo.exe khởi động thất bại tại {} (mã thoát: {}). {}",
            path.display(),
            output.status.code().map(|code| code.to_string()).unwrap_or_else(|| "unknown".into()),
            if stderr.is_empty() { "Không có thông báo lỗi từ CLI.".into() } else { stderr }
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { "unknown".into() } else { version })
}

fn get_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn get_chats_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    let chats_dir = data_dir.join("chats");
    std::fs::create_dir_all(&chats_dir).map_err(|e| e.to_string())?;
    Ok(chats_dir)
}

fn sanitize_session_folder_name(value: &str) -> String {
    let cleaned: String = value.chars()
        .map(|character| if matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { character })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() { "_global".to_string() } else { trimmed.to_string() }
}

fn get_local_sessions_dir(app: &AppHandle, workspace_path: Option<&str>) -> Result<std::path::PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let project_name = workspace_path
        .and_then(|value| std::path::Path::new(value).file_name())
        .and_then(|value| value.to_str())
        .map(sanitize_session_folder_name)
        .unwrap_or_else(|| "_global".to_string());
    let dir = home.join("workspaces").join("session").join(project_name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn resolve_chats_dir(app: &AppHandle, workspace_path: Option<&str>) -> Result<std::path::PathBuf, String> {
    get_local_sessions_dir(app, workspace_path)
}

fn get_workspaces_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    Ok(data_dir.join("workspaces.json"))
}

fn load_workspaces_json(app: &AppHandle) -> Result<serde_json::Value, String> {
    let path = get_workspaces_path(app)?;
    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({ "workspaces": [] }))
    }
}

fn save_workspaces_json(app: &AppHandle, data: &serde_json::Value) -> Result<(), String> {
    let path = get_workspaces_path(app)?;
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_workspaces(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let data = load_workspaces_json(&app)?;
    let workspaces = data.get("workspaces")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(workspaces)
}

#[tauri::command]
fn add_workspace(app: AppHandle, path: String, name: String) -> Result<Vec<serde_json::Value>, String> {
    let mut data = load_workspaces_json(&app)?;
    let mut workspaces = data.get("workspaces")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // Check if exists, update lastOpened
    let existing_idx = workspaces.iter().position(|w| w.get("path").and_then(|v| v.as_str()) == Some(&path));
    let entry = serde_json::json!({
        "path": path,
        "name": name,
        "lastOpened": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
    });

    if let Some(idx) = existing_idx {
        workspaces[idx] = entry;
    } else {
        workspaces.push(entry);
    }

    data["workspaces"] = serde_json::json!(workspaces);
    save_workspaces_json(&app, &data)?;
    Ok(workspaces)
}

#[tauri::command]
fn remove_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let mut data = load_workspaces_json(&app)?;
    let workspaces = data.get("workspaces")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let filtered: Vec<serde_json::Value> = workspaces
        .into_iter()
        .filter(|w| w.get("path").and_then(|v| v.as_str()) != Some(&path))
        .collect();

    data["workspaces"] = serde_json::json!(filtered);
    save_workspaces_json(&app, &data)?;

    // NOTE: Chat sessions (project_path keyed) are intentionally preserved on disk
    // so that re-importing the same project folder reconnects to its existing sessions.

    Ok(())
}

#[tauri::command]
fn check_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn check_mimo_paths(app: AppHandle) -> Result<String, String> {
    let mut checked: Vec<String> = Vec::new();

    if let Ok(dir) = app.path().resource_dir() {
        checked.push(format!("resource_dir = {}", dir.display()));
        let files: Vec<_> = std::fs::read_dir(&dir)
            .map(|e| e.filter_map(|f| f.ok()).map(|f| f.file_name().to_string_lossy().to_string()).collect())
            .unwrap_or_default();
        checked.push(format!("  contains: {:?}", files));
    } else {
        checked.push("resource_dir = ERROR".into());
    }

    if let Ok(exe) = std::env::current_exe() {
        checked.push(format!("current_exe = {}", exe.display()));
        if let Some(dir) = exe.parent() {
            let files: Vec<_> = std::fs::read_dir(dir)
                .map(|e| e.filter_map(|f| f.ok()).map(|f| f.file_name().to_string_lossy().to_string()).collect())
                .unwrap_or_default();
            checked.push(format!("  exe_dir contains: {:?}", files));
            let res_dir = dir.join("resources");
            if res_dir.exists() {
                let res_files: Vec<_> = std::fs::read_dir(&res_dir)
                    .map(|e| e.filter_map(|f| f.ok()).map(|f| f.file_name().to_string_lossy().to_string()).collect())
                    .unwrap_or_default();
                checked.push(format!("  resources/ contains: {:?}", res_files));
            }
        }
    } else {
        checked.push("current_exe = ERROR".into());
    }

    if let Ok(cwd) = std::env::current_dir() {
        checked.push(format!("cwd = {}", cwd.display()));
    }

    Ok(checked.join("\n"))
}

#[tauri::command]
fn start_mimo(app: AppHandle, state: State<MimoProcess>) -> Result<String, String> {
    let mut path_guard = state.mimo_path.lock().map_err(|e| e.to_string())?;
    if path_guard.is_some() {
        return Ok("already_started".into());
    }

    // Check custom path first (user-imported)
    let custom = state.custom_path.lock().map_err(|e| e.to_string())?;
    let mimo_path = match custom.as_ref() {
        Some(cp) if cp.exists() => cp.clone(),
        _ => find_mimo(&app)?,
    };
    let mimo_path = mimo_path.canonicalize().unwrap_or(mimo_path);
    verify_mimo_executable(&mimo_path)?;

    *path_guard = Some(mimo_path);
    Ok("started".into())
}

#[tauri::command]
fn set_mimo_path(state: State<MimoProcess>, path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    let mut guard = state.custom_path.lock().map_err(|e| e.to_string())?;
    *guard = Some(p);
    Ok("saved".into())
}

#[tauri::command]
fn get_mimo_path(state: State<MimoProcess>) -> Result<Option<String>, String> {
    let custom = state.custom_path.lock().map_err(|e| e.to_string())?;
    if let Some(p) = custom.as_ref() {
        return Ok(Some(p.to_string_lossy().to_string()));
    }
    let registered = state.mimo_path.lock().map_err(|e| e.to_string())?;
    Ok(registered.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn reset_mimo_path(state: State<MimoProcess>) -> Result<(), String> {
    let mut guard = state.custom_path.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn ensure_workspace(path: String) -> Result<String, String> {
    let dir = std::path::Path::new(&path);
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create workspace: {}", e))?;
    Ok(path)
}

#[tauri::command]
fn set_project_path(state: State<MimoProcess>, path: Option<String>) -> Result<(), String> {
    let mut guard = state.project_path.lock().map_err(|e| e.to_string())?;
    *guard = path.map(std::path::PathBuf::from);
    Ok(())
}

#[tauri::command]
fn reset_project_change_tracking(state: State<MimoProcess>, project_path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(project_path);
    let mut tracker = state.change_tracker.lock().map_err(|e| e.to_string())?;
    refresh_change_tracker(&mut tracker, &path);
    tracker.baseline = tracker.current.clone();
    tracker.changes.clear();
    Ok(())
}

#[tauri::command]
fn poll_project_changes(state: State<MimoProcess>, project_path: String) -> Result<Vec<serde_json::Value>, String> {
    let path = std::path::PathBuf::from(project_path);
    let mut tracker = state.change_tracker.lock().map_err(|e| e.to_string())?;
    refresh_change_tracker(&mut tracker, &path);
    let mut changes: Vec<_> = tracker.changes.values().cloned().collect();
    changes.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(changes.into_iter().map(|change| json!({
        "path": change.path,
        "status": change.status,
        "before": change.before,
        "after": change.after,
        "additions": change.additions,
        "deletions": change.deletions,
        "timestamp": change.timestamp,
    })).collect())
}

#[tauri::command]
fn get_mimo_session_id(state: State<MimoProcess>) -> Result<Option<String>, String> {
    state.session_id.lock().map_err(|e| e.to_string()).map(|guard| guard.clone())
}

#[tauri::command]
fn set_mimo_session_id(state: State<MimoProcess>, session_id: Option<String>) -> Result<(), String> {
    let mut guard = state.session_id.lock().map_err(|e| e.to_string())?;
    *guard = session_id.filter(|value| !value.trim().is_empty());
    Ok(())
}

#[tauri::command]
fn get_project_path(state: State<MimoProcess>) -> Result<Option<String>, String> {
    let guard = state.project_path.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn read_project_file(state: State<MimoProcess>, relative_path: String) -> Result<String, String> {
    let guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let project = guard.as_ref().ok_or("No project open")?;
    let full_path = project.join(&relative_path);
    if !full_path.exists() {
        return Err(format!("File not found: {}", relative_path));
    }
    if full_path.is_dir() {
        let mut entries = Vec::new();
        if let Ok(read_dir) = std::fs::read_dir(&full_path) {
            for entry in read_dir.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = entry.path().is_dir();
                entries.push(if is_dir { format!("{}/", name) } else { name });
            }
        }
        entries.sort();
        return Ok(entries.join("\n"));
    }
    std::fs::read_to_string(&full_path).map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
fn write_project_file_rel(state: State<MimoProcess>, relative_path: String, content: String) -> Result<String, String> {
    let guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let project = guard.as_ref().ok_or("No project open")?;
    let full_path = project.join(&relative_path);
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full_path, &content).map_err(|e| format!("Cannot write file: {}", e))?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn send_mimo_message(
    app: AppHandle,
    state: State<'_, MimoProcess>,
    message: String,
    model: Option<String>,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    let mimo_path = {
        let guard = state.mimo_path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("MiMo not started. Call start_mimo first.")?
    };

    {
        let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(mut old_child) = child_guard.take() {
            let _ = old_child.kill();
            let _ = old_child.wait();
        }
    }

    let session_id = {
        let guard = state.session_id.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let mut args = vec![
        "run".to_string(),
        "-".to_string(),
        "--format".to_string(),
        "json".to_string(),
        "--pure".to_string(),
        "--thinking".to_string(),
    ];

    if let Some(ref sid) = session_id {
        args.push("--session".to_string());
        args.push(sid.clone());
    }

    if let Some(ref m) = model {
        args.push("--model".to_string());
        args.push(m.clone());
    }

    if let Some(ref file_list) = files {
        for file_path in file_list {
            args.push("-f".to_string());
            args.push(file_path.clone());
        }
    }

    let project_dir = {
        let guard = state.project_path.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let mut cmd = Command::new(&mimo_path);
    cmd.args(&args)
        .env("NO_COLOR", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(ref p) = project_dir {
        cmd.current_dir(p);
    } else if let Ok(data_dir) = get_data_dir(&app) {
        let runtime_dir = data_dir.join("runtime");
        let _ = std::fs::create_dir_all(&runtime_dir);
        cmd.current_dir(runtime_dir);
    }
    run_hidden(&mut cmd);
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn mimo: {}", e))?;

    // Write message to stdin to avoid Windows command-line length limit
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(message.as_bytes());
    }

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take();

    {
        let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
        *child_guard = Some(child);
    }

    let session_id_for_thread = state.session_id.clone();
    let app_handle = app.clone();

    if let Some(stderr) = stderr {
        let error_app_handle = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let lines: Vec<String> = reader.lines().filter_map(Result::ok).filter(|line| !line.trim().is_empty()).collect();
            if !lines.is_empty() {
                let _ = error_app_handle.emit("mimo-event", json!({
                    "type": "error",
                    "message": lines.join("\n")
                }));
            }
        });
    }

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                        let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match event_type {
                            "step_start" => {
                                let _ = app_handle.emit("mimo-event", json!({
                                    "type": "step_start"
                                }));
                            }
                            "text" => {
                                if let Some(part) = event.get("part") {
                                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                        let _ = app_handle.emit("mimo-event", json!({
                                            "type": "delta",
                                            "text": text
                                        }));
                                    }
                                }
                            }
                            "reasoning" => {
                                if let Some(part) = event.get("part") {
                                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                        let _ = app_handle.emit("mimo-event", json!({
                                            "type": "reasoning",
                                            "text": text
                                        }));
                                    }
                                }
                            }
                            "tool_use" | "tool_result" => {
                                let detail = event.get("part").and_then(|p| {
                                    let name = p.get("name")
                                        .or_else(|| p.get("tool"))
                                        .or_else(|| p.get("toolName"))
                                        .or_else(|| p.get("tool_name"))
                                        .and_then(|n| n.as_str())
                                        .unwrap_or("Tool");
                                    let status = if event_type == "tool_use" { "running" } else { "success" };
                                    let payload = p.get("input")
                                        .or_else(|| p.get("output"))
                                        .or_else(|| p.get("state").and_then(|s| s.get("input")))
                                        .or_else(|| p.get("state").and_then(|s| s.get("output")));
                                    let detail = payload.map(|value| {
                                        let raw = value.as_str()
                                            .map(ToOwned::to_owned)
                                            .unwrap_or_else(|| serde_json::to_string(value).unwrap_or_default());
                                        let mut compact: String = raw.chars().take(8000).collect();
                                        if raw.chars().count() > 8000 {
                                            compact.push_str("...");
                                        }
                                        compact
                                    });
                                    Some(json!({
                                        "type": "task_info",
                                        "name": name,
                                        "status": status,
                                        "detail": detail,
                                    }))
                                });
                                if let Some(d) = detail {
                                    let _ = app_handle.emit("mimo-event", d);
                                }
                            }
                            "step_finish" => {
                                if let Some(part) = event.get("part") {
                                    if let Some(sid) = part.get("sessionID").and_then(|s| s.as_str()) {
                                        if let Ok(mut guard) = session_id_for_thread.lock() {
                                            *guard = Some(sid.to_string());
                                        }
                                    }
                                }
                                let tokens = event.get("part").and_then(|p| p.get("tokens"));
                                let _ = app_handle.emit("mimo-event", json!({
                                    "type": "done",
                                    "tokens": tokens
                                }));
                            }
                            _ => {
                                let _ = app_handle.emit("mimo-event", json!({
                                    "type": "task_info",
                                    "name": event_type,
                                }));
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app_handle.emit("mimo-event", json!({
                        "type": "error",
                        "message": e.to_string()
                    }));
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_mimo(state: State<MimoProcess>) -> Result<(), String> {
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    let mut session_guard = state.session_id.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *session_guard = None;
    Ok(())
}

#[tauri::command]
async fn list_mimo_models(_app: AppHandle, state: State<'_, MimoProcess>) -> Result<Vec<serde_json::Value>, String> {
    let mimo_path = {
        let guard = state.mimo_path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("MiMo not started.")?
    };
    let mut cmd = Command::new(&mimo_path);
    cmd.arg("models").env("NO_COLOR", "1");
    if let Some(parent) = mimo_path.parent() {
        cmd.current_dir(parent);
    }
    run_hidden(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run mimo models: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "mimo models thất bại (mã thoát: {}): {}",
            output.status.code().map(|code| code.to_string()).unwrap_or_else(|| "unknown".into()),
            if stderr.is_empty() { "Không có thông báo lỗi từ CLI.".into() } else { stderr }
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    for line in stdout.lines() {
        let line = line.trim().to_string();
        if line.is_empty() || line.starts_with('─') || line.starts_with('│') || line.starts_with('╔') || line.starts_with('╚') || line.starts_with("Name") || line.starts_with("Available") {
            continue;
        }
        if line.contains('/') {
            let parts: Vec<&str> = line.splitn(2, '/').collect();
            let provider = parts.first().unwrap_or(&"").trim();
            let model_name = parts.get(1).unwrap_or(&"").trim();
            let full_id = format!("{}/{}", provider, model_name);
            models.push(json!({
                "model_id": full_id,
                "model_name": model_name,
                "display_name": model_name,
                "description": format!("{} model", provider),
                "is_available": true
            }));
        }
    }
    Ok(models)
}

// ============ Chat History Commands ============

#[tauri::command]
fn list_chats_on_disk(app: AppHandle, project_path: Option<String>, workspace_path: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let mut chats = Vec::new();
    let mut dirs = Vec::new();

    dirs.push(get_local_sessions_dir(&app, workspace_path.as_deref())?);
    dirs.push(get_chats_dir(&app)?);
    if let Some(wp) = &workspace_path {
        let p = std::path::Path::new(wp);
        if p.exists() {
            let ws_dir = p.join(".mimo").join("chats");
            if ws_dir.exists() {
                dirs.push(ws_dir);
            }
        }
    }

    for chats_dir in &dirs {
        if let Ok(entries) = std::fs::read_dir(chats_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                            let cid = data.get("sessionId").or_else(|| data.get("cid")).and_then(|v| v.as_str()).unwrap_or("");
                            if cid.is_empty() || chats.iter().any(|c: &serde_json::Value| c.get("cid").and_then(|v| v.as_str()) == Some(cid)) {
                                continue;
                            }
                            let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("Cuộc trò chuyện");
                            let timestamp = data.get("updatedAt").or_else(|| data.get("timestamp")).and_then(|v| v.as_i64()).unwrap_or(0);
                            let is_pinned = data.get("is_pinned").and_then(|v| v.as_bool()).unwrap_or(false);
                            let model = data.get("modelSettings").and_then(|v| v.get("model")).or_else(|| data.get("model")).and_then(|v| v.as_str()).unwrap_or("");
                            let session_id = data.get("runtimeSessionId").or_else(|| data.get("session_id")).and_then(|v| v.as_str()).unwrap_or("");
                            let chat_project_path = data.get("workspacePath").or_else(|| data.get("project_path")).and_then(|v| v.as_str()).unwrap_or("");

                            if let Some(ref filter_path) = project_path {
                                if chat_project_path != filter_path.as_str() {
                                    continue;
                                }
                            }
                            chats.push(json!({
                                "cid": cid,
                                "title": title,
                                "is_pinned": is_pinned,
                                "timestamp": timestamp,
                                "model": model,
                                "session_id": session_id,
                                "project_path": chat_project_path,
                            }));
                        }
                    }
                }
            }
        }
    }

    chats.sort_by(|a, b| {
        let ts_a = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let ts_b = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        ts_b.cmp(&ts_a)
    });

    Ok(chats)
}

#[tauri::command]
fn load_chat_from_disk(app: AppHandle, cid: String, workspace_path: Option<String>) -> Result<serde_json::Value, String> {
    let chats_dir = resolve_chats_dir(&app, workspace_path.as_deref())?;
    let path = chats_dir.join(format!("{}.json", cid));

    if !path.exists() {
        let mut fallbacks = vec![get_chats_dir(&app)?.join(format!("{}.json", cid))];
        if let Some(workspace) = workspace_path.as_deref() {
            fallbacks.push(std::path::Path::new(workspace).join(".mimo").join("chats").join(format!("{}.json", cid)));
        }
        for fallback in fallbacks {
            if fallback.exists() {
                let content = std::fs::read_to_string(&fallback).map_err(|e| e.to_string())?;
                let mut data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
                if data.get("cid").is_none() { data["cid"] = json!(cid); }
                if data.get("session_id").is_none() {
                    data["session_id"] = data.get("runtimeSessionId").cloned().unwrap_or(json!(""));
                }
                return Ok(data);
            }
        }
        return Err(format!("Chat {} not found", cid));
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if data.get("cid").is_none() { data["cid"] = json!(cid); }
    if data.get("session_id").is_none() {
        data["session_id"] = data.get("runtimeSessionId").cloned().unwrap_or(json!(""));
    }
    Ok(data)
}

#[tauri::command]
fn save_chat_to_disk(
    app: AppHandle,
    cid: String,
    title: String,
    messages: String,
    model: Option<String>,
    session_id: Option<String>,
    is_pinned: Option<bool>,
    project_path: Option<String>,
    workspace_path: Option<String>,
    model_settings: Option<String>,
) -> Result<String, String> {
    let chats_dir = resolve_chats_dir(&app, workspace_path.as_deref())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let parsed_messages: serde_json::Value =
        serde_json::from_str(&messages).unwrap_or(json!([]));

    let path = chats_dir.join(format!("{}.json", cid));
    let existing = if path.exists() {
        std::fs::read_to_string(&path).ok().and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
    } else { None };
    let created_at = existing.as_ref().and_then(|data| data.get("createdAt")).and_then(|value| value.as_i64()).unwrap_or(timestamp);
    let parsed_model_settings = model_settings
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .unwrap_or_else(|| json!({ "model": model.clone().unwrap_or_default() }));
    let workspace = project_path.clone().unwrap_or_default();
    let runtime_session = session_id.unwrap_or_default();
    let data = json!({
        "sessionId": cid,
        "cid": cid,
        "title": title,
        "createdAt": created_at,
        "updatedAt": timestamp,
        "workspacePath": workspace,
        "modelSettings": parsed_model_settings,
        "messages": parsed_messages,
        "model": model.unwrap_or_default(),
        "runtimeSessionId": runtime_session,
        "session_id": runtime_session,
        "is_pinned": is_pinned.unwrap_or(false),
        "project_path": workspace,
        "timestamp": timestamp,
    });

    std::fs::write(
        &path,
        serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_chat_from_disk(app: AppHandle, cid: String, workspace_path: Option<String>) -> Result<(), String> {
    let mut candidates = vec![
        resolve_chats_dir(&app, workspace_path.as_deref())?,
        get_chats_dir(&app)?,
    ];
    if let Some(workspace) = workspace_path.as_deref() {
        candidates.push(PathBuf::from(workspace).join(".mimo").join("chats"));
    }
    for directory in candidates {
        let path = directory.join(format!("{}.json", cid));
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn find_chat_file(app: &AppHandle, cid: &str, workspace_path: Option<&str>) -> Result<Option<PathBuf>, String> {
    let mut directories = vec![resolve_chats_dir(app, workspace_path)?, get_chats_dir(app)?];
    if let Some(workspace) = workspace_path {
        directories.push(PathBuf::from(workspace).join(".mimo").join("chats"));
    }
    Ok(directories
        .into_iter()
        .map(|directory| directory.join(format!("{}.json", cid)))
        .find(|path| path.exists()))
}

#[tauri::command]
fn update_chat_pinned(app: AppHandle, cid: String, is_pinned: bool, workspace_path: Option<String>) -> Result<(), String> {
    let Some(path) = find_chat_file(&app, &cid, workspace_path.as_deref())? else {
        return Ok(());
    };
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    data["is_pinned"] = json!(is_pinned);
    std::fs::write(&path, serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_chat_title(app: AppHandle, cid: String, title: String, workspace_path: Option<String>) -> Result<(), String> {
    let Some(path) = find_chat_file(&app, &cid, workspace_path.as_deref())? else {
        return Ok(());
    };
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    data["title"] = json!(title);
    std::fs::write(&path, serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

// ============ Utility Commands ============

#[tauri::command]
fn save_file(app: AppHandle, filename: String, content: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let downloads_dir = data_dir.join("downloads");
    std::fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;
    let path = downloads_dir.join(&filename);
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file_to_subdir(app: AppHandle, subdir: String, filename: String, content: Vec<u8>) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target_dir = data_dir.join("downloads").join(&subdir);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let path = target_dir.join(&filename);
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_downloads_dir(app: AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let downloads_dir = data_dir.join("downloads");
    std::fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;
    Ok(downloads_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_subtitle_dir(app: AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let subtitle_dir = data_dir.join("downloads").join("subtitle");
    std::fs::create_dir_all(&subtitle_dir).map_err(|e| e.to_string())?;
    Ok(subtitle_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}

// ============ Project Agent ============

fn scan_directory(dir: &std::path::Path, prefix: &str, max_depth: usize, current_depth: usize) -> Vec<String> {
    let mut entries = Vec::new();
    if current_depth > max_depth {
        return entries;
    }

    let ignore_dirs: Vec<&str> = vec![
        "node_modules", ".git", "__pycache__", ".venv", "venv",
        "dist", "build", ".next", ".nuxt", "target", ".cache",
        "coverage", ".idea", ".vscode", "vendor",
    ];

    if let Ok(read_dir) = std::fs::read_dir(dir) {
        let mut items: Vec<_> = read_dir.flatten().collect();
        items.sort_by(|a, b| {
            let a_is_dir = a.path().is_dir();
            let b_is_dir = b.path().is_dir();
            b_is_dir.cmp(&a_is_dir).then(a.file_name().cmp(&b.file_name()))
        });

        for item in items {
            let name = item.file_name().to_string_lossy().to_string();
            let path = item.path();
            let is_dir = path.is_dir();

            // Skip ignored directories
            if is_dir && ignore_dirs.contains(&name.as_str()) {
                continue;
            }

            // Skip hidden files/dirs (except .env, .gitignore, etc.)
            if name.starts_with('.') && name != ".env" && name != ".gitignore" && name != ".eslintrc" && name != ".prettierrc" {
                continue;
            }

            if is_dir {
                entries.push(format!("{}/{}", prefix, name));
                let sub_entries = scan_directory(&path, &format!("{}{}", prefix, name), max_depth, current_depth + 1);
                entries.extend(sub_entries);
            } else {
                // Get file size
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let size_str = if size < 1024 {
                    format!("{}B", size)
                } else if size < 1024 * 1024 {
                    format!("{}KB", size / 1024)
                } else {
                    format!("{}MB", size / (1024 * 1024))
                };
                entries.push(format!("{}/{} [{}]", prefix, name, size_str));
            }
        }
    }

    entries
}

#[tauri::command]
fn scan_project_folder(folder_path: String) -> Result<serde_json::Value, String> {
    let path = std::path::Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    let folder_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project");

    let entries = scan_directory(path, "", 4, 0);

    // Count files and folders
    let file_count = entries.iter().filter(|e| !e.ends_with('/')).count();
    let folder_count = entries.len() - file_count;

    // Build tree string
    let mut tree = format!("{}\n", folder_name);
    for (i, entry) in entries.iter().enumerate() {
        let is_last = i == entries.len() - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let trimmed = entry.trim_start_matches('/');
        tree.push_str(&format!("{}{}{}\n", connector, trimmed, if entry.ends_with('/') { "/" } else { "" }));
    }

    Ok(json!({
        "folder": folder_name,
        "path": folder_path,
        "tree": tree,
        "file_count": file_count,
        "folder_count": folder_count,
        "entries": entries,
    }))
}

#[tauri::command]
fn read_file_content(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
fn write_project_file(file_path: String, content: String) -> Result<String, String> {
    // Ensure parent directory exists
    let path = std::path::Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&file_path, &content).map_err(|e| format!("Cannot write file: {}", e))?;
    Ok(file_path.to_string())
}

#[tauri::command]
fn list_project_files(folder_path: String) -> Result<Vec<serde_json::Value>, String> {
    let path = std::path::Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    let ignore_dirs: Vec<&str> = vec![
        "node_modules", ".git", "__pycache__", ".venv", "venv",
        "dist", "build", ".next", ".nuxt", "target", ".cache",
    ];

    let mut files = Vec::new();
    fn walk_dir(dir: &std::path::Path, base: &std::path::Path, ignore: &[&str], files: &mut Vec<serde_json::Value>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if path.is_dir() {
                    if !ignore.contains(&name.as_str()) && !name.starts_with('.') {
                        walk_dir(&path, base, ignore, files);
                    }
                } else if !name.starts_with('.') {
                    let relative = path.strip_prefix(base).unwrap_or(&path);
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    files.push(json!({
                        "path": relative.to_string_lossy(),
                        "name": name,
                        "size": size,
                        "ext": ext,
                    }));
                }
            }
        }
    }

    walk_dir(path, path, &ignore_dirs, &mut files);
    Ok(files)
}

// ============ SRT Translation ============

struct SrtBlock {
    index: String,
    timecode: String,
    text: String,
}

fn parse_srt(content: &str) -> Vec<SrtBlock> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        // Skip empty lines
        if line.is_empty() {
            i += 1;
            continue;
        }

        // Check if this is an index line (number)
        if line.parse::<u32>().is_ok() {
            let index = line.to_string();
            i += 1;

            // Next line should be timecode
            if i < lines.len() {
                let timecode = lines[i].trim().to_string();
                i += 1;

                // Collect text lines until empty line or next index
                let mut text_lines = Vec::new();
                while i < lines.len() {
                    let text_line = lines[i].trim();
                    if text_line.is_empty() || text_line.parse::<u32>().is_ok() {
                        break;
                    }
                    text_lines.push(text_line);
                    i += 1;
                }

                blocks.push(SrtBlock {
                    index,
                    timecode,
                    text: text_lines.join("\n"),
                });
                continue;
            }
        }
        i += 1;
    }

    blocks
}

fn reassemble_srt(blocks: &[SrtBlock]) -> String {
    let mut result = String::new();
    for (i, block) in blocks.iter().enumerate() {
        if i > 0 {
            result.push('\n');
        }
        result.push_str(&format!("{}\n{}\n{}\n", block.index, block.timecode, block.text));
    }
    result
}

#[tauri::command]
async fn translate_srt(
    app: AppHandle,
    state: State<'_, MimoProcess>,
    file_path: String,
    target_lang: String,
) -> Result<String, String> {
    let mimo_path = {
        let guard = state.mimo_path.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("MiMo not started.")?
    };

    // Read SRT file
    let content = std::fs::read_to_string(&file_path).map_err(|e| format!("Cannot read file: {}", e))?;

    // Parse SRT
    let blocks = parse_srt(&content);
    if blocks.is_empty() {
        return Err("No subtitle blocks found in SRT file".to_string());
    }

    let total = blocks.len();
    let batch_size = 40;
    let lang_name = match target_lang.as_str() {
        "vi" => "Vietnamese",
        "en" => "English",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh" => "Chinese",
        "fr" => "French",
        "de" => "German",
        "es" => "Spanish",
        "th" => "Thai",
        _ => &target_lang,
    };

    let mut translated_blocks: Vec<SrtBlock> = Vec::new();

    // Process in batches
    for (batch_idx, chunk) in blocks.chunks(batch_size).enumerate() {
        let start_idx = batch_idx * batch_size;

        // Build numbered text for translation
        let mut numbered_text = String::new();
        for item in chunk.iter().enumerate() {
            let line_num = start_idx + item.0 + 1;
            let text = item.1.text.replace('\n', " ");
            numbered_text.push_str(&format!("{}: {}\n", line_num, text));
        }

        let prompt = format!(
            "Translate the following numbered subtitle lines to {}. \
             IMPORTANT RULES:\n\
             - Return ONLY the translations, one per line\n\
             - Keep the line numbers exactly as provided\n\
             - Preserve the meaning and tone\n\
             - Keep proper nouns and technical terms as-is if no standard translation exists\n\
             - Do NOT add any explanations or extra text\n\
             - Format: number: translated text\n\n\
             {}",
            lang_name, numbered_text
        );

        // Call MiMo
        let mut args = vec![
            "run".to_string(),
            prompt,
            "--format".to_string(),
            "json".to_string(),
            "--pure".to_string(),
        ];

        let session_id = {
            let guard = state.session_id.lock().map_err(|e| e.to_string())?;
            guard.clone()
        };
        if let Some(ref sid) = session_id {
            args.push("--session".to_string());
            args.push(sid.clone());
        }

        let mut cmd = Command::new(&mimo_path);
        cmd.args(&args);
        run_hidden(&mut cmd);
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run mimo: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Parse JSON output to extract text
        let mut translated_text = String::new();
        for line in stdout.lines() {
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(line) {
                if event.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(part) = event.get("part") {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            translated_text.push_str(text);
                        }
                    }
                }
            }
        }

        // Parse translated lines
        let mut translated_map: std::collections::HashMap<u32, String> = std::collections::HashMap::new();
        for line in translated_text.lines() {
            let line = line.trim();
            if let Some(colon_pos) = line.find(':') {
                let num_str = line[..colon_pos].trim();
                let text = line[colon_pos + 1..].trim();
                if let Ok(num) = num_str.parse::<u32>() {
                    translated_map.insert(num, text.to_string());
                }
            }
        }

        // Build translated blocks
        for (i, block) in chunk.iter().enumerate() {
            let line_num = (start_idx + i + 1) as u32;
            let translated = translated_map.get(&line_num)
                .cloned()
                .unwrap_or_else(|| block.text.clone());

            translated_blocks.push(SrtBlock {
                index: block.index.clone(),
                timecode: block.timecode.clone(),
                text: translated,
            });
        }

        // Emit progress
        let progress = ((batch_idx + 1) * batch_size).min(total);
        let _ = app.emit("srt-progress", json!({
            "current": progress,
            "total": total,
            "percent": (progress as f64 / total as f64 * 100.0) as u32,
        }));
    }

    // Reassemble SRT
    let result = reassemble_srt(&translated_blocks);

    // Save translated file to downloads/subtitle/
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let subtitle_dir = data_dir.join("downloads").join("subtitle");
    std::fs::create_dir_all(&subtitle_dir).map_err(|e| e.to_string())?;

    let file_name = std::path::Path::new(&file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("subtitle");
    let output_path = subtitle_dir.join(format!("{}_{}.srt", file_name, target_lang));
    let output_str = output_path.to_string_lossy().to_string();

    std::fs::write(&output_path, &result).map_err(|e| format!("Cannot write file: {}", e))?;

    Ok(output_str)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(MimoProcess {
            child: Mutex::new(None),
            session_id: Arc::new(Mutex::new(None)),
            mimo_path: Mutex::new(None),
            custom_path: Mutex::new(None),
            project_path: Mutex::new(None),
            change_tracker: Mutex::new(ChangeTracker::default()),
        })
        .invoke_handler(tauri::generate_handler![
            start_mimo,
            check_mimo_paths,
            check_path_exists,
            set_mimo_path,
            get_mimo_path,
            reset_mimo_path,
            set_project_path,
            get_project_path,
            reset_project_change_tracking,
            poll_project_changes,
            get_mimo_session_id,
            set_mimo_session_id,
            read_project_file,
            write_project_file_rel,
            send_mimo_message,
            stop_mimo,
            list_mimo_models,
            list_chats_on_disk,
            load_chat_from_disk,
            save_chat_to_disk,
            delete_chat_from_disk,
            update_chat_pinned,
            update_chat_title,
            save_file,
            save_file_to_subdir,
            get_downloads_dir,
            get_subtitle_dir,
            open_folder,
            translate_srt,
            ensure_workspace,
            list_workspaces,
            add_workspace,
            remove_workspace,
            scan_project_folder,
            read_file_content,
            write_project_file,
            list_project_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
