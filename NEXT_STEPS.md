# Folio — handoff and next steps

*Written at the end of the scaffold session (July 2026). Read PLAN.md first; this file says what already exists, what is unverified, and which model runs which task from here.*

## What is already built

The hard, architecture-shaping work is done:

- **Full project scaffold** — Tauri 2 + React 18 + TS + Vite, all plugins declared (dialog, store, fs, persisted-scope, opener), fonts bundled locally via Fontsource (offline-safe), tokens as CSS custom properties, three-pane shell in the house Monochrome style.
- **The complete unified pipeline** (`src/markdown/`) — GFM, frontmatter (collapsed metadata block), KaTeX, Shiki (curated language set, lazy extras, mermaid fences skipped), monochrome callouts, wikilink remark plugin, staggered fade-up honouring reduced motion, lazy Mermaid themed to the tokens, TOC extraction, word count, copy buttons, interactive checkbox stubs with the Phase-4 write-back contract (`data-task-index` n ↔ nth `[ ]` marker in source).
- **The Rust core** (`src-tauri/src/commands.rs`) — `pick_root` (persisted), `current_root`, `read_tree` (gitignore-aware, md-only, parent pointers), `read_file`, **`write_file` (atomic temp-file+rename with mtime conflict check — the load-bearing safety path)**, `watch_root` (debounced fs-changed events), `search` (ripgrep internals, regex-with-literal-fallback, capped), `build_link_index`.
- **Typed IPC layer** (`src/ipc.ts`) mirroring the Rust structs.
- **Storage facade** (`src/vault.ts`, Session C) — Tauri mode delegates to `ipc`; browser mode serves a full virtual vault built from every file under `samples/` via `import.meta.glob`, so `npm run dev`/`vite preview` behaves like a real root (tree, file reads, link index, file creation) with no Tauri shell, and link routing/history can be tested in this Linux container's Chromium.
- **Link routing** (`src/linkRouter.ts`, `src/markdown/linkStyling.ts`, `src/pathUtils.ts`, `src/components/LinkPopover.tsx`, Session C) — relative-link and wikilink resolution, anchor scrolling, broken/external link styling, disambiguation and create-file popovers. See the Session C entry below for detail.
- **`samples/`** — a 10-file linked vault (`torture-test.md` the permanent rendering fixture, plus `linked-note.md`, `index.md`, `specs/`, `notes/`, `archive/`) exercising every §4 rendering feature and every §5/§7 link-routing case.
- **PLAN.md + CLAUDE.md** in place.

## Verification status — read before trusting anything

| Layer | Status |
| --- | --- |
| TypeScript | ✓ `tsc --noEmit` clean; ✓ `vite build` clean (re-verified in the Session A Linux container after the startup-restore and Mermaid changes below) |
| Rendered output | ✓ Verified headless in Chromium (`vite preview` + Playwright, Linux container): callouts ×5, KaTeX ×2, Mermaid SVG, Shiki, wikilinks ×3, checkboxes ×4, footnotes, frontmatter, TOC ×13, word count all render, all counts non-zero, no new console errors (one pre-existing harmless `favicon.ico` 404, unrelated). Screenshots reviewed against §6. **Still only checked in Chromium, never in WKWebView — that check stays on the Mac.** |
| Rust | ✓ **Compiles clean on Linux as of Session A.** `apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev pkg-config` then `cargo check` and `cargo clippy` in `src-tauri/` both finish with zero errors and zero warnings. Two fixes were needed (see below); the write path, watcher and search commands are otherwise unchanged from the original scaffold. **Not yet run as `npm run tauri dev`, and never opened as a live window** — that stays on the Mac (no WKWebView/GTK window server here). |
| Tauri shell | ✗ Untested (no macOS here, and this container has no display server to open a real window even on Linux). Window config, capabilities, file associations, drag-and-drop, "Open With" unexercised |
| Startup restore | ✓ Wired (`current_root` IPC wrapper added, `App.tsx` calls it on mount and restores root + tree + watcher). ✗ Not exercised end-to-end against a live Tauri window — needs the Mac to confirm the workspace actually reopens after a real relaunch |
| Link routing (Phase 3) | ✓ Fully verified in Chromium against the 10-file vault: relative links, cross-file + same-page anchors (including a real ~330px scroll delta, not just "already in view"), unambiguous and ambiguous wikilinks (disambiguation popover), broken-link styling and create-on-click, ⌘[/⌘] history round-trips with no anchor-scroll pollution. `write_file`'s mtime-skip-on-new-file behaviour was checked by reading `src-tauri/src/commands.rs`, not exercised against a real root. ✗ External-link opening (`openUrl` via `@tauri-apps/plugin-opener`) is wired and typechecks but has only been confirmed by inspection (capability + dependency already present) — needs a real Tauri window to confirm it actually opens the system browser. ✗ Real-root wikilink file creation (vs. the in-memory browser vault) untested — needs the Mac. |

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

