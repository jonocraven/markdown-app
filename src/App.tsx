import { useCallback, useEffect, useState } from "react";
import { PanelLeft, PanelRight, FolderOpen } from "lucide-react";
import { Reader } from "./components/Reader";
import { Toc } from "./components/Toc";
import { Tree } from "./components/Tree";
import { useAppStore } from "./stores/appStore";
import { ipc, isTauri } from "./ipc";
import type { RenderedDoc } from "./markdown/pipeline";
import sampleDoc from "../samples/torture-test.md?raw";

const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];

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

  // Browser mode (plain `vite dev`): render the bundled torture-test sample
  // so typography work needs no Tauri shell.
  useEffect(() => {
    if (!isTauri()) {
      setSource(sampleDoc);
    }
  }, []);

  // Load the current file whenever navigation changes it.
  useEffect(() => {
    if (!isTauri() || !currentPath) return;
    let cancelled = false;
    ipc.readFile(currentPath).then(({ content }) => {
      if (!cancelled) setSource(content);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  // Live-reload on external changes (Drive sync, other editors).
  useEffect(() => {
    if (!isTauri()) return;
    const un = ipc.onFsChanged((change) => {
      const { currentPath: open } = useAppStore.getState();
      if (open && change.paths.includes(open) && change.kind !== "deleted") {
        ipc.readFile(open).then(({ content }) => setSource(content));
      }
      ipc.readTree().then(setTree);
    });
    return () => {
      un.then((f) => f());
    };
  }, [setTree]);

  const pickRoot = useCallback(async () => {
    const root = await ipc.pickRoot();
    if (!root) return;
    setRoot(root.path, root.name);
    setTree(await ipc.readTree());
    await ipc.watchRoot();
  }, [setRoot, setTree]);

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

  const displayPath = isTauri() ? (currentPath ?? "") : "samples/torture-test.md";

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
        <div style={{ flex: 1, overflowY: "auto", fontSize: `${zoom}em` }}>
          {source !== null && (
            <Reader source={source} path={displayPath} onRendered={setDoc} />
          )}
        </div>
        <footer className="footer-chrome">
          <span>
            <button onClick={() => togglePane("tree")} aria-label="Toggle file tree">
              <PanelLeft size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
            </button>
          </span>
          <span>{doc ? `${doc.wordCount.toLocaleString("en-GB")} words` : ""}</span>
          <span>
            <button onClick={() => togglePane("toc")} aria-label="Toggle contents">
              <PanelRight size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} />
            </button>
          </span>
        </footer>
      </main>

      {showToc && (
        <aside className="pane-toc">
          <Toc entries={doc?.toc ?? []} />
        </aside>
      )}
    </div>
  );
}
