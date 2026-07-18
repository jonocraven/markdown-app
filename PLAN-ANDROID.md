# Folio — Android Implementation Plan (Phase 7)

*The companion brief to PLAN.md. Read that first — everything here assumes v1 desktop is built (it is) and describes only what Android adds or changes. Written to be handed directly to Claude Code; work one phase per session.*

This is a port, not a rewrite. The codebase already runs on one shared React/TS frontend and one Rust core, the desktop-only surfaces (menu bar, `RunEvent::Opened`) are already `#[cfg]`-gated, and the browser-mode virtual vault means most mobile UI work is testable in Chromium with a phone viewport before ever touching a device. The job is: make storage work on Android, make the shell single-column and touch-first, and package a signed APK. The Reader's typography remains the product — a phone is *more* like a page than a desktop window, not less.

---

## 1. Ground rules

- **One codebase, no forks.** Android differences live behind CSS media queries, a coarse-pointer/platform check in the frontend, and `#[cfg(target_os = "android")]` in Rust. Never duplicate a component into a `Mobile` variant when a conditional inside it will do.
- **The desktop regression suite is inviolable.** All five Playwright scripts (smoke, links, edit, search, file ops) must pass unmodified after every Android session. A sixth mobile script gets added in Phase A2 and joins them.
- **The app stays sync-agnostic.** It only ever sees a folder of plain `.md` files. Sync to Google Drive is done *outside* the app by a folder-mirroring tool (Autosync — see §5). Do not add Drive APIs, OAuth, or any cloud awareness.
- **Sideload distribution.** This is a personal app installed as an APK, not a Play Store listing. That fact drives the storage decision in §2 — revisit §2 before ever submitting to Play.

## 2. Storage decision: All Files Access, real paths

**Recommendation: request `MANAGE_EXTERNAL_STORAGE` ("All files access") and keep the entire Rust core unchanged.**

The problem: the whole Rust core (`commands.rs`) — tree walking, atomic mtime-checked writes, the `notify` watcher, ripgrep search — operates on real `std::fs` paths. Android's sanctioned folder picker (SAF / `ACTION_OPEN_DOCUMENT_TREE`) returns `content://` URIs, not paths, and driving `DocumentFile` from Rust would mean rebuilding the storage layer as a Kotlin bridge plugin: a rewrite of exactly the code that is most load-bearing (the conflict-safe write path) and best tested.

For a sideloaded personal app, `MANAGE_EXTERNAL_STORAGE` is permitted, grantable in Settings, and gives real paths under `/storage/emulated/0/…`. With it:

- `read_tree`, `read_file`, `write_file` (atomic + mtime conflict check), `search`, `build_link_index` work **unchanged**.
- `notify` uses inotify on Android — `watch_root` works unchanged on real paths.
- A sync tool mirroring a Drive folder to local storage produces exactly the folder-of-files the app already understands.

Two things do change:

- **Folder picking.** The dialog plugin's picker returns SAF URIs on Android — useless to us. Replace it (Android only) with a small in-app folder browser: a new read-only Rust command `list_dirs(path) -> Vec<DirEntry>` starting at `/storage/emulated/0`, rendered in the house style (mono list, hairline rules), persisting the choice through the existing store exactly as `pick_root` does.
- **Delete.** The `trash` crate has no Android backend. `#[cfg]`-gate `delete_file`: on Android, move the file to a `.folio-bin/` directory at the root (timestamped suffix on collision). It's a rename, not a new write path; the tree walker already skips hidden directories so the bin never appears in the UI. Note it in SYNC.md — the bin folder syncs like anything else, which is a feature (recoverable from any device).

The SAF/Kotlin bridge is the correct Play-Store architecture and is explicitly **out of scope** — documented here only so nobody half-builds it speculatively. If Play distribution ever matters, that becomes its own plan.

## 3. Shell adaptation — single column, touch-first

Below ~768px (and always on Android) the three-pane shell becomes:

- **App bar** (top, mono chrome, hairline bottom rule): a tree/drawer button, the document title (file stem, Jost light) with the path in small mono caps beneath, and actions — search, quick open, edit toggle, overflow (⋮: Contents, Zoom In/Out/Actual Size, New File). The overflow replaces the desktop menu bar, which is already `#[cfg(desktop)]`-gated and simply doesn't exist here.
- **File tree** — left slide-in drawer over a scrim, same `Tree` component. Tapping a file navigates and closes the drawer.
- **TOC** — bottom sheet (opened from the overflow / app bar), same `Toc` component with scroll-spy. Tapping an entry scrolls and dismisses.
- **Search and quick switcher** — full-screen takeovers of the same components, inputs at the top for thumb reach.
- **Reader** — full width with the same reading measure; on a phone the column naturally fills. The footer chrome (word count) moves into the app bar's document subtitle or disappears — the page is the show.

