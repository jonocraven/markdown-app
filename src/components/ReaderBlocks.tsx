import { useRef, useState, type ComponentPropsWithoutRef } from "react";

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
 * Interactive task checkbox. Phase 1 stub: logs the intended change.
 * Phase 4 replaces the log with a conflict-safe write mapping
 * data-task-index to the nth task marker in the source file.
 */
export function TaskCheckbox(props: ComponentPropsWithoutRef<"input">) {
  const { disabled: _disabled, ...rest } = props;
  const index = Number(rest["data-task-index" as keyof typeof rest] ?? -1);

  if (rest.type !== "checkbox") return <input {...props} />;

  return (
    <input
      {...rest}
      disabled={false}
      onChange={(e) => {
        console.log(
          `[folio] task ${index} → ${e.target.checked ? "[x]" : "[ ]"} (write-back lands in Phase 4)`,
        );
      }}
    />
  );
}
