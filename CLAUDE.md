# Markdown Reader — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md (and PLAN-ANDROID.md for Android work) before any work. Phase 6
(desktop polish + packaging) is COMPLETE pending Mac verification — see
NEXT_STEPS.md for the pre-ship checklist. Phase 7 (Android, PLAN-ANDROID.md)
is IN PROGRESS: Phase A0 (toolchain + first boot) is done — the app installs
and opens on a physical device showing the existing desktop-shaped shell with
the empty state; desktop `npm run tauri dev` still works from this checkout.
Phase A1 (storage) is next.
✓ App icon, native menu bar (App/File/Edit/View/Go/Window + About), print stylesheet,
file ops (create/rename/delete-to-bin), README all built and verified in this
container (cargo check/clippy clean, all 5 regression scripts pass). Nothing left to
build on desktop — what remains is verifying it all on a real Mac (WKWebView, a real
window, a real filesystem) before `tauri build`.

## Rules
- Viewer-first. The Reader's typography is the product; never regress it.
- Design system: mostly Monochrome, crisp white/grey ground (PLAN.md §6,
  superseded by "Correction 2"). One restrained terracotta accent
  (`--accent`) plus the muted code-highlighting exception — no other colour.
  File browser is a single-column drill-down with a breadcrumb (see PLAN.md
  "Correction 2"), not an expand/collapse tree or Miller columns.
  No Tailwind, no shadcn, no emoji-as-UI.
- All disk writes go through write_file (atomic + mtime conflict check). Never
  add a second write path.
- Plain .md files on disk are the only storage. No database, no sidecar files
  except the app's own settings store.
- Keep samples/ rendering perfectly — it is the regression fixture. Check it
  after any pipeline or CSS change.
- UK English in all UI copy.

## Commands
npm run tauri dev · npm run tauri build · npm run typecheck ·
npm run dev (browser-only mode: opens samples/torture-test.md against an
in-memory vault of every file under samples/, with full link routing and
history — no Tauri shell needed; use for typography and link-routing work) ·
cargo fmt/clippy in src-tauri

## Layout notes
- src/markdown/ — the unified pipeline and its custom plugins (wikilinks,
  callouts, Shiki step, Mermaid lazy-loader, post-mount broken/external link
  styling). This is the product core.
- src/vault.ts — storage facade. Tauri mode delegates to ipc; browser mode
  serves samples/**/*.md from an in-memory map (import.meta.glob), with
  simulated mtimes and the SAME conflict semantics as write_file (rejects
  with `{ kind: "conflict", currentMtimeMs }` — see `isConflictError`), so
  the conflict banner is exercisable in Chromium. `vault.writeFile` is the
  only write path both modes ever use; `vault.onExternalChange` unifies
  Tauri's fs-changed events and the browser-only
  `window.__markdownReaderSimulateExternalEdit(path, content)` Playwright hook.
  App.tsx and src/linkRouter.ts call this, not ipc/isTauri(), directly.
- src/linkRouter.ts — resolves a link click (relative/wikilink/anchor/
  external) into an action for App.tsx to perform; never touches history
  or the DOM itself (except opening external links).
- src/ipc.ts — the only place the frontend talks to Rust. Types here mirror
  the Serialize structs in src-tauri/src/commands.rs; keep both in sync.
- src/components/Editor.tsx — CodeMirror 6, mounted by App.tsx in place of
  Reader when `editing` is true. Uncontrolled past creation; App.tsx forces
  a remount (via `key`) to replace the buffer programmatically (new file,
  "take theirs", "show both").
- src/components/ConflictBanner.tsx — non-modal "file changed on disk"
  banner (keep mine / take theirs / show both), rendered by App.tsx above
  whichever of Reader/Editor is showing.
- src/taskMarkers.ts — `setTaskMarker(source, index, checked)`, the regex
  rewrite behind the task-checkbox write-back contract below.
- Task-checkbox write-back contract: the nth rendered checkbox
  (data-task-index) corresponds to the nth `[ ]`/`[x]`/`[X]` marker in the
  source, in document order. TaskCheckbox (src/components/ReaderBlocks.tsx)
  delegates the actual write to App.tsx via TaskToggleContext — it applies
  the change optimistically to `source` then writes through vault.writeFile
  with the tracked mtime, surfacing the same conflict banner on failure.

## Android (Phase 7 — PLAN-ANDROID.md)
- One codebase: Android differences via media queries / coarse-pointer checks
  in TS and #[cfg(target_os = "android")] in Rust. No Mobile* component forks.
- Storage: All Files Access with real paths (PLAN-ANDROID.md §2). The Rust
  core is unchanged; folder picking uses the in-app browser, delete goes to
  .mdreader-bin/ on Android. Never introduce SAF/content:// URIs into the core.
  As of A0, `pick_root`/`delete_file` are `#[cfg(target_os = "android")]`
  stubs returning "not yet implemented" — Phase A1 replaces them for real.
- The 5 desktop Playwright scripts + mobiletest.mjs must all pass after every
  session. Desktop `npm run tauri dev` must keep working from this checkout.
- src-tauri/gen/android is committed and hand-edited (manifest, activity,
  buildSrc). Never rerun `tauri android init` over it.
- buildSrc/.../BuildTask.kt (the Rust cross-compile Gradle task) sets its own
  PATH and CARGO_TARGET_*_LINKER env vars explicitly — Android Studio's
  launched process doesn't inherit the login shell's PATH (no npm/cargo), and
  `tauri android android-studio-script` (unlike `tauri android dev`) doesn't
  reliably set the NDK linker itself, so cargo falls back to Apple's `cc`/ld
  and fails with unrecognised GNU-style linker flags. If Android builds ever
  start failing with "linking with `cc` failed" or "No such file or
  directory" again, check this file first before assuming a real code bug.
