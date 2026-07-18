use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};

use grep_regex::RegexMatcherBuilder;
use grep_searcher::sinks::UTF8;
use grep_searcher::SearcherBuilder;
use ignore::WalkBuilder;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

pub struct AppData {
    pub root: Option<PathBuf>,
    pub watcher: Option<RecommendedWatcher>,
}

pub type AppState = Mutex<AppData>;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CommandError {
    /// The file changed on disk since it was read. The UI must surface a
    /// conflict banner — never silently clobber (PLAN.md §8, Drive sync).
    Conflict {
        current_mtime_ms: u64,
    },
    NoRoot,
    OutsideRoot,
    Io {
        message: String,
    },
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        CommandError::Io {
            message: e.to_string(),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub path: String,
    pub name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub parent: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub mtime_ms: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: u64,
    pub text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkIndexEntry {
    pub stem: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsChange {
    pub kind: String,
    pub paths: Vec<String>,
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn now_store_root(app: &AppHandle, root: &Path) {
    if let Ok(store) = app.store("settings.json") {
        store.set("root", root.to_string_lossy().to_string());
        let _ = store.save();
    }
}

pub fn load_persisted_root(app: &AppHandle) -> Option<PathBuf> {
    let store = app.store("settings.json").ok()?;
    let value = store.get("root")?;
    let path = PathBuf::from(value.as_str()?);
    path.is_dir().then_some(path)
}

/// Resolve a root-relative path to an absolute one, refusing traversal
/// outside the root. All commands taking a `path` go through this.
fn resolve(state: &State<AppState>, rel: &str) -> Result<(PathBuf, PathBuf), CommandError> {
    let root = state
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or(CommandError::NoRoot)?;
    let joined = root.join(rel);
    let mut clean = PathBuf::new();
    for comp in joined.components() {
        match comp {
            std::path::Component::ParentDir => {
                if !clean.pop() {
                    return Err(CommandError::OutsideRoot);
                }
            }
            std::path::Component::CurDir => {}
            other => clean.push(other),
        }
    }
    if !clean.starts_with(&root) {
        return Err(CommandError::OutsideRoot);
    }
    Ok((root, clean))
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("markdown")
    )
}

// Must be async: blocking_pick_folder() needs the OS to present the panel on
// the main thread while this call waits for a result. A synchronous command
// runs inline on the thread that received the IPC call (the main thread on
// macOS), so it would be waiting on itself — a deadlock, seen as a freeze.
// Marking the command async moves it onto Tauri's task runtime instead.
#[tauri::command]
pub async fn pick_root(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<RootInfo>, CommandError> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|e| CommandError::Io {
        message: e.to_string(),
    })?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    now_store_root(&app, &path);
    state.lock().unwrap().root = Some(path.clone());
    Ok(Some(RootInfo {
        path: path.to_string_lossy().to_string(),
        name,
    }))
}

#[tauri::command]
pub fn current_root(state: State<AppState>) -> Option<RootInfo> {
    let guard = state.lock().unwrap();
    guard.root.as_ref().map(|path| RootInfo {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

/// Recursive listing of markdown files and the directories that lead to
/// them. Hidden files skipped, .gitignore honoured. Flat list with parent
/// pointers — cheap for the frontend to diff.
#[tauri::command]
pub fn read_tree(state: State<AppState>) -> Result<Vec<TreeNode>, CommandError> {
    let root = state
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or(CommandError::NoRoot)?;

    let mut nodes = Vec::new();
    for entry in WalkBuilder::new(&root).hidden(true).build().flatten() {
        let path = entry.path();
        if path == root {
            continue;
        }
        let is_dir = entry.file_type().is_some_and(|t| t.is_dir());
        if !is_dir && !is_markdown(path) {
            continue;
        }
        let rel = relative(&root, path);
        let parent = path
            .parent()
            .filter(|p| *p != root)
            .map(|p| relative(&root, p));
        nodes.push(TreeNode {
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            path: rel,
            is_dir,
            parent,
        });
    }

    // Drop directories that contain no markdown anywhere beneath them.
    let file_paths: Vec<&str> = nodes
        .iter()
        .filter(|n| !n.is_dir)
        .map(|n| n.path.as_str())
        .collect();
    let keep: Vec<bool> = nodes
        .iter()
        .map(|n| {
            !n.is_dir
                || file_paths
                    .iter()
                    .any(|f| f.starts_with(&format!("{}/", n.path)))
        })
        .collect();
    let mut idx = 0;
    nodes.retain(|_| {
        let k = keep[idx];
        idx += 1;
        k
    });

    Ok(nodes)
}

#[tauri::command]
pub fn read_file(state: State<AppState>, path: String) -> Result<FileContent, CommandError> {
    let (_root, abs) = resolve(&state, &path)?;
    let content = std::fs::read_to_string(&abs)?;
    let meta = std::fs::metadata(&abs)?;
    Ok(FileContent {
        content,
        mtime_ms: mtime_ms(&meta),
    })
}

/// Atomic write shared by every command that puts bytes on disk: write to a
/// temp file in the same directory, then rename over the target. Rename is
/// atomic on the same filesystem, so a reader (or Drive sync) never sees a
/// half-written file. This is the ONLY place that touches a file for
/// writing — write_file and create_file both funnel through it.
fn atomic_write(abs: &Path, content: &str) -> Result<(), CommandError> {
    let dir = abs.parent().ok_or(CommandError::OutsideRoot)?;
    let file_name = abs
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{file_name}.folio-tmp"));
    std::fs::write(&tmp, content)?;
    std::fs::rename(&tmp, abs)?;
    Ok(())
}

/// Atomic, conflict-checked write: refuse if the file's mtime moved since
/// it was read (Drive sync can replace files mid-edit), then write to a
/// temp file in the same directory and rename over the original.
#[tauri::command]
pub fn write_file(
    state: State<AppState>,
    path: String,
    content: String,
    expected_mtime_ms: u64,
) -> Result<FileContent, CommandError> {
    let (_root, abs) = resolve(&state, &path)?;

    if abs.exists() {
        let current = mtime_ms(&std::fs::metadata(&abs)?);
        if current != expected_mtime_ms {
            return Err(CommandError::Conflict {
                current_mtime_ms: current,
            });
        }
    }

    atomic_write(&abs, &content)?;

    let meta = std::fs::metadata(&abs)?;
    Ok(FileContent {
        content,
        mtime_ms: mtime_ms(&meta),
    })
}

/// Create a new file with a minimal `# Title` heading derived from the
/// filename stem. Refuses if the target already exists (Io error) — this is
/// the new-file flow, never an overwrite. Parent directories inside the
/// root are created as needed (e.g. creating `notes/today.md` when `notes/`
/// doesn't exist yet). Goes through the same atomic_write helper as
/// write_file — there is only ever one write path.
#[tauri::command]
pub fn create_file(state: State<AppState>, path: String) -> Result<FileContent, CommandError> {
    let (_root, abs) = resolve(&state, &path)?;

    if abs.exists() {
        return Err(CommandError::Io {
            message: format!("{path} already exists"),
        });
    }

    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }

    let stem = abs
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string());
    let content = format!("# {stem}\n");

    atomic_write(&abs, &content)?;

    let meta = std::fs::metadata(&abs)?;
    Ok(FileContent {
        content,
        mtime_ms: mtime_ms(&meta),
    })
}

/// Rename/move a file within the root. Refuses if the target already
/// exists or either path escapes the root (both go through `resolve`).
#[tauri::command]
pub fn rename_file(state: State<AppState>, from: String, to: String) -> Result<(), CommandError> {
    let (_root, abs_from) = resolve(&state, &from)?;
    let (_root2, abs_to) = resolve(&state, &to)?;

    if !abs_from.exists() {
        return Err(CommandError::Io {
            message: format!("{from} does not exist"),
        });
    }
    if abs_to.exists() {
        return Err(CommandError::Io {
            message: format!("{to} already exists"),
        });
    }

    if let Some(dir) = abs_to.parent() {
        std::fs::create_dir_all(dir)?;
    }

    std::fs::rename(&abs_from, &abs_to)?;
    Ok(())
}

/// Move a file to the system trash/bin rather than deleting it outright —
/// mistakes should be recoverable from Finder's Bin, not gone forever.
#[tauri::command]
pub fn delete_file(state: State<AppState>, path: String) -> Result<(), CommandError> {
    let (_root, abs) = resolve(&state, &path)?;

    if !abs.exists() {
        return Err(CommandError::Io {
            message: format!("{path} does not exist"),
        });
    }

    trash::delete(&abs).map_err(|e| CommandError::Io {
        message: e.to_string(),
    })?;
    Ok(())
}

/// Watch the root and emit debounced `fs-changed` events. Replaces any
/// previous watcher (root changes). Events aggregate over a 300ms window.
#[tauri::command]
pub fn watch_root(app: AppHandle, state: State<AppState>) -> Result<(), CommandError> {
    let root = state
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or(CommandError::NoRoot)?;

    let (tx, rx) = mpsc::channel::<notify::Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| CommandError::Io {
        message: e.to_string(),
    })?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| CommandError::Io {
            message: e.to_string(),
        })?;

    // Storing the watcher keeps it alive; assignment drops any previous one.
    state.lock().unwrap().watcher = Some(watcher);

    let emit_root = root.clone();
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut events = vec![first];
            // Debounce: keep draining until 300ms of silence.
            while let Ok(more) = rx.recv_timeout(Duration::from_millis(300)) {
                events.push(more);
                if events.len() > 512 {
                    break;
                }
            }
            let mut created = Vec::new();
            let mut modified = Vec::new();
            let mut deleted = Vec::new();
            for event in events {
                let bucket = match event.kind {
                    notify::EventKind::Create(_) => &mut created,
                    notify::EventKind::Modify(_) => &mut modified,
                    notify::EventKind::Remove(_) => &mut deleted,
                    _ => continue,
                };
                for p in event.paths {
                    if is_markdown(&p) || p.is_dir() {
                        let rel = relative(&emit_root, &p);
                        if !bucket.contains(&rel) {
                            bucket.push(rel);
                        }
                    }
                }
            }
            for (kind, paths) in [
                ("created", created),
                ("modified", modified),
                ("deleted", deleted),
            ] {
                if !paths.is_empty() {
                    let _ = app.emit(
                        "fs-changed",
                        FsChange {
                            kind: kind.to_string(),
                            paths,
                        },
                    );
                }
            }
        }
    });

    Ok(())
}

