# Markdown Reader — handoff and next steps

*Written at the end of Phase 6 (Session F, July 2026). Read PLAN.md first. Every
feature in the v1 spec (§4) is now built and verified as far as this Linux
container can verify it — full unified rendering pipeline, root/tree/watch,
links + history, editor + conflict-safe writes, search + quick switcher, file
ops (create/rename/delete-to-bin), the native menu bar, and the print
stylesheet. What's left is entirely Mac-side verification (WKWebView, a real
window, a real filesystem, a real build) — the single checklist below is that
verification pass, written to run once on the Mac before shipping.*

## Android (Phase 7 — PLAN-ANDROID.md): container work done, Mac work remaining

*Added July 2026 (Session G, this Linux container). Everything below the
checklist was implemented and verified here; the checklist itself needs the
Mac with the Android phone (or an emulator) attached. Read PLAN-ANDROID.md
first — §6's acceptance criteria are the definition of done.*

**Done in this container (all committed, all six regression scripts green):**

- **Regression suite committed** — the five desktop Playwright scripts were
  rebuilt (they'd only ever lived in a session scratchpad) and now live in
  `tests/` with `npm run test:all`; a sixth, `mobiletest.mjs` (Pixel
  viewport + touch + `?platform=android`, 20 checks), joined them in A2/A3.
- **A1 storage code** — `list_dirs`/`set_root` commands; `#[cfg(target_os =
  "android")]` delete-to-`.mdreader-bin/` (`trash` is now a desktop-only
  dependency; `cargo check`/`clippy` clean for `aarch64-linux-android`);
  the in-app FolderBrowser (house style, first-run All-Files-Access
  explainer, opener-plugin settings deep-link); resume-refresh on
  `visibilitychange` that never clobbers a dirty editor buffer.
- **A2 responsive shell** — below 768px (or Android): app bar, tree drawer
  over a scrim, TOC bottom sheet, full-screen search/quick-switcher
  takeovers; the hardware-back contract via `src/historyBridge.ts`
  (pushState per navigation/overlay, popstate closes-overlay-else-goBack,
  drift-guarded). Desktop three-pane shell is pixel-unchanged.
- **A3 touch + editor** — long-press (500ms) opens the tree context menu on
  touch (right-click untouched on desktop); app-bar "Done" flushes the save
  through the exact ⌘S path and exits to the reader (conflict banner
  surfaces on mtime mismatch); `interactive-widget=resizes-content`
  viewport meta; 44px tap targets and always-visible code copy buttons on
  coarse pointers.
- **SYNC.md** — the Drive ↔ Autosync ↔ local-folder workflow doc (§5).
- **.gitignore** no longer ignores `src-tauri/gen/` (ready for A0's commit).

**Not possible in this container** (no Android SDK — `dl.google.com` is
blocked by the network policy): `tauri android init`, so `src-tauri/gen/
android` does not exist yet, and therefore no manifest edits, no on-device
verification, no APK. That is exactly the Mac-side list below.

### Mac checklist (work down in order; one phase per session)

**IMPORTANT: All the following work MUST run on your Mac locally** — not in a cloud session. Here's why: the Android SDK and NDK need to be installed on your Mac; your phone connects via USB to your Mac (cloud can't see it); and you need to physically test the app on your phone at each step.

---

#### **Phase A0 — Setting up Android tools and first boot**

**What this phase does:** Installs the Android development tools on your Mac, configures them, tells Rust how to build for Android, and gets the app running on your phone for the first time.

**Step 1: Install Android Studio and Android SDK/NDK**
- Download Android Studio from https://developer.android.com/studio
- Install it on your Mac (drag to Applications)
- Open Android Studio
  - It will ask you to install the Android SDK, NDK, and platform-tools — **say yes to all of these**
  - These are the compiler toolkits that turn your code into Android app instructions
  - Let it finish (may take 10–15 minutes)
- Once done, close Android Studio

**Step 2: Install JDK 17 (the Java compiler)**
- Go to https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html
- Download the macOS installer (arm64 if you have an Apple Silicon Mac; x86_64 if you have an Intel Mac)
- Run the installer and follow the prompts
- Verify it worked by opening Terminal and typing: `java -version` — should show "17.x.x"

**Step 3: Tell Rust to add Android build targets**
- Open Terminal and run:
  ```
  rustup target add aarch64-linux-android x86_64-linux-android
  ```
  - This tells Rust it can now compile code for Android ARM processors (aarch64 is what most phones use; x86_64 is for emulators)
  - This may take a few minutes

**Step 4: Plug in your phone and enable USB debugging**
- Connect your Android phone to your Mac via USB cable
- On your phone: go to Settings → About phone → tap Build number 7 times (this enables Developer Options)
- Go back and find Developer Options → enable USB Debugging
- A dialog will appear asking if you trust the Mac — tap "Allow" or "Trust"
- In Terminal, run: `adb devices` — you should see your phone listed

**Step 5: Generate the Android app folder structure**
- In Terminal, navigate to the markdown-app folder: `cd ~/markdown-app` (or wherever you cloned it)
- Run: `npm run tauri android init`
  - This command generates the folder `src-tauri/gen/android/` with all the Android project files
  - It will take 2–3 minutes
  - When done, you should see no errors

**Step 6: Commit the generated Android folder**
- Run these commands:
  ```
  git add src-tauri/gen/android/
  git commit -m "Phase A0: Add generated Android project (tauri android init)"
  git push -u origin claude/brief-implementation-delegation-xzr7fe
  ```
  - This saves the Android project files to your git branch
  - These files **must never be deleted or regenerated** — they'll be hand-edited in the next steps

**Step 7: Test the app on your phone**
- Run: `npm run tauri android dev`
  - This builds the app and installs it on your connected phone (~5–10 minutes first time)
  - Watch for "success" message at the end — if you see errors, the build failed
- On your phone: you should see the Markdown Reader app open
  - You should see the three-pane shell (menu bar at top, file list on the left, empty reader area)
  - Tap around and make sure it doesn't crash
  - If it crashes or shows a blank white screen, open Terminal again and look at the error messages

**Step 8: Verify the desktop still works**
- Run: `npm run tauri dev` (the regular desktop build)
  - This should open the Markdown Reader window on your Mac, just like before
  - If this broke, something went wrong — go back and check the Rust build errors

**When to move to the next phase:** You see the app's shell on your phone and the desktop build still works.

---

#### **Manifest edits (Android permissions and file-opening)**

**What this phase does:** Tells Android that your app needs permission to read all files on the phone, and that it can open `.md` files from other apps (like the Files app).

**Where to make changes:** `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- This is a plain-text configuration file that describes what your app needs
- It's inside the folder generated by `tauri android init`

**Edit 1: Add All Files Access permission**
- Open the file in your text editor
- Find the line `<uses-permission ...>` section (there should be a few already)
- Add this new line in that section:
  ```xml
  <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
  ```
  - This tells Android "this app needs to read/write files anywhere on the phone's storage"
  - When users first run the app, they'll get a prompt to grant this permission

**Edit 2: Add an intent-filter so Files app can open `.md` files**
- Find the `<activity ... android:name=".MainActivity">` section
- Inside the `<activity>` tag, add this intent-filter:
  ```xml
  <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:mimeType="text/markdown" />
      <data android:mimeType="text/x-markdown" />
      <data android:scheme="file" />
      <data android:pathPattern=".*\.md" />
  </intent-filter>
  ```
  - This tells Android: "Markdown Reader can open `.md` files"
  - When users tap a `.md` file in the Files app and choose "Open With", Markdown Reader will appear in the list

**When done:** Save the file and commit:
```
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "A0 manifest: add All Files Access permission and .md file-opening intent"
git push
```

---

#### **Phase A1 — Testing file access and conflict detection**

**What this phase does:** Verifies the app can read files, that the conflict detection works, and that deleted files go to the `.mdreader-bin` folder (not permanently deleted).

**Step 1: Grant All Files Access**
- Run the app again: `npm run tauri android dev` (or just tap the app icon if it's still installed)
- The app will show a dialog asking for "All Files Access" — tap Allow
- This gives the app permission to read/write files on the phone

**Step 2: Pick a folder**
- The app will show a folder browser (drill-down UI with a breadcrumb at the top)
- Navigate to a folder that has some `.md` files (or create one for testing)
- Tap to select a folder — the file tree should load on the left

**Step 3: Open and edit a file**
- Tap a `.md` file in the tree — it should open on the right
- Tap the pencil icon (Edit button) to open the editor
- Make a small change (add a word, for example)
- Tap Done — the file should save

**Step 4: Test the mtime conflict detection**
- Open a file in the editor again and make a change (but don't save yet)
- Open Terminal on your Mac and run:
  ```
  adb shell "echo x >> /storage/emulated/0/Documents/Notes/filename.md"
  ```
  - Replace `Documents/Notes/filename.md` with the actual path to your file
  - This simulates another app (or the sync tool) editing the file while you're editing it
- Tap Save in the app — a conflict banner should appear at the top saying "File changed on disk"
  - Options: Keep mine / Take theirs / Show both
  - Tap one (any choice is fine for now) — the banner should close
- This proves the app detects simultaneous edits and doesn't lose data

**Step 5: Test delete-to-bin**
- Tap a file in the tree to select it
- Long-press on it (hold for ~1 second) — a context menu should appear
- Tap "Move to Bin"
- The file should disappear from the tree
- Open a file browser on your phone (Files app) and navigate to the folder — you should see a `.mdreader-bin` folder
- Inside `.mdreader-bin`, the deleted file should be there (not really gone, just moved to the trash)

**When to move to the next phase:** The app reads files, saves them, shows the conflict banner, and bins deleted files instead of permanently deleting them.

---

#### **Phase A2/A3 — Testing navigation and touch**

**What this phase does:** Verifies the phone UI works correctly — the back button navigates properly, drawers and overlays open/close, and touch targets are big enough.

**Step 1: Test hardware back button**
- Open a file so you're reading it
- Tap the back button (usually bottom-left corner of your phone)
  - The app should go back in history (if you've navigated multiple files, you should see the previous file)
  - Keep tapping — eventually you should go back to the empty state (no file selected)
  - Tapping back again should exit the app (or do nothing if already at root)
- The back button should never skip steps or jump unexpectedly

**Step 2: Test the drawer**
- Look for a hamburger menu (three horizontal lines) at the top-left
- Tap it — a drawer should slide in from the left showing your file tree
- Tap a file in the drawer — it should open, and the drawer should auto-close
- Tap the hamburger again — the drawer should close

**Step 3: Test the TOC (Table of Contents) sheet**
- Open a file that has headings (or `torture-test.md` from the samples folder)
- Look for a list icon in the top-right (or tap "Contents" in the overflow menu)
- A sheet should appear at the bottom showing the headings
- Tap a heading — it should scroll to that heading in the file
- Swipe down or tap outside the sheet to close it

**Step 4: Test search**
- Tap the search icon (magnifying glass) in the top bar
- A full-screen search panel should open
- Type a word — results should appear grouped by file
- Tap a result — it should open that file and scroll to the matching line
- Tap back or swipe down to close the search

**Step 5: Test the keyboard and editing**
- Open a file and tap Edit
- Make a change in the editor
- The on-screen keyboard should appear
- You should be able to see the text cursor and type without the keyboard covering what you're typing
- The text should remain visible as you type (keyboard doesn't hide what you're editing)

**Step 6: Test Done button**
- While editing, tap the "Done" button (top-right area)
- The editor should close, the file should save, and you should return to the reader
- If there's a conflict, a banner should appear

**Step 7: Test tap targets (44px rule)**
- All buttons should be easy to tap — they should feel generous in size (not tiny)
- Try tapping buttons with your thumb from one hand (not both hands) — they should be reachable and easy to hit

**Step 8: Test long-press context menu**
- Long-press (hold for ~1 second) a file in the tree
- A context menu should pop up with options (Rename, Move to Bin)
- Tap one of the options
- Tapping elsewhere should dismiss the menu

**Step 9: Test system font size**
- On your phone, go to Settings → Accessibility → Text and display size
- Change it to the largest size (or to a noticeably larger size like 130%)
- Open the Markdown Reader app
- Text should scale up, but **it must not scroll horizontally**
- Headings and lines should wrap to fit the screen, not overflow off the right edge

**When to move to the next phase:** Back button works, drawer/TOC/search open and close correctly, keyboard doesn't block your text, tap targets are comfortable, and text scales without horizontal scrolling.

---

#### **Phase A4 — Sync round-trip testing**

**What this phase does:** Verifies that edits made on your phone sync back to your desktop (or Drive), and vice versa. This is the full end-to-end workflow test.

**Step 1: Install Autosync on your phone**
- On your phone, open the Play Store
- Search for "Autosync for Google Drive" (or "FolderSync" as an alternative)
- Tap Install
- Open the app and follow its setup (sign into your Google account, pick your Drive folder, pick a local folder on the phone like `/storage/emulated/0/Documents/Notes`)
- Set it to two-way sync

**Step 2: Pick your synced folder in Markdown Reader**
- Open Markdown Reader
- Grant All Files Access again if prompted
- In the folder browser, navigate to the folder where Autosync is syncing (e.g., `/storage/emulated/0/Documents/Notes`)
- Select it as the root

**Step 3: Test desktop → phone sync**
- On your Mac, open Finder and navigate to the same Google Drive folder
- Create a new `.md` file or edit an existing one
- Wait 30 seconds for the sync to happen (Autosync typically syncs every minute)
- On your phone in Markdown Reader, the file should appear in the tree (if new) or show the updated content (if edited)
- No manual refresh should be needed — the app watches for changes

**Step 4: Test phone → desktop sync**
- On your phone in Markdown Reader, open a file and edit it
- Tap Done to save
- Wait 30 seconds for Autosync to sync
- On your Mac, open Finder and refresh the folder — the change should be there
- If you open the file on your desktop Markdown Reader (or in any editor), it should show your phone's edit

**Step 5: Test mid-edit conflict**
- On your desktop, open a file in Markdown Reader
- Start editing (make a change but don't save)
- On your phone, use Autosync to manually trigger a sync (or wait for the next auto-sync cycle)
  - This will sync a version of that file from your Drive
- Tap Save on your Mac before the sync lands — a conflict banner should appear
- On the phone, do the same: start editing, let a sync land from the desktop, then tap Done
  - A conflict banner should appear on the phone too
- Each app should let you choose: Keep mine / Take theirs / Show both
- This proves the app protects your edits when two devices edit at the same time

**Step 6: Test "Open With" from Files app**
- On your phone, open the Files app
- Navigate to the synced folder
- Long-press a `.md` file and tap "Open With"
- Markdown Reader should appear in the list
- Tap it — the file should open in Markdown Reader
- The workspace (your root folder) should also be set if the file is inside your current root

**When to move to the next phase:** Desktop edits appear on the phone, phone edits appear on the desktop, simultaneous edits show a conflict banner, and Files app "Open With" works.

---

#### **Phase A5 — Signing and packaging the final APK**

**What this phase does:** Creates a release-signed APK (Android Package) that users can install. This is the step that makes the app distributable.

**Step 1: Create a signing keystore**
- A keystore is a file that contains a cryptographic key used to sign your app
- In Terminal, run:
  ```
  keytool -genkey -v -keystore ~/my-release-key.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
  ```
- It will ask for passwords and personal info — make up sensible answers and remember the keystore password
- This creates a file `~/my-release-key.keystore` on your Mac

**Step 2: Configure Gradle to use the keystore**
- Open `src-tauri/gen/android/app/build.gradle.kts` in your text editor
- Find the `buildTypes { release { } }` section
- Add this inside the `release { }` block:
  ```kotlin
  signingConfig = signingConfigs.getByName("release")
  ```
- Add this before `buildTypes`:
  ```kotlin
  signingConfigs {
      create("release") {
          storeFile = file(System.getenv("KEYSTORE_PATH") ?: "~/my-release-key.keystore")
          storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "your-password-here"
          keyAlias = System.getenv("KEY_ALIAS") ?: "my-key-alias"
          keyPassword = System.getenv("KEY_PASSWORD") ?: "your-password-here"
      }
  }
  ```
  - Replace `your-password-here` with the password you created above
  - This tells Gradle where to find the signing key

**Step 3: Build the APK**
- In Terminal, run:
  ```
  npm run tauri android build -- --apk --target aarch64
  ```
  - This builds the final signed APK (~10–15 minutes)
  - When done, you should see "Build succeeded" and a path to the APK file

**Step 4: Verify the app icon**
- The APK should include the adaptive icon (the app icon that appears on your phone's launcher)
- This was generated by `npx tauri icon` in an earlier session and should already be in `src-tauri/icons/android/`
- If the icons are missing, run: `npx tauri icon` to regenerate them

**Step 5: Set version info**
- Open `src-tauri/tauri.conf.json`
- Find the `version` field and set it to something like `"1.0.0"`
- Optional: Update `productName` if you want a different app name in the launcher
- Save the file

**Step 6: Test the final APK**
- Uninstall the dev version from your phone (hold the app icon in the launcher → Uninstall, or use `adb uninstall com.markdown-reader`)
- Transfer the APK file to your phone (email it to yourself, upload to Drive, or use `adb push`)
- On your phone, tap the APK file
- Tap "Install" (you may need to enable "Install from unknown sources" in Settings first)
- Once installed, tap "Open" to launch it
- Verify:
  - ✓ The app opens and shows the shell
  - ✓ The correct icon appears in the launcher (not a placeholder)
  - ✓ You can pick a folder and read files
  - ✓ When you uninstall and reinstall, your root folder setting is remembered

**When done:** Commit any changes:
```
git add -A
git commit -m "Phase A5: Configure signing and version info for release build"
git push
```

**When to consider Android launch ready:** All A0–A5 phases pass, the APK installs and works, and the sync loop is verified end-to-end.

---

**Known decisions/gaps to be aware of on the Mac:**
- `pick_root` is a stub on Android (returns an error; the frontend's `isAndroid()` branch never calls it) — folder choice goes through FolderBrowser → `set_root`.
- The FolderBrowser overlay is deliberately outside the hardware-back contract (PLAN-ANDROID.md §3 enumerates the tracked overlays); its Cancel affordance closes it. Wire it in later only if it feels wrong in hand.
- Browser-mode `vault.listDirs` serves a small fake directory tree so the FolderBrowser is testable in Chromium; real listing is the Rust command.

**Known decisions/gaps to be aware of on the Mac:**
- `pick_root` is a stub on Android (returns an error; the frontend's
  `isAndroid()` branch never calls it) — folder choice goes through
  FolderBrowser → `set_root`.
- The FolderBrowser overlay is deliberately outside the hardware-back
  contract (PLAN-ANDROID.md §3 enumerates the tracked overlays); its Cancel
  affordance closes it. Wire it in later only if it feels wrong in hand.
- Browser-mode `vault.listDirs` serves a small fake directory tree so the
  FolderBrowser is testable in Chromium; real listing is the Rust command.

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