**Session B — Phase 1/2 chrome polish** · **Haiku 4.5** ✓
- ✓ TOC scroll-spy: scroll-based active heading detection, styled in ink.
- ✓ Persisted UI state: created `src/persist.ts` (LazyStore with localStorage fallback), moved tree expansion state to appStore, pane visibility persisted.
- ✓ Open-file event: added RunEvent handler in `src-tauri/src/lib.rs` (macOS/iOS/Android conditional), frontend listener logs events.
- ✓ Chrome refinements: word count grammar ("1 word" vs "n words"), zoom level display in footer (briefly on zoom change), empty state screen ("Choose a folder to begin").
- Note: Open-file event handling unverified without real Tauri window (Linux container; will verify on macOS).

**Session C — Phase 3: links + history** · **Sonnet 4.6** ✓
- ✓ Browser-mode virtual vault (`src/vault.ts`): `import.meta.glob("../samples/**/*.md", { query: "?raw", import: "default", eager: true })` loads every sample file into an in-memory map; `readFile`/`linkIndex`/`exists`/`listTree`/`createFile` delegate to `ipc` in Tauri mode and to the map in browser mode. `App.tsx` and `src/linkRouter.ts` call this facade, never `ipc`/`isTauri()` directly (except the couple of genuinely Tauri-only concerns: `pickRoot`, `currentRoot`, `watchRoot`, `onFsChanged`, opening external links).
- ✓ Extended `samples/` to a 10-file linked vault: `torture-test.md`, `linked-note.md`, `index.md`, `specs/api-spec.md`, `specs/overview.md`, `specs/design.md`, `notes/overview.md`, `notes/daily.md`, `notes/ideas.md`, `archive/old-plan.md`. Covers both link styles, a cross-file anchor link (`specs/api-spec.md#endpoints`), a same-page anchor to a distant heading (`#mermaid`), an ambiguous stem (`specs/overview.md` / `notes/overview.md`, both literally named `overview.md`), and deliberately broken links (a relative link and two wikilinks). `torture-test.md` kept intact — only a new "Links (Phase 3 vault)" section was appended.
- ✓ `src/linkRouter.ts` (`resolveLinkClick`): relative links resolve against the current file's directory (`src/pathUtils.ts` handles `./`/`../` normalisation), navigate in-app and push history; anchors are slugified with `github-slugger`'s `slug()` (the same algorithm rehype-slug uses) and scrolled to after the target document renders. Same-page `#anchor` clicks scroll only, no history push. Wikilinks resolve via the link index by case-normalised stem (hyphens/underscores/spaces treated as equivalent, since the samples use hyphenated filenames but prose reads naturally with spaces — see `normalizeStem`); ties are broken by directory distance (`dirDistance`), and a genuine tie opens a disambiguation popover. External http(s) links use `@tauri-apps/plugin-opener`'s `openUrl` in Tauri mode (dependency + capability were already wired from Phase 0) and `window.open` in browser mode.
- ✓ Broken/external link styling: `src/markdown/linkStyling.ts` is a post-mount DOM pass (same pattern as the Mermaid lazy-render step, since resolution needs the async link index) that adds `.broken-link` to unresolvable wikilinks/relative links and `.external-link` to http(s) links.
- ✓ Broken-wikilink create-on-click: a small Monochrome popover (`src/components/LinkPopover.tsx` — mono type, hairline border, paper2 fill, dismiss on outside-click/Escape) offers to create the file; on confirm it writes `# Title\n` via `vault.createFile`, which uses `ipc.writeFile(path, content, 0)` in Tauri mode (safe because `write_file` skips its mtime check when the file doesn't exist yet) and just extends the in-memory map in browser mode.
- ✓ History (`appStore.ts`, pre-existing) verified to behave like a browser: link navigation pushes; anchor scrolls (same-page and cross-file) never push; ⌘[/⌘] (tested here as Ctrl+[/Ctrl+] — the handler accepts either) round-trip correctly.
- ✓ Verified with Playwright against `vite build` + `vite preview` (Chromium): `npm run typecheck` and `npx vite build` both clean. `smoke.mjs` still passes (all counts non-zero, one pre-existing harmless favicon 404). New `linktest.mjs` (in the scratchpad) confirms: relative link → correct document; cross-file anchor link → navigates and scrolls (verified via a same-page distant-heading anchor too, ~330px real scroll delta, landing within a few px of the viewport top); same-page anchor → no history pollution (one ⌘[ after it returns to the true previous document); unambiguous wikilink → navigates; ambiguous wikilink (`[[overview]]`) → disambiguation popover listing both `specs/overview.md` and `notes/overview.md`; broken wikilink → has `.broken-link`, click → create-file popover → confirm → creates and navigates to the new file; ⌘[ / ⌘] round-trip. Disambiguation and create-offer popovers screenshotted and checked against §6 (mono type, hairline border, paper2 fill, uppercase mono label) — conformant.
- Unverifiable without a Mac/real Tauri window (do not treat as done): the `openUrl` (external link) call in Tauri mode — the code path and capability wiring were checked by inspection (`opener:default` already in `src-tauri/capabilities/default.json`, `@tauri-apps/plugin-opener` already a dependency), but never exercised against a real WKWebView/system browser. Likewise, `vault.createFile`'s Tauri branch (`ipc.writeFile(path, content, 0)`) was verified by reading `src-tauri/src/commands.rs` (`write_file` skips the mtime check when `abs.exists()` is false, so `expectedMtimeMs: 0` is safe) but only actually exercised end-to-end in browser mode here; confirm real-root file creation on the Mac.

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