/// Full-text search over markdown files using the ripgrep internals.
/// The query is tried as a regex first, falling back to a literal match.
#[tauri::command]
pub fn search(state: State<AppState>, query: String) -> Result<Vec<SearchHit>, CommandError> {
    const MAX_HITS: usize = 500;

    let root = state
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or(CommandError::NoRoot)?;

    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(true)
        .build(&query)
        .or_else(|_| {
            RegexMatcherBuilder::new()
                .case_insensitive(true)
                .build(&regex_escape(&query))
        })
        .map_err(|e| CommandError::Io {
            message: e.to_string(),
        })?;

    let mut searcher = SearcherBuilder::new().line_number(true).build();
    let mut hits = Vec::new();

    for entry in WalkBuilder::new(&root).hidden(true).build().flatten() {
        if hits.len() >= MAX_HITS {
            break;
        }
        let path = entry.path();
        if !entry.file_type().is_some_and(|t| t.is_file()) || !is_markdown(path) {
            continue;
        }
        let rel = relative(&root, path);
        let _ = searcher.search_path(
            &matcher,
            path,
            UTF8(|line, text| {
                hits.push(SearchHit {
                    path: rel.clone(),
                    line,
                    text: text.trim_end().chars().take(400).collect(),
                });
                Ok(hits.len() < MAX_HITS)
            }),
        );
    }

    Ok(hits)
}

fn regex_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        if "\\.+*?()|[]{}^$#&-~".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Filename-stem index for wikilink resolution and the quick switcher.
#[tauri::command]
pub fn build_link_index(state: State<AppState>) -> Result<Vec<LinkIndexEntry>, CommandError> {
    let root = state
        .lock()
        .unwrap()
        .root
        .clone()
        .ok_or(CommandError::NoRoot)?;

    let mut index = Vec::new();
    for entry in WalkBuilder::new(&root).hidden(true).build().flatten() {
        let path = entry.path();
        if !entry.file_type().is_some_and(|t| t.is_file()) || !is_markdown(path) {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            index.push(LinkIndexEntry {
                stem: stem.to_lowercase(),
                path: relative(&root, path),
            });
        }
    }
    Ok(index)
}
