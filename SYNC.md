# Syncing your vault to Android

Markdown Reader is sync-agnostic (PLAN-ANDROID.md §1) — it only ever reads
and writes a folder of plain `.md` files on the device's local storage. It
has no Google Drive/cloud APIs and never will. Getting your notes onto the
phone in the first place is a separate concern, handled entirely outside
the app by a folder-mirroring sync tool.

## Recommended setup

1. **Desktop**: keep your vault inside a folder that's already synced to
   Google Drive (or whichever cloud storage you use) — this is presumably
   already true if you're reading this.
2. **Android**: install a two-way folder sync app — [Autosync for Google
   Drive](https://play.google.com/store/apps/details?id=com.ttxapps.drivesync)
   and [FolderSync](https://play.google.com/store/apps/details?id=dk.tacit.android.foldersync.lite)
   are both known to work well. Pair your Drive vault folder with a local
   folder on the device, e.g. `/storage/emulated/0/Documents/Notes`, set to
   **two-way sync**.
3. **In Markdown Reader**: on first launch, grant "All files access" when
   prompted (Settings → Apps → Markdown Reader → Permissions → Files and
   media), then use "Choose folder…" to pick that same local folder as the
   app's root.

From here, Markdown Reader's root *is* that local folder. The app watches
it with the same file-change mechanism it uses on desktop (`notify`,
backed by inotify on Android) and treats every sync-tool write exactly
like an edit from any other program.

## Why this is safe

- **The conflict banner is the safety net.** If the sync tool writes to a
  file while it's open and mid-edit, the mtime check in `write_file`
  catches it on the next save and surfaces the keep-mine/take-theirs/
  show-both banner — the same path that protects against any other
  external editor (PLAN.md §8). This is the one genuinely dangerous
  window in the whole setup; the app was built to handle it correctly
  from the start, not bolted on for Android.
- **Don't try to "coordinate" with the sync tool.** No app-level awareness
  of sync state, no pause-during-write logic, no polling the sync tool's
  own status. The mtime conflict check already covers the race.
- **Keep the root on internal storage**, not a FAT-formatted SD card — FAT
  has 2-second mtime granularity, which weakens the conflict check's
  ability to distinguish "just written by sync" from "written moments
  before I opened this file."

## The bin folder syncs too — and that's a feature

Deleting a file on Android moves it into a hidden `.mdreader-bin/`
directory at the root rather than deleting it outright (the `trash` crate
has no Android backend — PLAN-ANDROID.md §2). Because it's inside the
synced folder, `.mdreader-bin/` round-trips through Drive like anything
else: a file binned on the phone is recoverable from the desktop (and
vice versa isn't quite symmetric, since desktop delete goes to the real
system trash instead — but a phone-side accident is always recoverable
from any device with the vault synced). Markdown Reader's own tree view
never shows the bin folder's contents; clear it out from a file manager
(or a real desktop trash-empty) when you're confident you don't need
anything in it.

## Verifying the round trip

1. Edit a file on the desktop, wait for Drive to sync, then open Markdown
   Reader on the phone (or bring it to the foreground — it re-checks the
   open file and the tree on resume, PLAN-ANDROID.md §3) — the edit should
   appear with no conflict banner.
2. Edit a file on the phone, let Autosync push it back to Drive, then
   check the desktop app picks it up (its own watcher fires on the
   external write) — again, no conflict banner at rest.
3. Only if you edit the *same* file on both devices within the same sync
   cycle should you ever see the conflict banner — that's correct
   behaviour, not a bug.
