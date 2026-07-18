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
| TypeScript | ✓ `tsc --noEmit` clean; ✓ `vite build` clean |
| Rendered output | ✓ Verified in Chromium: callouts ×5, KaTeX, Mermaid SVG, Shiki, wikilinks, checkboxes, footnotes, frontmatter, TOC, word count all render; screenshots reviewed against §6 |
| Rust | ✗ **Never compiled.** This Linux container lacks the macOS/WebKit toolchain, so `cargo check` was impossible. Written conservatively against Tauri 2 stable APIs, but expect a handful of compile errors on first `npm run tauri dev` |
| Tauri shell | ✗ Untested (no macOS here). Window config, capabilities, file associations unexercised |

## Task list from here, in order, with model assignments

Per PLAN.md §7: Sonnet 4.6 for anything touching the pipeline, Rust IPC, CodeMirror or the write path; Haiku 4.5 for mechanical work; Opus only if a task is stuck twice.

**Session A — first boot on the Mac** · **Sonnet 4.6** *(do this first; everything else depends on it)*
1. `cd folio && npm install && npm run tauri dev` on the Intel MacBook Pro.
2. Fix whatever `cargo` complains about in `commands.rs`/`lib.rs` until the shell opens (likely candidates: plugin API drift, `notify` v8 signatures, dialog `into_path`).
3. Wire startup: call `current_root` → if set, `read_tree` + `watch_root` and restore the workspace (frontend hook exists; confirm end-to-end).
4. Verify Phase 0/1 acceptance: styled shell opens; torture test renders in-app (WKWebView, not Chrome — re-check §6 details); reduced motion honoured; checkbox tick logs.
5. Also verify Phase 2 acceptance while there: pick a Drive-synced root, edit a file externally, Reader updates within ~1s. Fix scroll preservation if it jumps.
6. Known polish item: Mermaid node fills render pale grey, not `paper3` — adjust `themeVariables` in `src/markdown/mermaid.ts` in the real webview.

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
