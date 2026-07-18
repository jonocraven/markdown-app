# Markdown Reader — sync workflow

The app is sync-agnostic: it only ever sees a folder of plain `.md` files. Sync to cloud storage is done entirely outside the app by a folder-mirroring tool — no Drive APIs, OAuth, or cloud awareness inside Markdown Reader itself.

## Desktop

The root folder already lives inside Google Drive (or any equivalent cloud folder). Markdown Reader reads and writes to this folder directly via the filesystem.

## Android

On Android, use Autosync for Google Drive (FolderSync is an alternative) to mirror the same Drive folder to a local folder on the device, e.g. `/storage/emulated/0/Documents/Notes`. Set up two-way sync: any file changes on Drive appear on the device and vice versa.

Then, in Markdown Reader, select that local folder as the root. The app treats it like any other folder — the sync layer is entirely transparent.

**Keep the root on internal storage**, not an external SD card. FAT-formatted SD cards have 2-second mtime granularity, which weakens the conflict check that guards edit-during-sync races (see below).

## How the app copes

When Autosync writes a file, the app's filesystem watcher (`notify`) detects the change as an external edit and live-reloads the view — same as if the file had been edited in another app.

If you edit a file while Autosync is syncing it, the mtime-checked atomic write path guards against data loss. The app stores the expected modification time when it reads the file; if the file has changed on disk when you save, the save is refused and a non-modal conflict banner appears (keep mine / take theirs / show both). This conflict path was built for precisely this race — see PLAN.md §8.

## Deleted files

On Android, deleted files don't vanish permanently — they move to a `.mdreader-bin/` directory at the root, optionally with a timestamp suffix on collision. The bin folder syncs like any other folder, so a deleted file is recoverable from any device that can reach the sync folder.

## Android lifecycle

When the app is backgrounded, Android may suspend it entirely. The watcher misses any sync events that land while suspended. On resume (when the app returns to the foreground), the app automatically re-reads the file tree and re-reads the currently open file. The stored mtime makes this cheap — content only re-renders if it actually changed.

No foreground service: the app is a reader, not a daemon. The suspend-and-refresh approach is sufficient.

## Verification

A full sync round-trip is verified once in Phase A4:

1. Edit a file on the desktop; within a sync cycle it appears on the phone.
2. Edit the same file on the phone; within a sync cycle it appears on the desktop.
3. Make concurrent edits (desktop and phone simultaneously mid-sync) and confirm the conflict banner appears on the first save; no data is lost either way.
4. Confirm no false-positive conflict banners appear when files are at rest.
