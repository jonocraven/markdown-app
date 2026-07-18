# Regression scripts

Five plain Node scripts (no test framework — Playwright driving headless
Chromium directly), matching the project's existing precedent. Each prints
progressive `ok — <check>` lines and exits `0` on pass / non-zero with a
clear `FAIL` message on the first failed assertion.

They exercise the app's **browser-only mode** (`vite dev` / `vite preview`),
which serves samples/**/*.md from an in-memory vault with full link
routing, history, editing and file ops — no Tauri shell needed (see
CLAUDE.md).

## Run everything

```
npm run test:all
```

Builds once, starts `vite preview` on a fixed port (4173, `--strictPort`),
runs all five scripts against it in sequence, then kills the server and
prints a pass/fail summary.

## Run one script

Each script is also standalone-runnable against an already-running preview
server:

```
npm run build && npm run preview   # in one terminal, port 4173 by default
npm run test:smoke                 # in another
```

Or point at a different origin/port with `PREVIEW_URL`:

```
PREVIEW_URL=http://localhost:5173 node tests/linktest.mjs
```

## Scripts

| Script | Covers |
| --- | --- |
| `smoke.mjs` | torture-test.md renders correctly: headings/TOC, table, task lists, footnotes, callouts, KaTeX, Shiki, lazy-loaded Mermaid, frontmatter, word count |
| `linktest.mjs` | relative/wikilink navigation, aliased wikilink text, anchor scroll, broken-link styling, create/disambiguate popovers, external links, back/forward history (buttons and ⌘[/⌘]) |
| `edittest.mjs` | ⌘E toggle, typing + 2s-idle autosave, the external-edit-while-dirty "kill test" and the conflict banner's keep-mine/take-theirs, task-checkbox write-back |
| `searchtest.mjs` | ⇧⌘F search panel (grouped results, scroll-to-line pulse), ⌘K quick switcher fuzzy match |
| `fileopstest.mjs` | New File dialog (create + cancel), tree context-menu rename (Enter/Escape) and Move to Bin (confirm/cancel) |

`helpers.mjs` holds the shared launch/assert/keyboard-chord/run scaffolding
all five scripts use.

## Notes

- Chromium must be reachable at `PLAYWRIGHT_BROWSERS_PATH` (this container
  has it preinstalled — do **not** run `playwright install`).
- All file ops run against the in-memory browser vault, which resets on
  every page load — nothing here touches the real `samples/` directory on
  disk.
- Generous timeouts throughout: Mermaid/Shiki lazy-loading and the 2s
  autosave debounce both need real wall-clock time.
