mod commands;

use commands::{AppData, AppState};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::RunEvent;
#[cfg(desktop)]
use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
#[cfg(desktop)]
use tauri::{AppHandle, Wry};

/// Build the native menu bar (App/File/Edit/View/Go/Window). Only wired on
/// desktop targets — `tauri::menu` itself is `#[cfg(desktop)]`-gated.
///
/// Accelerators are set ONLY on items with no existing frontend keydown
/// handler (New File, Open Folder, Actual Size, Print) — everything else
/// (edit toggle, history, zoom, quick open, search) is already bound in
/// App.tsx's keydown listener, so giving those menu items an accelerator
/// too would double-fire the action.
///
/// Print specifically: there is no OS-level "⌘P prints the frontmost
/// window" behaviour to preserve here — WKWebView doesn't bind it itself,
/// unlike a real browser tab. It only works because this menu item claims
/// the accelerator and App.tsx's onMenuEvent calls `window.print()` when it
/// fires (see the "print" case below).
#[cfg(desktop)]
fn build_menu(app: &AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let about = AboutMetadataBuilder::new()
        .name(Some("Markdown Reader"))
        .copyright(Some("© 2026"))
        .build();

    // The first submenu becomes the application menu on macOS.
    let app_menu = SubmenuBuilder::new(app, "Markdown Reader")
        .about(Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_file = MenuItemBuilder::with_id("new-file", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("open-folder", "Open Folder…")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let print_item = MenuItemBuilder::with_id("print", "Print…")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_file)
        .item(&open_folder)
        .separator()
        .item(&print_item)
        .separator()
        .close_window()
        .build()?;

    // Predefined native items — required for standard text editing (cut/
    // copy/paste/select-all) and undo/redo to work at all on macOS.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let toggle_edit = MenuItemBuilder::with_id("toggle-edit", "Toggle Edit Mode").build(app)?;
    let toggle_tree = MenuItemBuilder::with_id("toggle-tree", "Toggle File Tree").build(app)?;
    let toggle_toc = MenuItemBuilder::with_id("toggle-toc", "Toggle Contents").build(app)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In").build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out").build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom-reset", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_edit)
        .separator()
        .item(&toggle_tree)
        .item(&toggle_toc)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .build()?;

    let back = MenuItemBuilder::with_id("back", "Back").build(app)?;
    let forward = MenuItemBuilder::with_id("forward", "Forward").build(app)?;
    let quick_open = MenuItemBuilder::with_id("quick-open", "Quick Open…").build(app)?;
    let search = MenuItemBuilder::with_id("search", "Find in Files…").build(app)?;
    let go_menu = SubmenuBuilder::new(app, "Go")
        .item(&back)
        .item(&forward)
        .separator()
        .item(&quick_open)
        .item(&search)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .bring_all_to_front()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&go_menu)
        .item(&window_menu)
        .build()
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .manage::<AppState>(Mutex::new(AppData {
            root: None,
            watcher: None,
        }));

    // Relay every custom menu item click to the frontend as a "menu" event
    // carrying the item's id; App.tsx maps ids to the same actions the
    // keyboard shortcuts already trigger. Predefined items (about/quit/
    // undo/redo/cut/copy/paste/select-all/window controls) are handled
    // natively by the OS and never reach this handler.
    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
        let _ = app.emit("menu", event.id().as_ref());
    });

    builder
        .setup(|app| {
            // Restore the persisted root so the workspace reopens where it
            // left off. The frontend calls current_root on startup.
            if let Some(root) = commands::load_persisted_root(app.handle()) {
                let state = app.state::<AppState>();
                state.lock().unwrap().root = Some(root);
            }

            #[cfg(desktop)]
            {
                let menu = build_menu(app.handle())?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_root,
            commands::current_root,
            commands::read_tree,
            commands::read_file,
            commands::write_file,
            commands::create_file,
            commands::rename_file,
            commands::delete_file,
            commands::watch_root,
            commands::search,
            commands::build_link_index,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Markdown Reader")
        .run(|_app_handle, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let RunEvent::Opened { urls } = event {
                // Emit open-file event to the frontend with the file paths
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| {
                        // Convert file:// URLs to paths
                        url.to_file_path().ok().and_then(|p| {
                            p.to_str().map(|s| s.to_string())
                        })
                    })
                    .collect();

                if !paths.is_empty() {
                    let _ = _app_handle.emit("open-file", serde_json::json!({ "paths": paths }));
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            let _ = event;
        });
}
