# Markdown Reader — handoff and next steps

*Written at the end of Phase 6 (Session F, July 2026). Read PLAN.md first. Every
feature in the v1 spec (§4) is now built and verified as far as this Linux
container can verify it — full unified rendering pipeline, root/tree/watch,
links + history, editor + conflict-safe writes, search + quick switcher, file
ops (create/rename/delete-to-bin), the native menu bar, and the print
stylesheet. What's left is entirely Mac-side verification (WKWebView, a real
window, a real filesystem, a real build) — the single checklist below is that
verification pass, written to run once on the Mac before shipping.*

## What was built, all sessions

- **Scaffold (Session A/Phase 0).** Tauri 2 + React 18 + TS + Vite, plugins
  (dialog, store, fs, persisted-scope, opener), fonts bundled locally
  (Fontsource — offline-safe), design tokens as CSS custom properties, the
  three-pane Monochrome shell, macOS `.md` file association declared in
  `tauri.conf.json`.
- **Rendering pipeline (Phase 1).** The full unified pipeline in `src/markdown/`
  — GFM, frontmatter (collapsed metadata block), KaTeX, Shiki (curated
  language set, lazy extras, `mermaid` fences skipped and handled separately),
  monochrome callouts, the wikilink remark plugin, staggered fade-up entrance
  (honouring reduced motion), lazily-loaded Mermaid themed to the tokens, TOC
  extraction with scroll-spy, word count, code copy buttons, interactive
  checkbox stubs.
- **Root, tree, watch (Phase 2).** `pick_root`/`current_root` (persisted via
  `tauri-plugin-store`, restored on launch), `read_tree` (gitignore-aware,
  markdown-only, parent-pointer flat list), `read_file`, the debounced
  `watch_root` → `fs-changed` events, the tree sidebar with persisted
  expansion state.
- **Links + history (Phase 3).** Relative-link and wikilink resolution
  (`src/linkRouter.ts`, `src/pathUtils.ts`), anchor scrolling, disambiguation
  and broken-wikilink-create popovers (`src/components/LinkPopover.tsx`),
  back/forward history (`⌘[`/`⌘]`), a 10-file linked sample vault
  (`samples/`) that doubles as the permanent rendering + link-routing
  regression fixture.
- **Editor + safe writes (Phase 4).** CodeMirror 6 (`src/components/Editor.tsx`),
  `⌘E` toggle with scroll-fraction preservation, `⌘S` + 2s idle autosave, the
  atomic conflict-checked write path (`write_file`: temp-file + rename,
  refuses on mtime mismatch), the non-modal conflict banner (keep
  mine/take theirs/show both), real checkbox write-back.
