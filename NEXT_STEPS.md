# Folio — handoff and next steps

*Written at the end of the scaffold session (July 2026). Read PLAN.md first; this file says what already exists, what is unverified, and which model runs which task from here.*

## What is already built

The hard, architecture-shaping work is done:

- **Full project scaffold** — Tauri 2 + React 18 + TS + Vite, all plugins declared (dialog, store, fs, persisted-scope, opener), fonts bundled locally via Fontsource (offline-safe), tokens as CSS custom properties, three-pane shell in the house Monochrome style.
- **The complete unified pipeline** (`src/markdown/`) — GFM, frontmatter (collapsed metadata block), KaTeX, Shiki (curated language set, lazy extras, mermaid fences skipped), monochrome callouts, wikilink remark plugin, staggered fade-up honouring reduced motion, lazy Mermaid themed to the tokens, TOC extraction, word count, copy buttons, interactive checkbox stubs with the Phase-4 write-back contract (`data-task-index` n ↔ nth `[ ]` marker in source).
- **The Rust core** (`src-tauri/src/commands.rs`) — `pick_root` (persisted), `current_root`, `read_tree` (gitignore-aware, md-only, parent pointers), `read_file`, **`write_file` (atomic temp-file+rename with mtime conflict check — the load-bearing safety path)**, `watch_root` (debounced fs-changed events), `search` (ripgrep internals, regex-with-literal-fallback, capped), `build_link_index`.
- **Typed IPC layer** (`src/ipc.ts`) mirroring the Rust structs, with a browser fallback: plain `npm run dev` renders `samples/torture-test.md` with no Tauri shell, so typography work needs no Mac.
- **`samples/torture-test.md`** — the permanent regression fixture, exercising every §4 feature.
- **PLAN.md + CLAUDE.md** in place.

## Verification status — read before trusting anything

| Layer | Status |
| --- | --- |
| TypeScript | ✓ `tsc --noEmit` clean; ✓ `vite build` clean (re-verified in the Session A Linux container after the startup-restore and Mermaid changes below) |
| Rendered output | ✓ Verified headless in Chromium (`vite preview` + Playwright, Linux container): callouts ×5, KaTeX ×2, Mermaid SVG, Shiki, wikilinks ×3, checkboxes ×4, footnotes, frontmatter, TOC ×13, word count all render, all counts non-zero, no new console errors (one pre-existing harmless `favicon.ico` 404, unrelated). Screenshots reviewed against §6. **Still only checked in Chromium, never in WKWebView — that check stays on the Mac.** |
| Rust | ✓ **Compiles clean on Linux as of Session A.** `apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev pkg-config` then `cargo check` and `cargo clippy` in `src-tauri/` both finish with zero errors and zero warnings. Two fixes were needed (see below); the write path, watcher and search commands are otherwise unchanged from the original scaffold. **Not yet run as `npm run tauri dev`, and never opened as a live window** — that stays on the Mac (no WKWebView/GTK window server here). |
| Tauri shell | ✗ Untested (no macOS here, and this container has no display server to open a real window even on Linux). Window config, capabilities, file associations, drag-and-drop, "Open With" unexercised |
| Startup restore | ✓ Wired (`current_root` IPC wrapper added, `App.tsx` calls it on mount and restores root + tree + watcher). ✗ Not exercised end-to-end against a live Tauri window — needs the Mac to confirm the workspace actually reopens after a real relaunch |

### Session A fixes to the Rust core (this session)

1. **Missing app icon.** `tauri::generate_context!()` panicked with `failed to open icon .../icons/icon.png: No such file or directory`. This is not Linux-specific — `tauri-codegen`'s `find_icon` falls back to `icons/icon.png` for the default window icon on **every** target when `bundle.icon` is empty (Windows only tries `.ico` first before hitting the same PNG fallback; macOS/Linux go straight to it). Added a small placeholder PNG (`src-tauri/icons/icon.png`, monochrome cream/ink, 256×256) purely to unblock compilation. `bundle.icon` in `tauri.conf.json` is still `[]` — the real icon design (`npx tauri icon`) remains a Phase 6 task; replace this placeholder file when that's done.
2. **Unused import warning.** `commands.rs` imported `tauri::Manager` but never used it (the trait is only needed in `lib.rs`, which already imports it separately). Removed the unused import so `clippy` is warning-clean.

No other changes were needed — `pick_root`/`FilePath::into_path`, the `notify` v8 watcher API, and the `tauri-plugin-store` `StoreExt` calls in `commands.rs` all matched the installed crate versions (tauri 2.11, notify 8.2, tauri-plugin-store 2.4) with no changes required.

## Task list from here, in order, with model assignments

Per PLAN.md §7: Sonnet 4.6 for anything touching the pipeline, Rust IPC, CodeMirror or the write path; Haiku 4.5 for mechanical work; Opus only if a task is stuck twice.

**Session A — first boot on the Mac** · **Sonnet 4.6** *(do this first; everything else depends on it)*

Split across two environments — a Linux container did everything that doesn't need a real window or WKWebView; the rest is still pending on the Mac.

