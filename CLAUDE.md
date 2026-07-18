# Folio — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md before any work. Current phase: Phase 3 (links + history)
complete — relative/wikilink/anchor routing, broken-link + external-link
styling, disambiguation and create-file popovers, browser-mode virtual vault
for testing without Tauri — see NEXT_STEPS.md for the handoff state and
per-phase model assignments. Next: Phase 4 (editor + safe writes).

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
  serves samples/**/*.md from an in-memory map (import.meta.glob). App.tsx
  and src/linkRouter.ts call this, not ipc/isTauri(), directly.
- src/linkRouter.ts — resolves a link click (relative/wikilink/anchor/
  external) into an action for App.tsx to perform; never touches history
  or the DOM itself (except opening external links).
- src/ipc.ts — the only place the frontend talks to Rust. Types here mirror
  the Serialize structs in src-tauri/src/commands.rs; keep both in sync.
- Task-checkbox write-back contract: the nth rendered checkbox
  (data-task-index) corresponds to the nth `[ ]`/`[x]` marker in the source.
