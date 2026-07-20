import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRight, FolderOpen, FilePlus, ArrowLeft, ArrowRight } from "lucide-react";
import { Reader } from "./components/Reader";
import { Editor } from "./components/Editor";
import { ConflictBanner } from "./components/ConflictBanner";
import { Toc } from "./components/Toc";
import { Tree } from "./components/Tree";
import { Favourites } from "./components/Favourites";
import { LinkPopover } from "./components/LinkPopover";
import { SearchPanel } from "./components/SearchPanel";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { NewFileDialog } from "./components/NewFileDialog";
import { FolderBrowser } from "./components/FolderBrowser";
import { AppBar } from "./components/AppBar";
import { OverflowMenu } from "./components/OverflowMenu";
import { useAppStore } from "./stores/appStore";
import { ipc, isTauri } from "./ipc";
import { vault, isConflictError } from "./vault";
import { setTaskMarker } from "./taskMarkers";
import { resolveLinkClick } from "./linkRouter";
import { dirname, sanitizeFileName, stripMdExt } from "./pathUtils";
import { isAndroid } from "./platform";
import { useIsMobile } from "./hooks/useIsMobile";
import { useHistoryBridge } from "./historyBridge";
import type { RenderedDoc } from "./markdown/pipeline";

const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
const AUTOSAVE_IDLE_MS = 2000;

type PopoverState =
  | { kind: "disambiguate"; candidates: string[]; x: number; y: number }
  | { kind: "create"; path: string; title: string; x: number; y: number };

type SaveStatus = "idle" | "saving" | "saved" | "unsaved";

/** A save that lost a race against a change on disk. Kept keyed by the path
 * it applies to, so the banner only shows while that same file is open —
 * see the render condition below — but the state itself isn't lost if the
 * user has since navigated away (PLAN.md §4/§8: never silently clobber). */
interface ConflictState {
  path: string;
  /** The content we tried (and failed) to save — "mine". */
  pendingContent: string;
}

