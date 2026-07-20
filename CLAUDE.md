# Markdown Reader — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md (and PLAN-ANDROID.md for Android work) before any work. Phase 6
(desktop polish + packaging) is COMPLETE pending Mac verification — see
NEXT_STEPS.md for the pre-ship checklist. Phase 7 (Android, PLAN-ANDROID.md)
is IN PROGRESS: Phases A0–A5 have all landed in code and a signed release
APK installs and boots on a physical device (see PLAN-ANDROID.md §6 for
what each phase covers — storage, responsive shell + hardware back, touch
ergonomics, the `.md` intent-filter + SYNC.md, and a personal signing
keystore). This was built in one pass without the usual per-phase device
verification loop, so treat A2–A5 as "built, awaiting real-device
testing" rather than "verified" — see the test checklist handed to the
user for what still needs a pass on the phone (long-press context menu,
on-screen-keyboard editing, hardware back edge cases, the intent-filter
Open With flow, and a real Drive/Autosync round trip).
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
npm run test:all (builds once, serves vite preview on :4173, runs the
Playwright regression suite — see tests/README.md; individual scripts via
test:smoke/links/edit/search/fileops/mobile — mobile is a known-failing
gap, see the Android section below) ·
npm run dev (browser-only mode: opens samples/torture-test.md against an
in-memory vault of every file under samples/, with full link routing and
history — no Tauri shell needed; use for typography and link-routing work) ·
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

## Android (Phase 7 — PLAN-ANDROID.md)
- One codebase: Android differences via media queries / coarse-pointer checks
  in TS and #[cfg(target_os = "android")] in Rust. No Mobile* component forks.
- Storage: All Files Access with real paths (PLAN-ANDROID.md §2). The Rust
  core is unchanged; folder picking uses the in-app browser
  (FolderPickerDialog.tsx + `list_dirs`/`set_root`), delete goes to
  `.mdreader-bin/` via `#[cfg(target_os = "android")]` `delete_file` (a
  rename, timestamped on collision). Never introduce SAF/content:// URIs
  into the core. `pick_root`'s Android stub is unused in practice —
  App.tsx's `pickRoot` branches on `isAndroid()` (ipc.ts, UA-sniffed) to
  the picker dialog instead of ever calling it.
- `MainActivity.kt`'s `onResume` checks `Environment.isExternalStorageManager()`
  and launches the system "All files access" settings screen for this app if
  ungranted — no custom Tauri plugin/JS bridge, just the generated activity
  (PLAN-ANDROID.md §2 explicitly sanctions this). Returning from Settings
  re-checks automatically.
- Resume-refresh (App.tsx, a `visibilitychange` listener) re-reads the tree
  and the open file's mtime on foreground, since Android suspends the app
  and the `notify` watcher misses events while suspended — reuses the same
  reload logic as the `vault.onExternalChange` effect just above it.
- The regression suite (`tests/*.mjs`, `npm run test:all`/`test:smoke`/etc.)
  covers the 5 desktop flows cleanly (smoke, links, edit, search, fileops).
  `mobiletest.mjs` does not pass here and is a known gap, not a false-green:
  it was written against a different, container-only session's DOM contract
  for the mobile shell (separate `.drawer` element, footer absent from the
  DOM entirely on mobile, different class names/aria-labels throughout) —
  reconciling it means either reworking this session's real-device-verified
  mobile shell to match assumptions from a session with no device to verify
  against, or properly rewriting the test; don't paper over it with a
  mechanical rename. Desktop `npm run tauri dev`, `cargo check`/`clippy`
  (both host and `aarch64-linux-android` targets), and a signed release APK
  installing/booting on a physical device are all separately verified.
- src-tauri/gen/android is committed and hand-edited (manifest, activity,
  buildSrc). Never rerun `tauri android init` over it.
- Responsive shell (Phase A2, PLAN-ANDROID.md §3): `@media (max-width: 768px),
  (pointer: coarse)` in base.css turns the desktop three-pane flex layout into
  a single column — `.pane-tree`/`.pane-toc` become a `position: fixed` drawer/
  bottom sheet (shown via ordinary conditional rendering off `showTree`/
  `showToc`, same as desktop — there's no separate mobile-only state, and no
  slide-in/out animation, just instant show/hide) with a `.mobile-scrim`
  backdrop, gated so it only renders when `useMediaQuery` (src/hooks/
  useMediaQuery.ts) matches — that hook's query string must stay in sync with
  the CSS breakpoint. A new `<header className="app-bar">` (JSX always
  present, `display: none` outside the media query) replaces the desktop menu
  bar for phone-only actions (search/quick-open/edit-toggle/overflow), reusing
  the exact same callbacks the native menu's `onMenuEvent` switch already
  calls. Hardware back (App.tsx, a `popstate` listener + matching
  `history.pushState` calls on overlay-open/navigate) closes the top-most
  overlay, else walks the store's own back stack — dormant on desktop (no
  hardware back button exists there to fire it). Known gap: closing an
  overlay via its own UI (not hardware back) leaves one inert forward history
  entry, so occasionally one hardware-back press is a no-op before it starts
  working again — not a correctness bug, just a rough edge.
- Touch ergonomics (Phase A3, PLAN-ANDROID.md §3): `@media (pointer: coarse)`
  keeps the code-copy button and the task-checkbox tap target (enlarged to
  20px) visible/reachable without hover. Long-press-to-context-menu on tree
  rows needed no new code — Android WebView already dispatches a native
  `contextmenu` DOM event on long-press, which Tree.tsx's existing
  `onContextMenu` (built for desktop right-click) already handles. The
  editor's "Done" button (app-bar, shown only while `editing`) reuses
  `handleToggleEditing`, which already flushes a dirty buffer on exit.
- `.md`/`.markdown` Open-With (Phase A4): the manifest's intent-filter was
  auto-generated by `tauri android init` back in A0 from `tauri.conf.json`'s
  `fileAssociations` — nothing to add. `SYNC.md` documents the Drive/Autosync
  setup and why the mtime-conflict path (unchanged) already covers the sync
  race; it hasn't been verified against a live Drive account from this
  session, only reasoned through.
- Signing (Phase A5): `src-tauri/gen/android/keystore.properties` (gitignored)
  points at `keystore/markdown-reader-release.jks` (gitignored,
  machine-local) with a randomly generated password — regenerate both with
  `keytool -genkeypair` if this checkout doesn't have them; `app/build.gradle.kts`'s
  release `signingConfig` silently no-ops to an unsigned build if
  `keystore.properties` is absent, so a fresh clone still builds. Release APK:
  `npx tauri android build --apk --target aarch64` → `app/build/outputs/apk/
  universal/release/app-universal-release.apk`. `versionCode`/`versionName`
  live in `app/tauri.properties` (auto-generated from `tauri.conf.json`'s
  `version`).
- buildSrc/.../BuildTask.kt (the Rust cross-compile Gradle task) sets its own
  PATH and CARGO_TARGET_*_LINKER env vars explicitly — Android Studio's
  launched process doesn't inherit the login shell's PATH (no npm/cargo), and
  `tauri android android-studio-script` (unlike `tauri android dev`) doesn't
  reliably set the NDK linker itself, so cargo falls back to Apple's `cc`/ld
  and fails with unrecognised GNU-style linker flags. If Android builds ever
  start failing with "linking with `cc` failed" or "No such file or
  directory" again, check this file first before assuming a real code bug.