- **Search + quick switcher (Phase 5).** The `search` Rust command (ripgrep
  internals, regex-with-literal-fallback, capped at 500 hits), the `⇧⌘F`
  panel (grouped-by-file results, scroll-to-line with a brief pulse), the
  `⌘K` fuzzy quick switcher (rebound from an original, self-contradicting
  `⌘P` — see PLAN.md's correction note — after on-device testing found ⌘P
  intercepted the OS's native Print shortcut).
- **Polish + packaging (Phase 6, this session).**
  - **Native menu bar** — `src-tauri/src/lib.rs`'s `build_menu`: App (Markdown
    Reader) menu with About (name "Markdown Reader", copyright "© 2026") and the predefined
    macOS app-menu items (Services, Hide/Hide Others/Show All, Quit); File
    (New File `⌘N`, Open Folder `⌘⇧O`, Close Window); Edit (predefined
    Undo/Redo/Cut/Copy/Paste/Select All — required for text editing to work
    at all on macOS); View (Toggle Edit Mode, Toggle File Tree, Toggle
    Contents, Zoom In/Out, Actual Size `⌘0`); Go (Back, Forward, Quick Open,
    Find in Files); Window (Minimize, Zoom, Bring All to Front). Every custom
    item has an id; `on_menu_event` relays it to the frontend as an
    `app.emit("menu", id)` event, picked up in `src/App.tsx` and mapped to the
    same actions the keyboard shortcuts trigger. Accelerators are set **only**
    on the three items with no pre-existing frontend keydown handler (New
    File, Open Folder, Actual Size) — every other item's action already has a
    frontend shortcut, so it carries no accelerator, avoiding a double-fire.
  - **File ops** — new Rust commands `create_file`/`rename_file`/`delete_file`
    in `src-tauri/src/commands.rs` (create refuses on an existing target and
    reuses the same atomic-write helper as `write_file`; rename refuses if
    the target exists; delete moves to the system bin via the `trash` crate,
    never a hard delete), mirrored in `src/ipc.ts` and `src/vault.ts`
    (browser-mode in-memory equivalents with identical semantics). UI: a
    tree-item right-click context menu (`src/components/Tree.tsx`, styled
    like `LinkPopover`) with Rename (swaps the row for an inline mono input,
    Enter confirms/Escape cancels) and Move to Bin (confirms in the same
    popover); a New File dialog (`src/components/NewFileDialog.tsx`) reachable
    via the tree pane's "New file" button and the menu/⌘N; store bookkeeping
    (`renamePath`/`removePath` in `src/stores/appStore.ts`) keeps
    `currentPath` and the back/forward stacks consistent across a rename or
    delete of the open document.
  - **Print stylesheet** — `src/styles/reader.css`'s `@media print` block now
    hides all chrome (panes, footer, banners, popovers, dialogs, copy
    buttons), forces true black-on-white by overriding the token custom
    properties for print, sets `@page` margins, keeps code blocks/tables/
    callouts/Mermaid/KaTeX from splitting across a page break
    (`break-inside: avoid`), keeps headings from being orphaned at a page
    bottom (`break-after: avoid`), wraps rather than clips long code lines
    (a PDF page can't be scrolled sideways the way a screen can), never
    expands hrefs after links, and prints the frontmatter block's fields
    plainly instead of as an unopenable `<details>` disclosure. Verified by
    generating a real PDF via Playwright's `page.pdf()` against
    `torture-test.md` and rasterising every page with `pdftoppm` to look at
    it directly — 5 pages, clean typography, no broken blocks, no chrome.
  - **Final §6 audit** — screenshotted every surface (reader top/middle,
    editor, conflict banner, search panel, quick switcher, disambiguation
    and create-file popovers, tree context menu, new-file dialog, empty
    state) and checked each against PLAN.md §6/§8. Found and fixed two
    pre-existing bugs while at it (not introduced this session, but caught by
    this audit): the TOC scroll-spy's "most in view" scoring was unbounded
    for headings far above the viewport, so it stuck on the *first* heading
    forever once you'd scrolled a couple of screens down (`src/components/Toc.tsx`
    — rewritten to pick the last heading that's crossed a fixed threshold
    line near the top of the viewport); and the empty state that appears
    after binning the currently-open file said "Choose a folder to begin"
    even when a root/tree was already active, and left the TOC showing the
    stale outline of the just-deleted file (`src/App.tsx` — message is now
    conditional on whether the tree has files, and `doc` is cleared when
    `currentPath` goes to null). Also fixed a focus-visible regression
    introduced by this session's own rename input (`outline: none` with no
    replacement — now matches every other input's ink outline).

## Verification status

| Layer | Status |
| --- | --- |
| TypeScript | ✓ `tsc --noEmit` clean, ✓ `vite build` clean |
| Rust | ✓ `cargo check` and `cargo clippy` both zero-warning in `src-tauri/`, including the new menu code and the new `create_file`/`rename_file`/`delete_file` commands (and the `trash` crate dependency) |
| Regression scripts | ✓ All five pass unmodified against `vite preview` + Playwright/Chromium: `smoke.mjs`, `linktest.mjs`, `edittest.mjs`, `searchtest.mjs`, and the new `fileopstest.mjs` (new-file dialog, tree rename, tree delete-to-bin, all with cancel paths) |
| Print stylesheet | ✓ Verified as a real rasterised PDF in this container (Chromium print pipeline) — never verified against macOS's actual print dialog/PDF export |
| Native menu bar | ✓ Compiles clean and the event-routing path (`on_menu_event` → `emit` → `App.tsx` listener) is verified by code inspection and matches the same pattern as the already-working `open-file` event. **Never opened as a real menu bar** — this container has no window server. Everything in the checklist below about menu appearance, About window text, and accelerator behaviour is unverified until the Mac |
| Everything else | Unchanged since Session E — see git history for Session A–E detail if needed; this file no longer carries the old per-session log now that every phase is closed out |

## Pre-ship checklist (run once, on the Mac)

Everything below needs a real window, WKWebView, or a real filesystem — none
of it can be checked from this Linux container. Work down the list in order;
each step assumes the previous ones passed.

