import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

/** Fenced code with a hover copy button. Mermaid fences pass through
 * untouched — the post-mount Mermaid renderer replaces them. */
export function CodeBlock(props: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = preRef.current?.textContent ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="code-block">
      <pre ref={preRef} {...props} />
      <button className="code-copy" onClick={copy} aria-label="Copy code">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Real write-back handler for task checkboxes, provided by Reader (which
 * gets it from App.tsx — that's where the current file's path, source and
 * tracked mtime live). This indirection exists because TaskCheckbox is
 * registered once with rehype-react and rendered deep inside the hast→react
 * tree, with no direct prop route back to App; a context is the cleanest
 * way to bubble the (index, checked) pair up without threading props
 * through the whole markdown pipeline.
 */
export const TaskToggleContext = createContext<((index: number, checked: boolean) => void) | null>(
  null,
);

/**
 * Interactive task checkbox. Delegates entirely to TaskToggleContext — the
 * conflict-safe write (regex rewrite of the nth `[ ]`/`[x]` marker, then
 * vault.writeFile with the tracked mtime) lives in App.tsx, not here.
 *
 * remark-gfm sets a `checked` attribute on the source `<input>` (that's what
 * makes it a GFM task list in the first place), which rehype-react turns
 * into a React `checked` prop — making this a *controlled* input. Ticking a
 * controlled checkbox without also updating the value driving `checked`
 * makes React snap it straight back to its old state on the very same
 * click, since nothing has told it the value changed yet (the real source
 * of truth only updates once the write-back's fresh renderMarkdown() pass
 * completes, moments later). Tracking `checked` in local state — seeded
 * from the incoming prop, updated instantly on click — fixes that: the tick
 * sticks immediately, and re-syncs from the prop once the real re-render
 * lands (harmless, since by then they agree).
 */
export function TaskCheckbox(props: ComponentPropsWithoutRef<"input">) {
  const { disabled: _disabled, checked: initialChecked, ...rest } = props;
  const index = Number(rest["data-task-index" as keyof typeof rest] ?? -1);
  const onToggle = useContext(TaskToggleContext);
  const [checked, setChecked] = useState(!!initialChecked);

  useEffect(() => {
    setChecked(!!initialChecked);
  }, [initialChecked]);

  if (rest.type !== "checkbox") return <input {...props} />;

  return (
    <input
      {...rest}
      checked={checked}
      disabled={false}
      onChange={(e) => {
        setChecked(e.target.checked);
        onToggle?.(index, e.target.checked);
      }}
    />
  );
}
