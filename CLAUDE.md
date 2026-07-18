# Folio — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md before any work. Current phase: Phase 5 (search + quick switcher)
complete — vault.search() delegates to ipc.search() in Tauri and implements
identical semantics in browser mode; SearchPanel (⇧⌘F) with grouped-by-file
results, click-to-navigate and scroll-to-line with brief highlight pulse;
QuickSwitcher (⌘P) centred overlay with fuzzy file stem matching, arrow keys
and Enter to open, keyboard shortcuts properly guarded to not block after
checkbox clicks — see NEXT_STEPS.md for the handoff state. Next: Phase 6
(polish + packaging).

## Rules
- Viewer-first. The Reader's typography is the product; never regress it.
- Design system: Monochrome (PLAN.md §6). No colour anywhere except the muted
  code-highlighting exception. No Tailwind, no shadcn, no emoji-as-UI.
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
  `window.__folioSimulateExternalEdit(path, content)` Playwright hook.
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