1. **First boot.** `cd markdown-app && npm install && npm run tauri dev`. Confirm a
   styled window opens (not a blank/white screen), the three-pane shell
   renders in the house Monochrome style, and no console errors appear in the
   WKWebView devtools.
2. **WKWebView rendering pass.** Open `samples/torture-test.md` and compare it
   against the Chromium screenshots taken in this container (scratchpad
   `audit-*.png`, `folio-*.png`, `drill-*.png`). PLAN.md §8 warns WKWebView is not Chromium —
   look specifically at: Shiki code block backgrounds/borders, KaTeX spacing,
   the Mermaid diagram's fills/strokes, `color-mix()` support (the hairline
   `--border-faint` token uses it), and the entrance fade-up animation.
3. **Startup restore.** Pick a root, quit the app fully, relaunch. Confirm the
   tree, the watcher, and the root name all come back with no user action.
4. **Drive-sync live-reload + the real kill-test.** Point the root at a
   Drive-synced folder (or just a plain folder if Drive isn't handy). Edit a
   file in another app/editor while it's open in Markdown Reader — confirm the Reader
   updates within ~1s without losing scroll position. Then run the actual
   kill-test: open a file in the editor, make an edit, then externally
   change the same file on disk (another editor, or `echo >> file.md` from a
   terminal) before saving — confirm the conflict banner appears and that
   each of Keep mine / Take theirs / Show both behaves exactly as it does in
   the browser-mode simulation (this container only ever exercised the
   simulated-mtime version of this path, never a real second writer on a
   real file).
5. **Menu bar + About + accelerators.** Confirm the App/File/Edit/View/Go/
   Window menu bar appears and matches the structure documented above. Open
   About Markdown Reader — check it shows "Markdown Reader" and "© 2026". Click every custom
   menu item once and confirm it does what its equivalent keyboard shortcut
   does (and doesn't double-fire if you also press the shortcut). Specifically
   check `⌘N`, `⌘⇧O`, and `⌘0` (Actual Size) — these three have **no**
   frontend keydown handler and are reachable only through the menu, so
   they're the ones most likely to reveal a wiring mistake.
6. **File associations / Open With / dock-drop.** From Finder: right-click a
   `.md` file → Open With → Markdown Reader (should open the file, and the full
   workspace if it's inside the last-used root). Drag a `.md` file onto the
   Markdown Reader dock icon. Both should fire the `open-file` event (already
   logged to console from Session B — confirm it still fires, and that a
   drag-and-drop lands on the right file).
7. **File ops against a real disk.** Create a file via `⌘N`/the New File
   dialog and confirm it lands on disk with `# Title\n`. Rename a file via
   the tree's context menu and confirm the file on disk is actually renamed
   (not copied) and that any open document/history reference follows it.
   Move a file to the bin and confirm it actually lands in the macOS Trash
   (recoverable), not permanently deleted.
8. **Print → PDF.** `⌘P` (or File > Print… from the menu — now wired natively
   in Rust via `WebviewWindow::print()`, since `window.print()` doesn't work
   on macOS WKWebView) against `torture-test.md`. Compare
   the resulting PDF against the
   `print-page-*.png` renders from this session — look for the same things:
   no chrome, no broken code blocks, headings not orphaned, black-on-white,
   sensible margins.
9. **Performance.** Point the root at (or synthesize) a ~500-file vault and
   confirm `⇧⌇F` search returns in well under a second (PLAN.md §7 Phase 5
   acceptance criterion — only ever checked against the browser-mode vault
   equivalent in this container, never the real Rust `search` command at
   scale).
10. **`npm run tauri build` → `.dmg`.** Build on the M5 Air, not the Intel
    machine, if both are available — PLAN.md §8 notes Rust release builds are
    slow on Intel. The real app icon (`npx tauri icon` output, `bundle.icon`
    in `tauri.conf.json`) should already be in place from an earlier session
    — confirm it appears correctly in the Dock and the `.dmg` installer, not
    the Session A placeholder PNG.

## v2 candidates (out of scope for v1 — do not build hooks for these speculatively)

Backlinks panel, graph view, tabs, cloud APIs, plugins, themes beyond the
house theme, publishing — per PLAN.md §1's explicit out-of-scope list, plus
whatever Phase 7 (Android, `tauri android init`) needs once v1 is confirmed
solid on the Mac.
