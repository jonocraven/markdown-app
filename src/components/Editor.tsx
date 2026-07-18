import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

interface EditorProps {
  /** Initial document content. CodeMirror is uncontrolled past creation —
   * changing this prop does not update a live editor. Give the Editor a
   * fresh `key` (App.tsx does `${currentPath}:${resetSeq}`) whenever the
   * buffer needs to be replaced programmatically: switching files, "take
   * theirs", or "show both" after a conflict. */
  initialValue: string;
  onChange: (value: string) => void;
}

/**
 * CodeMirror 6, markdown mode, themed per PLAN.md §3/§6 to feel like turning
 * the reader's page over rather than opening a dev tool: same ~70ch centred
 * column (the .editor-shell wrapper in styles/editor.css shares the
 * reader's own font context so --reading-width resolves to the same pixel
 * width), paper background, JetBrains Mono ~13.5px, ink cursor/selection, no
 * line numbers or gutter chrome.
 *
 * The editor is auto-height (`.cm-scroller { overflow: visible }` in
 * editor.css) — the surrounding .pane-doc scroll container in App.tsx does
 * the actual scrolling, the same one the Reader uses, so toggling between
 * the two is a plain proportional scroll-fraction mapping over one shared
 * parent rather than two independent scroll contexts.
 */
export function Editor({ initialValue, onChange }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // onChange is read via a ref so the mount effect below never needs it in
  // its dependency array — the editor must only be (re)created when this
  // component (re)mounts (i.e. when the caller changes `key`), never on
  // every render just because a new onChange closure was passed in.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ codeLanguages: languages }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="cm-host" ref={hostRef} />;
}
