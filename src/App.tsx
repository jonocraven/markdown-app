import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRight, FolderOpen } from "lucide-react";
import { Reader } from "./components/Reader";
import { Toc } from "./components/Toc";
import { Tree } from "./components/Tree";
import { LinkPopover } from "./components/LinkPopover";
import { useAppStore } from "./stores/appStore";
import { ipc, isTauri } from "./ipc";
import { vault } from "./vault";
import { resolveLinkClick } from "./linkRouter";
import type { RenderedDoc } from "./markdown/pipeline";

const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];

type PopoverState =
  | { kind: "disambiguate"; candidates: string[]; x: number; y: number }
  | { kind: "create"; path: string; title: string; x: number; y: number };

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
    showTree,
    showToc,
    setRoot,
    setTree,
    navigate,
    goBack,
    goForward,
    togglePane,
  } = useAppStore();

  const [source, setSource] = useState<string | null>(null);
  const [doc, setDoc] = useState<RenderedDoc | null>(null);
  const [zoom, setZoom] = useState(1);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  // Set after a navigate() triggered by a link with a `#anchor`; consumed
  // once the newly-loaded document has rendered, so the scroll never fires
  // against the previous document's (about-to-be-replaced) DOM.
  const pendingAnchorRef = useRef<string | null>(null);

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
        console.log("[folio] open-file event:", event.payload.paths);
      });
    });
  }, []);

  // Load the current file whenever navigation changes it (both modes go
  // through the vault facade — see src/vault.ts).
  useEffect(() => {
    if (!currentPath) return;
    let cancelled = false;
    vault.readFile(currentPath).then(({ content }) => {
      if (!cancelled) setSource(content);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  // Once the target document has rendered, consume any pending anchor from
  // a cross-file link (e.g. `./specs/api.md#endpoints`) and scroll to it.
  // Anchor scrolls never touch history — only navigate() does that.
  useEffect(() => {
    const id = pendingAnchorRef.current;
    if (!doc || !id) return;
    pendingAnchorRef.current = null;
    requestAnimationFrame(() => scrollToHeading(id));
  }, [doc]);

  // Live-reload on external changes (Drive sync, other editors).
  useEffect(() => {
    if (!isTauri()) return;
    const un = ipc.onFsChanged((change) => {
      const { currentPath: open } = useAppStore.getState();
      if (open && change.paths.includes(open) && change.kind !== "deleted") {
        ipc.readFile(open).then(({ content }) => setSource(content));
      }
      vault.listTree().then(setTree);
    });
    return () => {
      un.then((f) => f());
    };
  }, [setTree]);

  const pickRoot = useCallback(async () => {
    const root = await ipc.pickRoot();
    if (!root) return;
    setRoot(root.path, root.name);
    setTree(await vault.listTree());
    await ipc.watchRoot();
  }, [setRoot, setTree]);

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

  // Keyboard: ⌘[ / ⌘] history, ⌘+/⌘− zoom, ⌘E edit toggle (Phase 4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "[") {
        e.preventDefault();
        goBack();
      } else if (e.key === "]") {
        e.preventDefault();
        goForward();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(z) + 1, ZOOM_STEPS.length - 1)]);
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(z) - 1, 0)]);
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        console.log("[folio] edit toggle lands in Phase 4");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward]);

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

  return (
    <div className="shell">
      {showTree && (
        <aside className="pane-tree">
          {isTauri() && (
            <button className="tree-item" onClick={pickRoot} style={{ marginBottom: 12 }}>
              <FolderOpen size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />{" "}
              {rootName ?? "Choose folder…"}
            </button>
          )}
          <Tree nodes={tree} currentPath={currentPath} onOpen={navigate} />
        </aside>
      )}

      <main className="pane-doc">
        {currentPath ? (
          <>
            <div style={{ flex: 1, overflowY: "auto", fontSize: `${zoom}em` }}>
              {source !== null && (
                <Reader
                  source={source}
                  path={currentPath}
                  onLinkClick={onLinkClick}
                  onRendered={setDoc}
                />
              )}
            </div>
            <footer className="footer-chrome">
              <span>
                <button onClick={() => togglePane("tree")} aria-label="Toggle file tree">
                  <PanelLeft size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                </button>
              </span>
              <span>
                {showZoomBriefly && zoom !== 1 ? (
                  <span style={{ fontSize: "11px", opacity: 0.6 }}>{Math.round(zoom * 100)}%</span>
                ) : (
                  wordCountText
                )}
              </span>
              <span>
                <button onClick={() => togglePane("toc")} aria-label="Toggle contents">
                  <PanelRight size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
                </button>
              </span>
            </footer>
          </>
        ) : (
          <div className="empty-state">
            <p>Choose a folder to begin</p>
          </div>
        )}
      </main>

      {showToc && (
        <aside className="pane-toc">
          <Toc entries={doc?.toc ?? []} />
        </aside>
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
                await vault.createFile(path, `# ${title}\n`);
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
    </div>
  );
}