Done in the Linux container (this session):
1. ~~Fix whatever `cargo` complains about~~ — done. Installed the Linux system libs (`libwebkit2gtk-4.1-dev` etc.), then `cargo check`/`cargo clippy` in `src-tauri/` both came back clean after two small fixes (missing app icon, unused import — see the Verification status table above for detail).
2. ~~Wire startup: call `current_root`~~ — done. Added `ipc.currentRoot()` to `src/ipc.ts` and an effect in `src/App.tsx` (mirrors the existing `pickRoot` callback) that calls it on mount, and on a hit calls `setRoot` + `setTree(await ipc.readTree())` + `await ipc.watchRoot()`.
3. Known polish item: Mermaid node fills render pale grey, not `paper3` — **fixed**. The `neutral` theme hard-codes node fill (`mainBkg`) to `#eee` regardless of `themeVariables`; switched `src/markdown/mermaid.ts` to `theme: "base"` (the one theme where every colour derives from overrides) with explicit `mainBkg`/`nodeBkg`/`nodeBorder`/`clusterBkg` etc. Verified with a headless Chromium screenshot (`vite build` + `vite preview` + the scratchpad Playwright script) — the flowchart in the torture test now renders cream fills with ink strokes/text/arrows, reading as monochrome.
4. `npm run typecheck` and `npx vite build` re-verified clean after the above.

Still needs the Mac (nothing here confirms these — do not treat them as done):
1. `cd folio && npm install && npm run tauri dev` — never run; this container has no display server and no WKWebView/GTK runtime to open a window in, only the compiler toolchain.
2. Confirm the app actually opens a styled shell, and re-check §6 typography/Mermaid details in real WKWebView (not Chromium — WKWebView has its own CSS quirks per PLAN.md §8).
3. Confirm startup restore end-to-end: launch once, pick a root, quit, relaunch, confirm the tree/watcher/root name come back without user action.
4. Verify Phase 0/1 acceptance in-app: reduced motion honoured, checkbox tick logs.
5. Verify Phase 2 acceptance: pick a Drive-synced root, edit a file externally, Reader updates within ~1s without losing scroll position.

**Session B — Phase 1/2 chrome polish** · **Haiku 4.5**
- TOC scroll-spy (IntersectionObserver, active item in ink).
- Tree expansion memory + pane widths persisted via `tauri-plugin-store` (replace the localStorage stopgap in `appStore.ts`/`Tree.tsx`).
- Drag-file-onto-app and Finder "Open With" handling (log event → open file; association already in `tauri.conf.json`).
- Footer/zoom refinements; `.md`-less display names; empty states ("Choose folder…" screen in house style).

**Session C — Phase 3: links + history** · **Sonnet 4.6**
- Implement `onLinkClick` routing in `App.tsx` (the Reader already funnels every `<a>` click there, with `data-wikilink` attached): relative links resolve against the current file; wikilinks resolve via `build_link_index` (stem match, case-insensitive, prefer-nearest, disambiguation popover); anchors scroll after navigation; external links via opener plugin; broken links get `.broken-link` + create-on-click.
- History already exists in `appStore.ts` (⌘[/⌘] bound); verify browser-like behaviour against the 10-file test vault described in §7.

**Session D — Phase 4: editor + safe writes** · **Sonnet 4.6** *(the write path is the one part that must never ship half-right)*
- CodeMirror 6 in the reader column, themed to the tokens; ⌘E toggle (stub already bound), rough scroll-position mapping across modes.
- ⌘S + 2s-idle autosave through `ipc.writeFile`; on `Conflict` error show the non-modal banner (keep mine / take theirs / show both).
- Real checkbox write-back using the `data-task-index` ↔ nth-marker contract (see CLAUDE.md).
- Run the §7 kill-test before calling it done.

**Session E — Phase 5: search + switcher** · **Sonnet 4.6 for any `search` command changes; Haiku 4.5 for the panels**
- ⇧⌘F panel: grouped-by-file hits, open-at-line (scroll + brief highlight). Rust `search` exists — Haiku can build the UI against it as-is.
- ⌘P fuzzy quick switcher against `build_link_index`.

**Session F — Phase 6: polish + packaging** · **Haiku 4.5 chores; Sonnet 4.6 for the print stylesheet + final §6 audit**
- App icon (cream/ink monogram — design it, then `npx tauri icon`; `bundle.icon` in `tauri.conf.json` is currently an empty list and must be filled).
- Native menu bar with all shortcuts; About window; ⌘N/rename/delete-to-trash from the tree context menu (⌘N is spec'd in §4 but not yet built).
- Print stylesheet exists in `reader.css` — verify ⌘P output and finish it; README; `tauri build` → `.dmg` on the Intel machine (slow: prefer the M5 Air for release builds).

**Phase 7 (later) — Android** · **Sonnet 4.6** — as PLAN.md §7.

## Standing rules for every session

- One phase per session; plan mode first; update "Current phase" in CLAUDE.md and tick off this file as you go.
- Commit at every green acceptance check.
- Never add a second write path around `write_file`.
- Check `samples/torture-test.md` after any pipeline or CSS change.