**The system back button must behave like a browser.** Mirror app navigation into the WebView's own history: on every `navigate()` push a state (`history.pushState`), on overlay open push a state, and handle `popstate` by closing the top overlay if one is open, else `goBack()`. Hardware back then walks Folio history for free and exits the app only from the history root. This must be a Sonnet task — it touches the history store's contract — and it must not disturb desktop behaviour (⌘[/⌘] keep working through the store as now).

**Lifecycle:** Android suspends backgrounded apps and the watcher misses events while suspended. On `visibilitychange → visible`, re-run `read_tree` and re-read the open file (the mtime in the store makes this cheap — content only re-renders if it actually changed). The editor's unsaved buffer is never discarded by this refresh; the existing conflict banner covers the collision case.

**Touch specifics:** minimum 44px targets everywhere (tree rows, TOC entries, checkboxes get an enlarged tap area around the 13px visual box); the code copy button is always visible on coarse pointers (no hover on phones); the tree context menu (rename / move to bin) opens on long-press instead of right-click; text inputs stay ≥16px (already a §6 rule — it also prevents Android's focus zoom).

**Editor:** CodeMirror 6 works on mobile WebView. Set the viewport meta so the keyboard resizes content (`interactive-widget=resizes-content`), keep autosave as the primary save path (there is no ⌘S), and add a "Done" affordance in the app bar during editing that flushes the save and returns to the reader.

## 4. What carries over untouched

Worth stating so no session "helpfully" rebuilds it: the entire unified pipeline and Reader (Android WebView is Chromium-based — *closer* to the test bed than WKWebView is), Shiki/KaTeX/Mermaid theming, bundled fonts, the conflict banner and write path, link routing and wikilink resolution, search and quick-switcher logic, the store, the print stylesheet (printing from Android WebView works via the system print service), and the `RunEvent::Opened` handler — its `cfg` already includes Android; it needs only an intent-filter in the manifest (§6 Phase A4) to receive `.md` opens from the Files app.

## 5. Sync workflow (outside the app)

Documented in a new `SYNC.md` for future reference, verified once in Phase A4:

1. Desktop: the root lives inside Google Drive (already the case).
2. Android: install Autosync for Google Drive (or FolderSync); pair the same Drive folder with a local folder, e.g. `/storage/emulated/0/Documents/Notes`; two-way sync.
3. Folio's root = that local folder. The watcher picks up Autosync's writes like any external edit; the mtime conflict check already guards the edit-during-sync race — that path was built for precisely this (PLAN.md §8).

Keep the root on internal storage: FAT-formatted SD cards have 2-second mtime granularity, which weakens the conflict check.

## 6. Build phases, model assignments and acceptance criteria

Same rules as PLAN.md §7: plan mode first, one phase per session, commit at every green acceptance check, keep CLAUDE.md's phase line current. Sonnet 4.6 for anything touching Rust, storage, the history contract or the editor; Haiku 4.5 for mechanical CSS/touch polish; escalate a twice-stuck task to Opus and drop back. Phases A2 and A3 are largely verifiable in the existing container test bed (Playwright device emulation — Pixel viewport, `hasTouch`); A0, A1, A4, A5 need the Mac with a device or emulator attached.

**Phase A0 — Toolchain + first boot** · *Sonnet 4.6* · *on the Mac*
Install Android Studio (SDK, NDK, platform-tools), JDK 17, `rustup target add aarch64-linux-android x86_64-linux-android` (device + emulator); `tauri android init`; **commit the generated `src-tauri/gen/android/`** (it will carry manifest and activity edits in later phases — remove `src-tauri/gen` from `.gitignore`); `npm run tauri android dev` to a device or emulator.
✓ The app opens on Android showing the existing shell (desktop-shaped is fine for now) with the empty state. ✓ Desktop `npm run tauri dev` still works from the same checkout.

**Phase A1 — Storage** · *Sonnet 4.6* · *on the Mac*
`MANAGE_EXTERNAL_STORAGE` in the manifest + a first-run flow that explains why and deep-links to the system "All files access" toggle (the opener plugin can launch the settings intent URI; a tiny Kotlin addition to the generated activity is acceptable if needed); the in-app folder browser on a new `list_dirs` command; `#[cfg(target_os = "android")]` delete-to-`.folio-bin`; resume-refresh on `visibilitychange`.
✓ Pick a real folder on the device; tree loads; open, edit, save a file; the kill-test (edit externally via `adb shell` mid-edit, then save) raises the conflict banner on-device. ✓ Binned file lands in `.folio-bin/` and vanishes from the tree. ✓ `cargo check`/`clippy` clean for both desktop and Android targets.

**Phase A2 — Responsive shell + back button** · *Sonnet 4.6 (shell structure, history↔WebView-history mirroring); Haiku 4.5 (CSS polish)* · *mostly container-testable*
Single-column layout, app bar, tree drawer, TOC bottom sheet, full-screen search/switcher; `popstate` back-button contract from §3. New `mobiletest.mjs` regression script (Pixel viewport + touch) joins the suite.
✓ All five desktop scripts still green. ✓ `mobiletest.mjs`: drawer opens/closes, navigation works, popstate walks history then stops at root, TOC sheet scrolls the document. ✓ On device: hardware back behaves per §3.

**Phase A3 — Touch + editor ergonomics** · *Sonnet 4.6 (editor/keyboard, long-press); Haiku 4.5 (target-size audit, always-visible copy, overflow menu)* · *mostly container-testable*
Everything in §3's touch and editor paragraphs.
✓ Long-press on a tree row opens the context menu (and right-click still works on desktop). ✓ Editing with the on-screen keyboard keeps the caret visible; "Done" flushes the save. ✓ A 44px audit pass of every interactive element, screenshots reviewed against PLAN.md §6.

**Phase A4 — Intents + sync verification** · *Haiku 4.5 (manifest intent-filter, SYNC.md); Sonnet 4.6 if the open-file path needs work* · *on the Mac*
Intent-filter for `text/markdown`/`.md` in the manifest so Files → Open With → Folio works, feeding the existing `open-file` event; write SYNC.md per §5; verify the full Drive → Autosync → Folio → edit → back-to-Drive round trip on the device.
✓ Tapping an `.md` in the Files app opens it in Folio (workspace too, if it's inside the root). ✓ An edit made on the desktop appears on the phone within a sync cycle, and vice versa, with no conflict-banner false positives at rest.

**Phase A5 — Packaging** · *Haiku 4.5* · *on the Mac*
Generate a personal keystore, wire signing into the Gradle config, `npm run tauri android build -- --apk --target aarch64` for a signed release APK; confirm the adaptive icon uses the cream/ink monogram (the Android mipmap set was already generated by `tauri icon` in desktop Phase 6); sensible `versionName`/`versionCode`.
✓ The APK installs on the phone from a file, opens, retains its root across reinstall (store survives), and shows the right icon in the launcher.

## 7. Risks and gotchas

- **WebView version variance.** Android WebView updates independently of the OS. `color-mix()` (used by the `--border-faint` token) needs WebView ≥111 — fine on any recent device, but check `chrome://webview` version if hairlines vanish; ship a plain-rgba fallback for that one token if it bites.
- **Process death.** Android can kill the app entirely in the background, not just suspend it. Persisted state (root, panes, tree expansion) already survives via the store; the unsaved editor buffer does not — the 2s autosave makes the window small, but don't add complexity to shrink it further in v1.
- **Watcher while suspended** misses events — that's what the resume-refresh in A1 is for. Don't try to keep the watcher alive with a foreground service; it's a reader, not a daemon.
- **Two sync layers interacting.** Drive ↔ Autosync ↔ disk ↔ Folio: the only dangerous window is an external write landing mid-edit, and the mtime conflict banner owns that. Resist any urge to "coordinate" with Autosync.
- **`gen/android` is generated once, then owned.** Manifest and activity edits live there; if it's ever regenerated (`tauri android init` again), those edits are lost — hence committing it in A0.
- **Emulator limits.** No real Drive/Autosync on the emulator; storage-permission flows differ subtly. A0–A3 are fine on the emulator; A4–A5 want the real phone.
- **Keep the phone's font scale in mind.** Android's system font scaling multiplies rem-based sizes; test at 100% and 130%. The measure (~70ch) should shrink gracefully, never horizontally scroll.

## 8. CLAUDE.md additions (append when Phase A0 starts)

```markdown
## Android (Phase 7 — PLAN-ANDROID.md)
- One codebase: Android differences via media queries / coarse-pointer checks
  in TS and #[cfg(target_os = "android")] in Rust. No Mobile* component forks.
- Storage: All Files Access with real paths (PLAN-ANDROID.md §2). The Rust
  core is unchanged; folder picking uses the in-app browser, delete goes to
  .folio-bin/ on Android. Never introduce SAF/content:// URIs into the core.
- The 5 desktop Playwright scripts + mobiletest.mjs must all pass after every
  session. Desktop `npm run tauri dev` must keep working from this checkout.
- src-tauri/gen/android is committed and hand-edited (manifest, activity).
  Never rerun `tauri android init` over it.
```

## 9. Suggested first prompt for Claude Code

> Read PLAN.md and PLAN-ANDROID.md in full. We're starting Phase A0 on this Mac with my Android device attached. Enter plan mode, confirm the toolchain steps and what `tauri android init` will generate, then implement once I approve. Acceptance criteria in PLAN-ANDROID.md §6 are the definition of done.
