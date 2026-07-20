# Markdown Reader — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md before any work. Current phase: Phase 7 (Android — PLAN-ANDROID.md),
container-executable work COMPLETE: A1 storage code (list_dirs/set_root, android
delete-to-.mdreader-bin, FolderBrowser, resume-refresh), A2 responsive shell +
back-button contract, A3 touch/editor ergonomics, SYNC.md, and the committed
regression suite (tests/, six scripts). What remains needs a Mac with a device
attached — A0 (tauri android init + first boot), manifest edits, on-device A1–A4
checks and A5 packaging — see NEXT_STEPS.md "Android" section. Desktop Phase 6
remains pending its own Mac verification pass (same file).

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
npm run test:all (builds once, serves vite preview on :4173, runs all six
Playwright regression scripts — see tests/README.md; individual scripts via
test:smoke/links/edit/search/fileops/mobile) ·
npm run dev (browser-only mode: opens samples/torture-test.md against an
in-memory vault of every file under samples/, with full link routing and
history — no Tauri shell needed; use for typography and link-routing work;
`?platform=android` forces the Android/mobile paths for testing) ·
cargo fmt/clippy in src-tauri (check the aarch64-linux-android target too)

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
- src/theme.ts — dark mode. Same monochrome-plus-accent system, inverted
  luminance (tokens.css's `:root[data-theme="dark"]` block plus a
  `@media (prefers-color-scheme: dark)` fallback for the default "system"
  setting) — not a second design. The setting itself lives in appStore
  (`theme`/`setTheme`, persisted); theme.ts only applies the `data-theme`
  attribute and mirrors it to plain localStorage so index.html's inline
  script can set it before first paint (avoids a flash — the real
  persisted value may load async via tauri-plugin-store). Shiki ships both
  "vitesse-light" and "vitesse-dark" per token as CSS custom properties
  (src/markdown/highlight.ts) so switching is a CSS override, not a
  re-render — reader.css's dark-mode block reads `--shiki-dark`; the print
  stylesheet forces the light values back with `!important` regardless of
  theme. Mermaid can't do the CSS-variable trick (it bakes colours into a
  static SVG), so it reads the live token values at render time and
  Reader.tsx calls `retintMermaidBlocks` on the theme-changed event to
  redraw already-open diagrams. Toggle lives in the desktop View menu
  (Appearance submenu, src-tauri/src/lib.rs) and the mobile overflow menu
  (cycles System → Light → Dark).

## Android (Phase 7 — PLAN-ANDROID.md)
- One codebase: Android differences via media queries / coarse-pointer checks
  in TS and #[cfg(target_os = "android")] in Rust. No Mobile* component forks.
- Storage: All Files Access with real paths (PLAN-ANDROID.md §2). The Rust
  core is unchanged; folder picking uses the in-app browser, delete goes to
  .mdreader-bin/ on Android. Never introduce SAF/content:// URIs into the core.
- The 5 desktop Playwright scripts + mobiletest.mjs must all pass after every
  session. Desktop `npm run tauri dev` must keep working from this checkout.
- src-tauri/gen/android is committed and hand-edited (manifest, activity).
  Never rerun `tauri android init` over it. (It does not exist yet — it is
  generated in Phase A0 on the Mac; .gitignore already stopped ignoring it.)
- src/historyBridge.ts owns the WebView-history ↔ app-history mirroring that
  makes the Android hardware back button work (PLAN-ANDROID.md §3). Read its
  header before touching navigation, overlays, or the store's back/forward.
- src/platform.ts: isAndroid() (with the ?platform=android dev override) and
  isCoarsePointer(); src/hooks/useIsMobile.ts: <768px or Android — keep the
  breakpoint in sync with src/styles/mobile.css.
