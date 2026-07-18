mod commands;

use commands::{AppData, AppState};
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .manage::<AppState>(Mutex::new(AppData {
            root: None,
            watcher: None,
        }))
        .setup(|app| {
            // Restore the persisted root so the workspace reopens where it
            // left off. The frontend calls current_root on startup.
            if let Some(root) = commands::load_persisted_root(app.handle()) {
                let state = app.state::<AppState>();
                state.lock().unwrap().root = Some(root);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_root,
            commands::current_root,
            commands::read_tree,
            commands::read_file,
            commands::write_file,
            commands::watch_root,
            commands::search,
            commands::build_link_index,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
