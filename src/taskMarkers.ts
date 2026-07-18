/**
 * Task-checkbox write-back contract (see CLAUDE.md): the nth rendered
 * checkbox (`data-task-index`, assigned by `rehypeIndexTasks` in
 * src/markdown/pipeline.tsx) corresponds to the nth `[ ]`/`[x]`/`[X]` task
 * marker in the raw source, counted in document order — one marker per
 * line, which matches the hast tree's document-order traversal by
 * construction.
 */
const TASK_MARKER_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\])/;

/**
 * Rewrite the nth task marker in `source` to reflect `checked`. Returns the
 * updated source, or null if there is no nth marker — shouldn't happen for a
 * checkbox that's actually rendered, but guards against a stale index if the
 * file's task-list shape changed underneath us (e.g. an external edit).
 */
export function setTaskMarker(source: string, index: number, checked: boolean): string | null {
  const lines = source.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_MARKER_RE.exec(lines[i]);
    if (!m) continue;
    if (count === index) {
      const mark = checked ? "x" : " ";
      lines[i] = m[1] + mark + m[3] + lines[i].slice(m[0].length);
      return lines.join("\n");
    }
    count++;
  }
  return null;
}
