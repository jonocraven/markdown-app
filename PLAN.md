# Markdown Reader — Implementation Plan

*A beautiful, viewer-first markdown app for macOS (Android later). Working title "Folio", renamed to "Markdown Reader" post-v1 on real user feedback.*

This document is written to be handed directly to Claude Code. It contains the product spec, the technical architecture, the design direction with exact tokens, a phased build plan with per-phase model assignments, and acceptance criteria. Work one phase per session where possible.

**Correction (post-v1, on-device testing):** this original spec bound the quick switcher to `⌘P` while separately expecting `⌘P` to trigger printing — a self-contradiction. `⌘P` must be reserved for Print, not the quick switcher, so the quick switcher is bound to **`⌘K`** instead everywhere below. (Note, corrected later: `⌘P` printing is not something WKWebView provides for free — it required actually wiring a File > Print… menu item with that accelerator to `window.print()`; see Correction 4.)

**Correction 2 (post-v1, on real user feedback):** the Monochrome palette in §6 originally called for a cream (`#FAFADF`) ground and zero colour anywhere outside the Shiki code exception. On-device testing found the cream too warm/dated and the file tree too plain, so: (a) `--paper`/`--paper-2`/`--paper-3` are now a crisp white/light-grey ground instead of cream, (b) a single restrained accent colour (`--accent`, a muted terracotta, `#B0451F`) is now used deliberately — links, the active tree/TOC/quick-switcher item, checked checkboxes, selection colour, and small decorative touches — while everything else stays monochrome, and (c) the file browser is a single-column drill-down with a clickable breadcrumb (one folder fills the sidebar's full width; clicking a folder drills in; the breadcrumb jumps back to any ancestor; opening a file from a link/search/quick-switcher reveals it by snapping the browser to that file's folder), not an indented expand/collapse tree. (An earlier revision tried Finder-style Miller columns, but a narrow sidebar can't show more than two columns without cutting deep paths off, so the single-column drill-down replaced it.) Treat §6 and the tree description in §4/§7 as superseded by this note wherever they conflict.

**Correction 3 (post-v1, on real user feedback):** the working title "Folio" is renamed to **"Markdown Reader"** throughout — the macOS app name, window title, dock/About name, bundle identifier (`com.jonocraven.markdownreader`), Rust crate/binary, persisted settings filename, and every doc/comment. Treat every "Folio" mention below (including in this document) as "Markdown Reader". Two feature additions from the same round: a visible Back/Forward button pair (the ⌘[/⌘] history already described below was previously keyboard/menu-only), and a Favourites feature — pin files and folders from the tree's context menu, shown in a dedicated section above the file browser, persisted the same way as other UI state.

**Correction 4 (post-v1, on real user feedback):** `⌘P` printing turned out not to work at all — freeing the accelerator (Correction, above) was necessary but not sufficient. WKWebView has no built-in "⌘P prints the window" behaviour the way a real browser tab does; an app has to wire it up itself. Fixed by adding a real **File > Print…** native menu item with accelerator `CmdOrCtrl+P` (`build_menu` in `lib.rs`), whose `on_menu_event` handler the frontend catches and turns into `window.print()`. Also shipped in this round: the app icon (a bold white `#` on the terracotta accent field — Concept A of the icon brief), regenerated via `npx tauri icon` into every required size/format from a single 1024×1024 master at `src-tauri/icons/icon-source.png`.

---

## 1. Product overview

Markdown Reader is a local-first markdown viewer and light editor. The reading experience is the product: markdown files should render like a considered printed document, not a dev-tool preview. The reference quality bar is apps like MarkDrive (mark-drive.com) and Marked 2 — full GFM rendering, Mermaid diagrams, syntax-highlighted code, clean typography — but running natively on the Mac against a local folder.

Core concepts:

- **Root directory.** The user picks a root folder (e.g. a folder inside Google Drive). The app scopes everything to it: the file tree, link resolution, and search all operate against this root. The choice persists across launches.
- **Viewer-first.** The app opens in reading mode. Editing is a deliberate toggle (⌘E) into a source editor, not the default state.
- **Links between files are first-class.** Both standard relative markdown links (`[spec](./specs/api.md)`) and Obsidian-style wikilinks (`[[api spec]]`) navigate within the app, with back/forward history.
- **Plain files, no database.** Everything is ordinary `.md` files on disk. This is what makes the future Android version and Google Drive sync trivial: the storage layer is just a folder.

Out of scope for v1: backlinks panel, graph view, tabs, cloud APIs, plugins, themes beyond the house theme, publishing. These are all v2 candidates — do not build hooks for them speculatively.

## 2. Stack decision: Tauri 2 + React + TypeScript

**Recommendation: Tauri 2, with a React 18 + TypeScript + Vite frontend and a Rust backend.**

Rationale, in order of importance:

1. **One codebase covers macOS now and Android later.** Tauri 2 ships first-class Android (and iOS) support from the same project — `tauri android init` adds the target. Electron has no Android path at all; going native Swift would mean a full rewrite for Android.
2. **The best markdown rendering ecosystem is JavaScript.** unified/remark/rehype, Shiki, KaTeX and Mermaid are the strongest tools in existence for this job, and they all run in a webview. Flutter's markdown story (flutter_markdown and friends) is far weaker — patchy KaTeX, no serious Mermaid, painful fine-grained typography control. Since typography *is* this product, the web stack wins.
3. **Small and fast.** Tauri uses the system WKWebView on macOS, so the app is a few MB and light on RAM — appropriate for a document viewer, and comfortable on the Intel MacBook Pro. Rust handles file I/O, watching and search at native speed.
4. **Familiar ground.** The frontend is the same React/TS territory as WFDinner, so the codebase stays maintainable by its owner.

Trade-offs accepted: Rust has a learning curve (mitigated: Claude Code writes it; the Rust surface here is small and well-trodden), and WKWebView has occasional CSS quirks versus Chromium (mitigated: test in-app, not in Chrome).

Key crates and packages:

| Layer | Choice | Purpose |
| --- | --- | --- |
| Shell | `tauri` v2, `tauri-plugin-dialog`, `tauri-plugin-store`, `tauri-plugin-persisted-scope` | App shell, folder picker, settings persistence, remembering fs scope |
| File watching | `notify` crate (debounced) | Live-reload rendered view when files change on disk (e.g. Drive sync, Claude Code edits) |
| Search | `ignore` + `grep-searcher` + `grep-regex` crates (the ripgrep internals) | Fast full-text search respecting .gitignore/hidden files |
| Markdown | `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-react` | Core pipeline (GFM includes tables, task lists, strikethrough, footnotes, autolinks) |
| Wikilinks | small custom remark plugin (see §5) | `[[wikilink]]` support |
| Callouts | custom rehype transform for GitHub-style `> [!NOTE]` alerts | Callout/admonition blocks |
| Code | `shiki` | Syntax highlighting |
| Maths | `rehype-katex` + `remark-math` | LaTeX (`$…$`, `$$…$$`) |
| Diagrams | `mermaid` (client-side, rendered post-mount into fenced ```mermaid blocks) | Diagrams |
| Editor | CodeMirror 6 (`@codemirror/lang-markdown`) | Source editing mode |
| UI | React 18, plain CSS (CSS custom properties for tokens), `lucide-react` icons | No Tailwind; the design system is bespoke and small |

## 3. Architecture

Two clean halves connected by Tauri IPC commands:

**Rust core (src-tauri/)** owns everything that touches disk:

- `pick_root() -> RootInfo` — opens the native folder picker, persists choice + fs scope.
- `read_tree(root) -> Vec<TreeNode>` — recursive listing of `.md`/`.markdown` files and directories, skipping hidden files and honouring `.gitignore`. Returns a flat list with parent pointers (cheap to diff).
- `read_file(path) -> { content, mtime }` and `write_file(path, content, expected_mtime)` — write is atomic (write temp, rename) and refuses if `mtime` changed since read, returning a conflict the UI must surface. Atomic writes matter because the root will live inside Google Drive.
- `watch_root(root)` — emits debounced `fs-changed` events (created/modified/deleted with paths) to the frontend.
- `search(root, query) -> Vec<SearchHit>` — regex/literal search with per-hit line context, capped results, streaming if easy.
- `build_link_index(root) -> Vec<{ stem, path }>` — filename index for wikilink resolution and the quick switcher.

**React frontend (src/)** owns everything visual:

- `App` — three-pane layout: file tree (collapsible sidebar, left), document (centre), TOC (collapsible, right). Persist pane visibility and widths.
- `Reader` — the rendered document. This component is the product; see §6.
- `Editor` — CodeMirror 6, mounted when ⌘E toggles edit mode. Same document width and theme family as the reader so the mode switch feels like turning the page over, not changing apps.
- `Tree`, `Toc`, `SearchPanel` (⇧⌘F), `QuickSwitcher` (⌘K, fuzzy filename match against the link index).
- `historyStore` — simple back/forward stack (⌘[ / ⌘]) for in-app link navigation.
- State: Zustand or plain React context — keep it boring. No router needed; "navigation" is just setting the current file path.

Frontmatter: parse YAML frontmatter, hide it from the rendered body, and show it as a discreet mono-type metadata block above the title, collapsed by default.

## 4. Feature spec — v1

**Rendering (the lot):** full GFM (headings, tables, task lists, strikethrough, autolinks, footnotes), fenced code with Shiki highlighting and a copy button, `> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]` callouts, KaTeX maths, Mermaid diagrams, images (resolved relative to the file), horizontal rules, blockquotes with proper typographic treatment.

**Viewing:** smooth-scroll TOC with scroll-spy; reading-width column (~68–72ch) with generous margins; interactive task checkboxes in the rendered view that write the `[ ]`/`[x]` change back to the file (via the same conflict-safe write path); ⌘+/⌘− text zoom; word count in the footer chrome.

**Editing (light):** ⌘E toggles reader ⇄ source editor for the current file; ⌘S saves (plus autosave on a 2s idle debounce); external-change detection — if the file changes on disk while editing, surface a non-modal conflict banner (keep mine / take theirs / show both), never silently clobber. No WYSIWYG, no toolbar beyond a minimal formatting strip if trivial.

**Linking:** see §5.

**Navigation:** file tree sidebar with remembered expansion state; TOC panel; ⌘K quick switcher; ⇧⌘F full-text search with grouped-by-file results and click-to-open-at-line; back/forward history; drag-a-file-onto-the-app and "Open With → Markdown Reader" from Finder both work (register the app as an editor for `.md` in `Info.plist` via Tauri config).

**Files:** create new file (⌘N, prompts for name + folder), rename, delete-to-trash from the tree's context menu. Nothing fancier.

## 5. Link behaviour (recommended design)

Support **both** link styles, because they serve different sources of files:

- **Standard relative links** — `[API spec](./specs/api.md)` — are what AI tools, Claude Code and most exported docs emit, and they're portable to GitHub. Resolve relative to the *current file*. If the target resolves inside the root and exists, clicking navigates in-app (pushing history); anchors (`file.md#heading`) scroll to the heading after navigation.
- **Wikilinks** — `[[api spec]]` and `[[api spec|display text]]` — are fastest to type and survive file moves. Resolve against the filename index: match on file stem, case-insensitive; if multiple files share a stem, prefer the one closest to the current file's directory, and show a small disambiguation popover if still tied.
- **Broken links** render in graphite with a dashed underline; clicking a broken wikilink offers to create the file.
- External `http(s)` links open in the system browser (Tauri opener plugin). Non-markdown local links (images aside) open with the system default app.

Implementation: a ~60-line remark plugin turns `[[…]]` into link nodes with a `data-wikilink` attribute; a single click-handler on the reader intercepts all `<a>` clicks and routes them (in-app / browser / create-file) — never let the webview navigate natively.

## 6. Design direction — Monochrome (exact tokens)

The app is a reading instrument, so it uses the quietest of Jono's house directions: **Monochrome** — literary black-ink-on-cream, no chromatic accent, hairline rules, scholarly-ledger feel. Commit to it fully; do not drift toward generic SaaS chrome, cool screen-white, or shadcn defaults.

Fonts — import verbatim (and bundle locally in the app so it works offline; do not rely on the Google Fonts CDN at runtime):

```
https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400;500&family=Lora:ital,wght@0,400;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap
```

```js
const TOKENS = {
  display: "'Jost', system-ui, sans-serif",        // headings — weight 200–300, never bold
  serif:   "'Lora', Georgia, serif",               // body text and pull-quotes
  mono:    "'JetBrains Mono', ui-monospace, monospace", // chrome: sidebar, TOC, folios, code
  paper:   "#FAFADF",  paper2: "#F2F2D2",  paper3: "#F5F0E4",
  ink:     "#1A1A16",  graphite: "#5E5E54", graphiteLight: "#8A8A80",
  sizeH1: 40, sizeH2: 25, sizeBody: 16, sizeSmall: 12.5,   // ~1.25 scale
  radius: 2,  border: "1px solid #1A1A16",
  ease: "cubic-bezier(.2,.8,.2,1)", dur: "0.5s", stagger: 60,
};
```

Application notes:

- **Reader:** Lora for body at ≥16px with ~1.7 line-height; Jost 200–300 for headings at generous sizes; hairline 1px ink rules under h1/h2; blockquotes as Lora italic with a hairline left rule; the document title set large and light with the file path above it in small mono caps. Cream `paper` ground everywhere — this is a printed page, not a screen.
- **Chrome (tree, TOC, search, footer):** JetBrains Mono at `sizeSmall`, graphite, uppercase section labels, hairline separators. Chrome recedes; the document is the show.
- **Tables:** hairline rules only (top, header, bottom), no zebra striping, numeric columns right-aligned in mono.
- **Callouts:** no colour. Differentiate by a mono label (NOTE / WARNING…), a hairline border, and `paper2`/`paper3` fills. WARNING/CAUTION may use full-strength ink borders for weight.
- **Code blocks — the one sanctioned exception to no-chroma:** pure monochrome code is hard to scan, so use a *restrained* warm-light Shiki theme (start from `vitesse-light`, retint its background to `paper3` and mute saturation). Keep it quiet enough that a page of prose with one code block still reads as monochrome.
- **Mermaid:** theme it with the tokens (neutral theme, ink strokes, cream fills, Jost labels).
- **Motion:** one staggered fade-up on document load (per-block `animation-delay`), wrapped in `@media (prefers-reduced-motion: reduce)` which disables both animations and transitions. Nothing else moves.
- **Details:** visible on-brand `:focus-visible` rings (1px ink offset outline); any native controls (search input, selects) fully restyled; text ≥16px in inputs; no emoji as UI, `lucide-react` at 1.5px stroke for the few icons needed.
- **Print/PDF:** ship a print stylesheet — ⌘P should produce a beautiful PDF for free. On this design it nearly is the print stylesheet already.

## 7. Build phases, model assignments and acceptance criteria

General Claude Code strategy: use **plan mode** at the start of each phase; keep `CLAUDE.md` current (§9); one phase per session so context stays small; commit at every green acceptance check. Switch models with `/model` — the assignments below are about not spending Sonnet-level tokens on mechanical work. Rule of thumb: **anything touching the unified pipeline, Rust IPC, CodeMirror or the conflict-safe write path is Sonnet 4.6; anything you could describe as "mechanical" is Haiku 4.5.** Opus is not required for any phase — this codebase is medium-complexity with a clear spec, and on the Pro plan Opus would burn the shared usage pool for little gain. If a phase gets stuck twice on the same bug, escalate that one task to Opus, fix it, and drop back.

**Phase 0 — Scaffold** · *Sonnet 4.6*
Tauri 2 + React + TS + Vite project; window config (min size, title-bar style); plugins (dialog, store, persisted-scope, opener) wired; fonts bundled; TOKENS as CSS custom properties; empty three-pane shell rendering in the house style; macOS file-association for `.md` in the bundle config; git initialised.
✓ `npm run tauri dev` opens a styled empty shell on the Intel MacBook Pro. ✓ Dropping an `.md` on the dock icon fires the open event (log it for now).

**Phase 1 — Rendering pipeline + Reader** · *Sonnet 4.6 (pipeline and typography); Haiku 4.5 for the copy-button, zoom and footer chrome*
The unified pipeline with every §4 rendering feature; the Reader component fully styled per §6; frontmatter block; hardcoded sample document set covering every feature (keep as `samples/` — it doubles as the regression fixture forever).
✓ A torture-test document (tables, footnotes, callouts, KaTeX, Mermaid, task lists, nested code) renders correctly and beautifully. ✓ Reduced-motion honoured. ✓ Checkbox interaction stubbed (logs intended change).

**Phase 2 — Root directory, tree, open, watch** · *Sonnet 4.6 (Rust commands, watcher); Haiku 4.5 for tree UI polish and persisted UI state*
`pick_root`, `read_tree`, `read_file`, `watch_root`; tree sidebar with expansion memory; clicking opens in Reader; external edits live-reload the view (with scroll position preserved); Finder "Open With" now opens the file and, if it's inside the last root, the full workspace.
✓ Point at a real Drive-synced folder; edit a file in another app; Reader updates within ~1s without losing scroll.

**Phase 3 — Links + history** · *Sonnet 4.6*
Relative-link resolution, the wikilink remark plugin, link index, click routing, anchors, broken-link styling + create-on-click, back/forward with ⌘[ ⌘].
✓ A small linked vault (10 files, both link styles, one ambiguous stem, one broken link) navigates flawlessly; history behaves like a browser.

**Phase 4 — Editor + safe writes** · *Sonnet 4.6*
CodeMirror 6 with markdown mode themed to match; ⌘E toggle preserving scroll position roughly across modes; ⌘S + idle autosave through `write_file`; conflict banner; live checkbox write-back in Reader now real.
✓ Kill-test: edit, force an external change, confirm the conflict banner appears and no data is lost either way. ✓ Ticking a checkbox in Reader updates the file on disk.

**Phase 5 — Search + quick switcher** · *Sonnet 4.6 (Rust search command); Haiku 4.5 (results panel + ⌘K UI against the existing index)*
⇧⌘F panel, grouped hits, open-at-line (scroll + brief highlight); ⌘K fuzzy switcher.
✓ Search a 500-file root in well under a second; opening a hit lands on the right line.

**Phase 6 — Polish + packaging** · *Haiku 4.5 for chores (icon wiring, About window, README, menu items); Sonnet 4.6 for the print stylesheet and a final anti-pattern/gotcha audit against §6*
App icon (design separately — a cream/ink monogram); native menu bar with all shortcuts; print stylesheet; `tauri build` producing a signed-or-unsigned `.dmg`/`.app` for x86_64 (Intel) — and universal if building on the M5 Air.
✓ Installable app opens `.md` from Finder on the Intel MacBook Pro and prints a clean PDF.

**Phase 7 (later) — Android** · *Sonnet 4.6*
`tauri android init`; root selection via Android's document picker (SAF) with persisted permission; touch targets and single-column responsive layout audit (largely free — the design is mobile-first by rule); sync via the Drive folder on desktop plus an Android-side sync tool (e.g. Autosync) mirroring the same folder locally — the app itself stays sync-agnostic because it only ever sees a folder of files.

## 8. Risks and gotchas

- **WKWebView is not Chrome.** Test rendering in the app; a couple of modern CSS features lag Chromium. Keep the CSS unexotic.
- **Google Drive sync + open files.** Drive can replace a file mid-edit; the mtime-checked atomic write path in §3 exists precisely for this. Never write without the conflict check.
- **Mermaid is heavy.** Lazy-load it only when a document contains a mermaid fence; render asynchronously so prose paints first.
- **Shiki bundle size.** Load only a curated language set (ts/js, python, rust, bash, json, yaml, html/css, sql, swift) and lazy-load the rest on demand.
- **Fonts must be bundled**, not fetched — the app must be fully offline. Declare correct-category fallback stacks anyway.
- **Large files.** For files >1MB, render without the entrance animation and virtualise if scrolling is ever janky (defer until it's actually a problem).
- **Intel Mac builds.** Fine in Tauri; just note release builds of the Rust side are slow on the Intel machine — build releases on the M5 Air where possible.

## 9. CLAUDE.md seed (drop into the repo root)

```markdown
# Markdown Reader — markdown viewer/editor (Tauri 2 + React + TS)
Read PLAN.md before any work. Current phase: <update me>.

## Rules
- Viewer-first. The Reader's typography is the product; never regress it.
- Design system: mostly Monochrome, crisp white/grey ground (PLAN.md §6,
  superseded by "Correction 2" above). One restrained terracotta accent
  (`--accent`) plus the muted code-highlighting exception — no other colour.
  File browser is a single-column drill-down with a breadcrumb (see
  "Correction 2" above), not an expand/collapse tree or Miller columns.
  No Tailwind, no shadcn, no emoji-as-UI.
- All disk writes go through write_file (atomic + mtime conflict check). Never
  add a second write path.
- Plain .md files on disk are the only storage. No database, no sidecar files
  except the app's own settings store.
- Keep samples/ rendering perfectly — it is the regression fixture. Check it
  after any pipeline or CSS change.
- UK English in all UI copy.

## Commands
npm run tauri dev · npm run tauri build · cargo fmt/clippy in src-tauri
```

## 10. Suggested first prompt for Claude Code

> Read PLAN.md in full. We're starting Phase 0. Enter plan mode, propose the exact scaffold steps and file layout, then implement once I approve. Use the acceptance criteria in PLAN.md §7 as your definition of done.