const CONFLICT_DIVIDER = (diskContent: string) =>
  `\n\n<!-- ===== MARKDOWN READER CONFLICT: your version above — the version saved to disk is below. Merge by hand, then save. ===== -->\n\n${diskContent}\n<!-- ===== end of disk version ===== -->\n`;

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export default function App() {
  const {
    rootName,
    tree,
    currentPath,
    editing,
    showTree,
    showToc,
    theme,
    back,
    forward,
    setRoot,
    setTree,
    navigate,
    goBack,
    goForward,
    togglePane,
    toggleEditing,
    setEditing,
    setTheme,
    renamePath,
    removePath,
  } = useAppStore();

  const [source, setSource] = useState<string | null>(null);
  const [doc, setDoc] = useState<RenderedDoc | null>(null);
  const [zoom, setZoom] = useState(1);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);

  // ---- Phase A2: mobile single-column shell (PLAN-ANDROID.md §3) ----
  // Structural branching only — see src/hooks/useIsMobile.ts for how this
  // differs from the CSS breakpoint in src/styles/mobile.css.
  const isMobile = useIsMobile();
  // Mobile-only overlay UI state — distinct from the desktop showTree/
  // showToc pane toggles (those are persisted preferences; these are
  // transient takeovers). searchOpen/quickSwitcherOpen above are shared
  // with desktop (⌘K/⇧⌘F, the native menu) and double as mobile overlays
  // too — see mobileOverlayOpen below.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tocSheetOpen, setTocSheetOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Single funnel closing EVERY mobile overlay — passed to the history
  // bridge as the thing a hardware back press reconciles React state with
  // when an overlay is open. Safe to call unconditionally: at most one of
  // these is ever true, so the others are no-ops.
  const closeAnyMobileOverlay = useCallback(() => {
    setDrawerOpen(false);
    setTocSheetOpen(false);
    setOverflowOpen(false);
    setSearchOpen(false);
    setQuickSwitcherOpen(false);
  }, []);

  // True whenever ANY mobile overlay is showing — search/quick switcher
  // only count while isMobile, since on desktop they're plain panels with
  // no back-button contract (opening one there must not make the history
  // bridge think an "overlay" is open).
  const mobileOverlayOpen =
    drawerOpen || tocSheetOpen || overflowOpen || (isMobile && (searchOpen || quickSwitcherOpen));

  // Called here — before any OTHER effect in this component, including the
  // browser-mode bootstrap navigate() a few effects below — so its internal
  // mount effects (root-tagging, and the currentPath-change subscription
  // that mirrors nav pushes) are registered in time to observe that very
  // first navigation. React fires a component's effects in the order their
  // hooks were called during render; if this hook were called later (after
  // the bootstrap effect), that effect's navigate() would already have
  // fired before this hook's subscription existed, leaving the WebView's
  // history "one entry short" of the store's — harmless for the store
  // itself, but it'd mean a hardware back could walk past this module's own
  // root tag into whatever preceded the app's first real navigation (in a
  // browser tab, "back" past the page's first entry; a real Android WebView
  // has no such prior entry, so this only bites the Playwright/Chromium
  // test bed — but there's no reason to leave the mismatch in either).
  const { pushOverlay, popOverlay, swapOverlay, navigateFromOverlay } = useHistoryBridge({
    overlayOpen: mobileOverlayOpen,
    closeOverlay: closeAnyMobileOverlay,
  });

  // ---- Phase 4: editing / saving / conflict state ----
  // mtimeMs and dirty are plain refs — nothing renders their raw value
  // directly (the footer shows saveStatus, not dirty), but listeners and
  // effect cleanups that must not re-subscribe on every keystroke (the
  // external-change subscription, the flush-on-navigate effect) need to
  // read the latest value instead of a stale closure, which a ref gives for
  // free. `draft` DOES need to be real state — it's what the Editor mounts
  // with — so it's mirrored into a ref for the same reason.
  const mtimeRef = useRef<number | null>(null);
  const setMtimeMs = (v: number | null) => {
    mtimeRef.current = v;
  };

  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (v: string | null) => {
    draftRef.current = v;
    setDraftState(v);
  };

  const dirtyRef = useRef(false);
  const setDirty = (v: boolean) => {
    dirtyRef.current = v;
  };

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  // Bumped whenever the buffer must be replaced programmatically (take
  // theirs / show both) — folded into the Editor's `key` so it remounts
  // with fresh initial content instead of silently ignoring the change
  // (CodeMirror is uncontrolled past creation, see Editor.tsx).
  const [resetSeq, setResetSeq] = useState(0);

  const saveTimerRef = useRef<number | null>(null);
  const writeInFlightRef = useRef(false);
  const scrollHostRef = useRef<HTMLDivElement>(null);

  // Set after a navigate() triggered by a link with a `#anchor`; consumed
  // once the newly-loaded document has rendered, so the scroll never fires
  // against the previous document's (about-to-be-replaced) DOM.
  const pendingAnchorRef = useRef<string | null>(null);

  // Set whenever currentPath actually changes to a different file — cleared
  // once consumed. scrollHostRef is one persistent DOM node reused across
  // every document (only its content swaps), so without this its scrollTop
  // from the PREVIOUS file leaks into the next one, landing you "halfway
  // down" a document you've never scrolled. Same-file re-renders (autosave,
  // toggling the editor, an external-change reload) must NOT reset scroll —
  // those already manage position themselves (restoreScrollFraction) or
  // want to hold still — so this is only armed by an actual path change.
  const pendingScrollResetRef = useRef(false);

  // Hydrate persisted UI state (pane visibility, tree expansion).
  useEffect(() => {
    useAppStore.getState().hydratePersistedState();
  }, []);

  // Browser mode (plain `vite dev`/`vite preview`): populate the tree from
  // the in-memory vault (src/vault.ts) and open the torture-test fixture, so
  // this container's Chromium test bed behaves like a real root with no
  // Tauri shell required.
  useEffect(() => {
    if (isTauri()) return;
    vault.listTree().then(setTree);
    navigate("torture-test.md");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On launch in Tauri mode, restore the previously chosen root (if any) so
  // the workspace reopens where it left off (PLAN.md §3, Phase 2).
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    ipc.currentRoot().then(async (root) => {
      if (cancelled || !root) return;
      setRoot(root.path, root.name);
      setTree(await vault.listTree());
      await ipc.watchRoot();
    });
    return () => {
      cancelled = true;
    };
  }, [setRoot, setTree]);

  // Listen for open-file event (Finder "Open With" or drag-onto-app).
  // Full open-workspace behaviour lands in a later phase; for now just log it.
  useEffect(() => {
    if (!isTauri()) return;
    // Dynamic import to avoid issues in browser mode
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ paths: string[] }>("open-file", (event) => {
        console.log("[markdown-reader] open-file event:", event.payload.paths);
      });
    });
  }, []);

  /**
   * Conflict-safe write. Guarded against overlapping writes (checkbox
   * clicks, autosave and ⌘S all funnel through here) with a single shared
   * in-flight flag — there is only ever one write path (vault.writeFile ->
   * write_file), so it makes sense to serialise it. `isCurrent()` re-checks
   * the store at completion time so a save flushed for a file the user has
   * since navigated away from doesn't clobber whatever they're looking at
   * now — but a conflict is still recorded (and will surface the banner if
   * they come back to that file), never silently dropped.
   */
  const performSave = useCallback(
    async (path: string, content: string, expectedMtimeMs: number) => {
      if (writeInFlightRef.current) return;
      writeInFlightRef.current = true;
      const isCurrent = () => useAppStore.getState().currentPath === path;
      if (isCurrent()) setSaveStatus("saving");
      try {
        const result = await vault.writeFile(path, content, expectedMtimeMs);
        if (isCurrent()) {
          setMtimeMs(result.mtimeMs);
          setSource(result.content);
          setDirty(false);
          setSaveStatus("saved");
          window.setTimeout(() => {
            setSaveStatus((s) => (s === "saved" ? "idle" : s));
          }, 2000);
        }
      } catch (err) {
        if (isConflictError(err)) {
          setConflict({ path, pendingContent: content });
        } else {
          console.error("[markdown-reader] save failed:", err);
        }
        if (isCurrent()) setSaveStatus("unsaved");
      } finally {
        writeInFlightRef.current = false;
      }
    },
    [],
  );

  const cancelAutosave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const scheduleAutosave = useCallback(
    (path: string, content: string, expectedMtimeMs: number) => {
      cancelAutosave();
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        performSave(path, content, expectedMtimeMs);
      }, AUTOSAVE_IDLE_MS);
    },
    [cancelAutosave, performSave],
  );

  // Load the current file whenever navigation changes it (both modes go
  // through the vault facade — see src/vault.ts). The cleanup flushes any
  // unsaved edit on the file we're leaving BEFORE this same effect's next
  // run resets draft/mtime for the new one, so a pending autosave is never
  // silently lost on navigation (PLAN.md §4).
  useEffect(() => {
    if (!currentPath) {
      // Nothing open (e.g. the document just got renamed away or binned) —
      // drop the stale rendered doc so the TOC empties instead of still
      // showing the outline of a file that's no longer open.
      setSource(null);
      setDoc(null);
      return;
    }
    let cancelled = false;
    pendingScrollResetRef.current = true;
    vault.readFile(currentPath).then(({ content, mtimeMs: mtime }) => {
      if (cancelled) return;
      setSource(content);
      setMtimeMs(mtime);
      setDraft(null);
      setDirty(false);
      setSaveStatus("idle");
      setConflict(null);
    });
    return () => {
      cancelled = true;
      cancelAutosave();
      if (dirtyRef.current && draftRef.current !== null && mtimeRef.current !== null) {
        performSave(currentPath, draftRef.current, mtimeRef.current);
      }
    };
  }, [currentPath, cancelAutosave, performSave]);

  // Once the target document has rendered, consume any pending anchor from
  // a cross-file link (e.g. `./specs/api.md#endpoints`) and scroll to it —
  // otherwise, if this render is a real navigation to a different file
  // (pendingScrollResetRef), start at the top rather than wherever the
  // previous document left the shared scroll container. Anchor scrolls
  // never touch history — only navigate() does that.
  useEffect(() => {
    if (!doc) return;
    const id = pendingAnchorRef.current;
    if (id) {
      pendingAnchorRef.current = null;
      pendingScrollResetRef.current = false;
      requestAnimationFrame(() => scrollToHeading(id));
    } else if (pendingScrollResetRef.current) {
      pendingScrollResetRef.current = false;
      requestAnimationFrame(() => {
        if (scrollHostRef.current) scrollHostRef.current.scrollTop = 0;
      });
    }
  }, [doc]);

  // Live-reload on external changes (Drive sync, other editors, or the
  // browser-mode __markdownReaderSimulateExternalEdit hook — vault.onExternalChange
  // unifies both). If the open file has unsaved edits, do NOT clobber the
  // buffer: skip the reload entirely and let the next save (autosave/⌘S)
  // naturally hit the mtime check and surface the conflict banner. If it's
  // clean, reload silently (and resync the editor buffer too, if open).
  useEffect(() => {
    const unsubscribe = vault.onExternalChange((change) => {
      vault.listTree().then(setTree);
      const open = useAppStore.getState().currentPath;
      if (!open || !change.paths.includes(open) || change.kind === "deleted") return;
      if (dirtyRef.current) return; // keep the user's buffer; next save surfaces the conflict

      vault.readFile(open).then(({ content, mtimeMs: mtime }) => {
        setSource(content);
        setMtimeMs(mtime);
        if (useAppStore.getState().editing) {
          setDraft(content);
          setResetSeq((n) => n + 1);
        }
      });
    });
    return unsubscribe;
  }, [setTree]);

  // Resume-refresh (PLAN-ANDROID.md §3 "Lifecycle"): Android suspends
  // backgrounded apps and the fs watcher misses events while suspended, so
  // on resume (`visibilitychange` -> visible) re-run the tree load and
  // re-read the open file, applying new content only if its mtime actually
  // moved (a no-op otherwise — cheap). Never touches an unsaved editor
  // buffer, mirroring the external-change effect above: the existing
  // conflict banner covers a collision at save time instead. This is one
  // code path for both platforms — `visibilitychange` rarely fires on
  // desktop, and when it does this is a cheap no-op, so desktop behaviour
  // is unaffected in practice; no isAndroid()/isTauri() fork needed here.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      vault.listTree().then(setTree);
      const open = useAppStore.getState().currentPath;
      if (!open || dirtyRef.current) return;
      vault
        .readFile(open)
        .then(({ content, mtimeMs: mtime }) => {
          if (mtime === mtimeRef.current) return; // nothing changed — no-op
          setSource(content);
          setMtimeMs(mtime);
          if (useAppStore.getState().editing) {
            setDraft(content);
            setResetSeq((n) => n + 1);
          }
        })
        .catch(() => {
          // The open file may have been removed while suspended (e.g. by
          // Autosync) — the tree reload above already reflects that; there
          // is nothing further to reconcile here.
        });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [setTree]);

  // Folder picking branches on isAndroid() in exactly this one place
  // (PLAN-ANDROID.md §2/§6): Android's native dialog only returns useless
  // SAF content:// URIs, so it opens the in-app FolderBrowser instead of
  // the desktop pick_root/dialog path. Both entry points that used to call
  // pick_root directly — the tree pane's "Choose folder…" button and the
  // menu's "open-folder" id — go through this same pickRoot, so the branch
  // stays in one place.
  const pickRoot = useCallback(async () => {
    if (isAndroid()) {
      setFolderBrowserOpen(true);
      return;
    }
    const root = await ipc.pickRoot();
    if (!root) return;
    setRoot(root.path, root.name);
    setTree(await vault.listTree());
    await ipc.watchRoot();
  }, [setRoot, setTree]);

  /** FolderBrowser's "Use this folder" action lands here — the Android
   * equivalent of pickRoot's desktop branch above (set_root instead of
   * pick_root/dialog, watch_root skipped outside Tauri since there's no
   * real watcher in browser mode). */
  const handleFolderChosen = useCallback(
    async (root: { path: string; name: string }) => {
      setFolderBrowserOpen(false);
      setRoot(root.path, root.name);
      setTree(await vault.listTree());
      if (isTauri()) await ipc.watchRoot();
    },
    [setRoot, setTree],
  );

  // ---- File ops (PLAN.md §4/§7 Phase 6): create / rename / delete-to-bin ----

  /** ⌘N and the menu's "new-file" id both land here (via the App.tsx menu
   * listener below) — there is no separate frontend keydown handler for
   * ⌘N itself, since that accelerator lives only on the native menu item
   * (see src-tauri/src/lib.rs's build_menu); giving it a JS handler too
   * would risk exactly the double-fire the escalated menu task called out. */
  const handleCreateFile = useCallback(
    async (name: string) => {
      const folder = currentPath ? dirname(currentPath) : "";
      const fileName = sanitizeFileName(name);
      const path = folder ? `${folder}/${fileName}` : fileName;
      try {
        await vault.createFile(path);
      } catch {
        setNewFileError(`"${fileName}" already exists in ${folder || "the root"}.`);
        return;
      }
      setTree(await vault.listTree());
      setNewFileOpen(false);
      setNewFileError(null);
      navigate(path);
    },
    [currentPath, setTree, navigate],
  );

  /** Renames swap the tree row for an inline input (Tree.tsx); this is the
   * confirm step. If the renamed file is open and dirty, flush the pending
   * edit to the OLD path first — otherwise the navigate-away cleanup in the
   * currentPath effect above would autosave to the old path after the
   * rename and resurrect it. */
  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const extMatch = /\.(md|markdown)$/i.exec(oldPath);
      const ext = extMatch ? extMatch[0] : ".md";
      const dir = dirname(oldPath);
      const fileName = sanitizeFileName(newName, ext);
      const newPath = dir ? `${dir}/${fileName}` : fileName;
      if (newPath === oldPath) return;

      if (
        useAppStore.getState().currentPath === oldPath &&
        dirtyRef.current &&
        draftRef.current !== null &&
        mtimeRef.current !== null
      ) {
        cancelAutosave();
        await performSave(oldPath, draftRef.current, mtimeRef.current);
      }

      try {
        await vault.renameFile(oldPath, newPath);
      } catch (err) {
        console.error("[markdown-reader] rename failed:", err);
        return;
      }

      setTree(await vault.listTree());
      renamePath(oldPath, newPath);
    },
    [cancelAutosave, performSave, setTree, renamePath],
  );

  /** Move to Bin. If the deleted file is the open, dirty document, clear
   * the dirty buffer first — otherwise the navigate-away cleanup would
   * autosave the pending draft straight back into existence at the path we
   * just binned. */
  const handleDeleteFile = useCallback(
    async (path: string) => {
      if (useAppStore.getState().currentPath === path) {
        cancelAutosave();
        setDirty(false);
        setDraft(null);
      }
      try {
        await vault.deleteFile(path);
      } catch (err) {
        console.error("[markdown-reader] delete failed:", err);
        return;
      }
      setTree(await vault.listTree());
      removePath(path);
    },
    [cancelAutosave, setTree, removePath],
  );

  // Route a link click (relative / wikilink / anchor / external) via
  // src/linkRouter.ts. Popover positioning uses the clicked <a>'s own
  // bounding box, so it appears right where the reader clicked.
  const onLinkClick = useCallback(
    async (href: string | null, wikilink: string | null, anchorEl: HTMLAnchorElement) => {
      const rect = anchorEl.getBoundingClientRect();
      const point = { x: rect.left, y: rect.bottom + 4 };
      const action = await resolveLinkClick(href, wikilink, currentPath);

      switch (action.type) {
        case "navigate":
          pendingAnchorRef.current = action.anchor ?? null;
          navigate(action.path);
          break;
        case "scroll":
          scrollToHeading(action.id);
          break;
        case "disambiguate":
          setPopover({ kind: "disambiguate", candidates: action.candidates, ...point });
          break;
        case "create-offer":
          setPopover({ kind: "create", path: action.path, title: action.title, ...point });
          break;
        case "external":
        case "noop":
          break;
      }
    },
    [currentPath, navigate],
  );

  /** Real checkbox write-back (Phase 4): rewrite the nth task marker in the
   * source, then write through the vault with the tracked mtime. Applied
   * optimistically to `source` first so the checkbox never snaps back while
   * the write is in flight; if it conflicts, the change is preserved
   * locally (no data loss) and the same banner used by the editor offers
   * keep-mine/take-theirs/show-both. Reader is unmounted while editing, so
   * this can never race the editor's own save path for the same file. */
  const onTaskToggle = useCallback(
    (index: number, checked: boolean) => {
      if (!currentPath || source === null || mtimeRef.current === null) return;
      if (writeInFlightRef.current) return; // guard double-fires while a write is in flight
      const newSource = setTaskMarker(source, index, checked);
      if (newSource === null) return;
      setSource(newSource);
      performSave(currentPath, newSource, mtimeRef.current);
    },
    [currentPath, source, performSave],
  );

  const captureScrollFraction = useCallback((): number => {
    const el = scrollHostRef.current;
    if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? el.scrollTop / max : 0;
  }, []);

  const restoreScrollFraction = useCallback((frac: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollHostRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = frac * max;
      });
    });
  }, []);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      setDirty(true);
      setSaveStatus("unsaved");
      if (currentPath && mtimeRef.current !== null) {
        scheduleAutosave(currentPath, value, mtimeRef.current);
      }
    },
    [currentPath, scheduleAutosave],
  );

  const flushIfDirtyAndLeaveEditor = useCallback(() => {
    cancelAutosave();
    if (dirtyRef.current && draftRef.current !== null && currentPath && mtimeRef.current !== null) {
      performSave(currentPath, draftRef.current, mtimeRef.current);
    }
  }, [cancelAutosave, currentPath, performSave]);

  const handleToggleEditing = useCallback(() => {
    if (!currentPath) return;
    if (editing) {
      flushIfDirtyAndLeaveEditor();
    } else {
      setDraft(source);
      setDirty(false);
      setSaveStatus("idle");
    }
    const frac = captureScrollFraction();
    toggleEditing();
    restoreScrollFraction(frac);
  }, [currentPath, editing, source, flushIfDirtyAndLeaveEditor, toggleEditing, captureScrollFraction, restoreScrollFraction]);

  const handleSaveNow = useCallback(() => {
    if (!editing || !currentPath || !dirtyRef.current || draftRef.current === null) return;
    if (mtimeRef.current === null) return;
    cancelAutosave();
    performSave(currentPath, draftRef.current, mtimeRef.current);
  }, [editing, currentPath, cancelAutosave, performSave]);

  // Shared by the ⌘+/⌘− keydown handler and the native menu's Zoom In/Out/
  // Actual Size items (the menu carries the accelerator for Actual Size
  // only — zoom in/out are already frontend shortcuts, see build_menu).
  const zoomIn = useCallback(() => {
    setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(z) + 1, ZOOM_STEPS.length - 1)]);
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(z) - 1, 0)]);
  }, []);
  const zoomReset = useCallback(() => setZoom(1), []);

  // ---- Mobile overlay open/close (PLAN-ANDROID.md §3) ----
  // (closeAnyMobileOverlay/mobileOverlayOpen/useHistoryBridge itself are
  // declared up with the rest of the mobile shell state, near the top of
  // the component — see the comment there for why the ORDER matters.)

  // Search/quick switcher are opened from three places (⌘K/⇧⌘F, the native
  // menu, and — on mobile — the app bar); funnelling every opener through
  // these two keeps the history push in exactly one place instead of
  // duplicating `if (isMobile) pushOverlay()` at each call site.
  const requestOpenSearch = useCallback(() => {
    setSearchOpen(true);
    if (isMobile) pushOverlay();
  }, [isMobile, pushOverlay]);
  const requestOpenQuickSwitcher = useCallback(() => {
    setQuickSwitcherOpen(true);
    if (isMobile) pushOverlay();
  }, [isMobile, pushOverlay]);
  // Mobile-only closes for search/quick switcher: a pure state change, no
  // history.back() — see historyBridge.ts's module comment on why (they
  // call the store's navigate() themselves before onClose fires on a
  // result pick, which a back() here would race).
  const closeMobileSearch = useCallback(() => setSearchOpen(false), []);
  const closeMobileSwitcher = useCallback(() => setQuickSwitcherOpen(false), []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    pushOverlay();
  }, [pushOverlay]);

  const openOverflowMenu = useCallback(() => {
    setOverflowOpen(true);
    pushOverlay();
  }, [pushOverlay]);

  // The overflow menu's "Contents" item: one overlay replacing another in
  // the same tap, collapsed via swapOverlay's replaceState rather than
  // popOverlay-then-openDrawer's back()+pushState (see historyBridge.ts).
  const openTocFromOverflow = useCallback(() => {
    setOverflowOpen(false);
    setTocSheetOpen(true);
    swapOverlay();
  }, [swapOverlay]);

  const fileStem = currentPath ? stripMdExt(currentPath.split("/").pop() ?? currentPath) : null;

  // ---- Conflict banner actions ----

  const resolveKeepMine = useCallback(async () => {
    if (!conflict) return;
    const { path, pendingContent } = conflict;
    setConflict(null);
    const disk = await vault.readFile(path);
    await performSave(path, pendingContent, disk.mtimeMs);
  }, [conflict, performSave]);

  const resolveTakeTheirs = useCallback(async () => {
    if (!conflict) return;
    const { path } = conflict;
    setConflict(null);
    cancelAutosave();
    const disk = await vault.readFile(path);
    setSource(disk.content);
    setMtimeMs(disk.mtimeMs);
    setDirty(false);
    setSaveStatus("idle");
    if (useAppStore.getState().editing) {
      setDraft(disk.content);
      setResetSeq((n) => n + 1);
    }
  }, [conflict, cancelAutosave]);

  const resolveShowBoth = useCallback(async () => {
    if (!conflict) return;
    const { path, pendingContent } = conflict;
    setConflict(null);
    cancelAutosave();
    const disk = await vault.readFile(path);
    const merged = pendingContent.replace(/\n+$/, "") + CONFLICT_DIVIDER(disk.content);
    setSource(merged);
    setMtimeMs(disk.mtimeMs);
    setDraft(merged);
    setDirty(true);
    setSaveStatus("unsaved");
    setResetSeq((n) => n + 1);
    if (!useAppStore.getState().editing) setEditing(true);
  }, [conflict, cancelAutosave, setEditing]);

  // Keyboard: ⌘[ / ⌘] history, ⌘+/⌘− zoom, ⌘E edit toggle, ⌘S save, ⇧⌘F
  // search, ⌘K quick switcher. Both Cmd (macOS) and Ctrl (testing) work.
  // Deliberately NOT bound: ⌘P — it's owned entirely by the native File >
  // Print… menu item (see build_menu/on_menu_event in lib.rs), which calls
  // Rust's WebviewWindow::print() directly and never reaches this frontend
  // at all. That's not a stylistic choice: on macOS, WKWebView's JS
  // `window.print()` is a documented dead end (unlike Linux/Windows), so
  // there is no working frontend-side print path to bind here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Guard: block shortcuts while typing in text inputs/textareas, but NOT in checkboxes
      // or other non-text inputs. Also not in CodeMirror's contenteditable regions.
      const target = e.target as HTMLElement;
      const isTextInput =
        (target instanceof HTMLInputElement &&
          (target.type === "text" || target.type === "search" || target.type === "") &&
          !target.closest(".search-input, .quick-switcher-input")) ||
        target instanceof HTMLTextAreaElement;

      if (isTextInput) {
        // Allow ⌘K and ⇧⌘F to open panels even from text inputs, block everything else
        const isSearchOrSwitcher = (e.key.toLowerCase() === "k") || (e.key.toLowerCase() === "f" && e.shiftKey);
        if (!isSearchOrSwitcher) return;
      }

      if (e.key === "[") {
        e.preventDefault();
        goBack();
      } else if (e.key === "]") {
        e.preventDefault();
        goForward();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        handleToggleEditing();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveNow();
      } else if (e.key.toLowerCase() === "k") {
        // ⌘K / Ctrl+K: quick switcher
        e.preventDefault();
        requestOpenQuickSwitcher();
      } else if (e.key.toLowerCase() === "f" && e.shiftKey) {
        // ⇧⌘F / Ctrl+Shift+F: search
        e.preventDefault();
        requestOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward, handleToggleEditing, handleSaveNow, zoomIn, zoomOut, requestOpenQuickSwitcher, requestOpenSearch]);

  // Native menu bar clicks (Tauri only — see src-tauri/src/lib.rs's
  // on_menu_event/build_menu). Every id maps to the same action its
  // frontend keyboard shortcut would trigger; New File/Open Folder/Actual
  // Size have no frontend shortcut of their own and are reachable ONLY
  // through this path (their accelerator lives solely on the menu item).
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    ipc
      .onMenuEvent((id) => {
        switch (id) {
          case "toggle-edit":
            handleToggleEditing();
            break;
          case "back":
            goBack();
            break;
          case "forward":
            goForward();
            break;
          case "toggle-tree":
            togglePane("tree");
            break;
          case "toggle-toc":
            togglePane("toc");
            break;
          case "zoom-in":
            zoomIn();
            break;
          case "zoom-out":
            zoomOut();
            break;
          case "zoom-reset":
            zoomReset();
            break;
          case "quick-open":
            requestOpenQuickSwitcher();
            break;
          case "search":
            requestOpenSearch();
            break;
          case "open-folder":
            pickRoot();
            break;
          case "new-file":
            setNewFileError(null);
            setNewFileOpen(true);
            break;
          case "theme-system":
            setTheme("system");
            break;
          case "theme-light":
            setTheme("light");
            break;
          case "theme-dark":
            setTheme("dark");
            break;
          default:
            break;
        }
      })
      .then((f) => {
        if (cancelled) f();
        else unlisten = f;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [
    handleToggleEditing,
    goBack,
    goForward,
    togglePane,
    zoomIn,
    zoomOut,
    zoomReset,
    pickRoot,
    requestOpenQuickSwitcher,
    requestOpenSearch,
    setTheme,
  ]);

  // Show zoom level briefly when it changes
  const [showZoomBriefly, setShowZoomBriefly] = useState(false);
  useEffect(() => {
    setShowZoomBriefly(true);
    const t = setTimeout(() => setShowZoomBriefly(false), 1500);
    return () => clearTimeout(t);
  }, [zoom]);

  const wordCountText = doc
    ? doc.wordCount === 1
      ? "1 word"
      : `${doc.wordCount.toLocaleString("en-GB")} words`
    : "";

  const saveStatusText =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "unsaved"
          ? "Unsaved changes"
          : "";

  const showConflictBanner = conflict !== null && conflict.path === currentPath;

  // Shared between both shells: the document itself (Reader/Editor +
  // conflict banner), unchanged either way — only what wraps it differs.
  const docBody = currentPath ? (
    <div
      ref={scrollHostRef}
      className="doc-scroll-host"
      style={{ flex: 1, overflowY: "auto", fontSize: `${zoom}em` }}
    >
      {showConflictBanner && (
        <ConflictBanner
          onKeepMine={resolveKeepMine}
          onTakeTheirs={resolveTakeTheirs}
          onShowBoth={resolveShowBoth}
        />
      )}
      {editing ? (
        <div className="editor-shell">
          <Editor
            key={`${currentPath}:${resetSeq}`}
            initialValue={draft ?? source ?? ""}
            onChange={handleDraftChange}
          />
        </div>
      ) : (
        source !== null && (
          <Reader
            source={source}
            path={currentPath}
            onLinkClick={onLinkClick}
            onRendered={setDoc}
            onTaskToggle={onTaskToggle}
          />
        )
      )}
    </div>
  ) : (
    <div className="empty-state">
      {/* Files already exist (e.g. the open document was just binned, or
          the root has content but nothing's open yet) — "choose a folder"
          would be misleading once a root is already active. */}
      <p>{tree.length > 0 ? "Select a file to begin" : "Choose a folder to begin"}</p>
    </div>
  );

  return (
    <div className="shell">
      {isMobile ? (
        <>
          <AppBar
            title={fileStem}
            path={currentPath}
            editing={editing}
            onOpenDrawer={openDrawer}
            onOpenSearch={requestOpenSearch}
            onOpenQuickSwitcher={requestOpenQuickSwitcher}
            onToggleEditing={handleToggleEditing}
            onOpenOverflow={openOverflowMenu}
          />

          <main className="pane-doc">{docBody}</main>

          {drawerOpen && (
            <>
              <div className="mobile-scrim" onClick={popOverlay} data-testid="drawer-scrim" />
              <aside className="drawer" data-testid="drawer">
                {/* isAndroid() is included here (not just isTauri()) so this
                    entry point is reachable in browser mode under the
                    `?platform=android` override — see the equivalent
                    comment this replaced in the desktop tree pane. */}
                {(isTauri() || isAndroid()) && (
                  <button
                    className="tree-item"
                    onClick={() => {
                      popOverlay();
                      pickRoot();
                    }}
                    style={{ marginBottom: 4 }}
                  >
                    <FolderOpen size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />{" "}
                    {rootName ?? "Choose folder…"}
                  </button>
                )}
                <button
                  className="tree-item"
                  onClick={() => {
                    popOverlay();
                    setNewFileError(null);
                    setNewFileOpen(true);
                  }}
                  style={{ marginBottom: 12 }}
                >
                  <FilePlus size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> New file
                </button>
                <Favourites nodes={tree} currentPath={currentPath} onOpenFile={navigateFromOverlay} />
                <Tree
                  nodes={tree}
                  currentPath={currentPath}
                  onOpen={navigateFromOverlay}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                />
              </aside>
            </>
          )}

          {tocSheetOpen && (
            <>
              <div className="mobile-scrim" onClick={popOverlay} data-testid="toc-sheet-scrim" />
              {/* Toc.tsx is unmodified — a click on one of its .toc-item
                  buttons bubbles up to this wrapper (it already ran Toc's
                  own scrollIntoView handler first), which is all the signal
                  needed to dismiss the sheet without threading a new prop
                  through a component shared with desktop. */}
              <div
                className="toc-sheet"
                data-testid="toc-sheet"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(".toc-item")) popOverlay();
                }}
              >
                <div className="toc-sheet-grip" />
                <Toc entries={doc?.toc ?? []} />
              </div>
            </>
          )}

          {overflowOpen && (
            <OverflowMenu onClose={popOverlay}>
              <button className="overflow-menu-item" onClick={openTocFromOverflow}>
                Contents
              </button>
              <button
                className="overflow-menu-item"
                onClick={() => {
                  popOverlay();
                  zoomIn();
                }}
              >
                Zoom In
              </button>
              <button
                className="overflow-menu-item"
                onClick={() => {
                  popOverlay();
                  zoomOut();
                }}
              >
                Zoom Out
              </button>
              <button
                className="overflow-menu-item"
                onClick={() => {
                  popOverlay();
                  zoomReset();
                }}
              >
                Actual Size
              </button>
              <button
                className="overflow-menu-item"
                onClick={() => {
                  popOverlay();
                  setNewFileError(null);
                  setNewFileOpen(true);
                }}
              >
                New File
              </button>
              <button
                className="overflow-menu-item"
                onClick={() => {
                  setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
                }}
              >
                Theme: {theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}
              </button>
            </OverflowMenu>
          )}

          <SearchPanel open={searchOpen} onClose={closeMobileSearch} />
        </>
      ) : (
        <>
          {searchOpen ? (
            <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
          ) : (
            showTree && (
              <aside className="pane-tree">
                {/* isAndroid() is included here (not just isTauri()) so this
                    entry point is reachable in browser mode under the
                    `?platform=android` override — this container has no real
                    Android device, so that's the only way to drive the
                    FolderBrowser in the Playwright/Chromium test bed. In a real
                    Tauri build the two conditions never disagree: isAndroid()
                    is only ever true when isTauri() is too. */}
                {(isTauri() || isAndroid()) && (
                  <button className="tree-item" onClick={pickRoot} style={{ marginBottom: 4 }}>
                    <FolderOpen size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />{" "}
                    {rootName ?? "Choose folder…"}
                  </button>
                )}
                <button
                  className="tree-item"
                  onClick={() => {
                    setNewFileError(null);
                    setNewFileOpen(true);
                  }}
                  style={{ marginBottom: 12 }}
                >
                  <FilePlus size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> New file
                </button>
                <Favourites nodes={tree} currentPath={currentPath} onOpenFile={navigate} />
                <Tree
                  nodes={tree}
                  currentPath={currentPath}
                  onOpen={navigate}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                />
              </aside>
            )
          )}

          <main className="pane-doc">
            {currentPath ? (
              <>
                {docBody}
                <footer className="footer-chrome">
                  <span className="footer-nav">
                    <button onClick={goBack} disabled={back.length === 0} aria-label="Back">
                      <ArrowLeft size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                    </button>
                    <button onClick={goForward} disabled={forward.length === 0} aria-label="Forward">
                      <ArrowRight size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                    </button>
                    <button onClick={() => togglePane("tree")} aria-label="Toggle file tree">
                      <PanelLeft size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                    </button>
                  </span>
                  <span className="footer-status">
                    {editing && (
                      <button
                        className="save-button"
                        onClick={handleSaveNow}
                        disabled={saveStatus !== "unsaved"}
                      >
                        Save
                      </button>
                    )}
                    {showZoomBriefly && zoom !== 1
                      ? `${Math.round(zoom * 100)}%`
                      : editing
                        ? saveStatusText
                        : wordCountText}
                  </span>
                  <span>
                    <button onClick={() => togglePane("toc")} aria-label="Toggle contents">
                      <PanelRight size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                    </button>
                  </span>
                </footer>
              </>
            ) : (
              docBody
            )}
          </main>

          {showToc && (
            <aside className="pane-toc">
              <Toc entries={doc?.toc ?? []} />
            </aside>
          )}
        </>
      )}

      {popover?.kind === "disambiguate" && (
        <LinkPopover
          x={popover.x}
          y={popover.y}
          kind="disambiguate"
          onClose={() => setPopover(null)}
        >
          <p className="link-popover-label">Multiple matches</p>
          {popover.candidates.map((path) => (
            <button
              key={path}
              className="link-popover-item"
              onClick={() => {
                navigate(path);
                setPopover(null);
              }}
            >
              {path}
            </button>
          ))}
        </LinkPopover>
      )}

      {popover?.kind === "create" && (
        <LinkPopover x={popover.x} y={popover.y} kind="create" onClose={() => setPopover(null)}>
          <p className="link-popover-label">File not found</p>
          <p className="link-popover-path">{popover.path}</p>
          <div className="link-popover-actions">
            <button
              className="link-popover-button"
              onClick={async () => {
                const { path, title } = popover;
                await vault.createFileWithContent(path, `# ${title}\n`);
                setTree(await vault.listTree());
                setPopover(null);
                navigate(path);
              }}
            >
              Create
            </button>
            <button className="link-popover-button" onClick={() => setPopover(null)}>
              Cancel
            </button>
          </div>
        </LinkPopover>
      )}

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={isMobile ? closeMobileSwitcher : () => setQuickSwitcherOpen(false)}
      />

      <NewFileDialog
        open={newFileOpen}
        folder={currentPath ? dirname(currentPath) : ""}
        error={newFileError}
        onClose={() => {
          setNewFileOpen(false);
          setNewFileError(null);
        }}
        onCreate={handleCreateFile}
      />

      {folderBrowserOpen && (
        <FolderBrowser onChoose={handleFolderChosen} onClose={() => setFolderBrowserOpen(false)} />
      )}
    </div>
  );
}
