/**
 * Root-relative path helpers for link resolution. All paths in this module
 * use forward slashes and no leading "./" — the same shape ipc.ts/vault.ts
 * paths already have.
 */

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Collapse "." and ".." segments. Never escapes above the root — a leading
 * ".." with nothing to pop is simply dropped. */
export function normalizePath(path: string): string {
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** Resolve `href` (a relative link target) against `dir` (the current
 * file's directory, root-relative, "" at the root). */
export function joinRelative(dir: string, href: string): string {
  const combined = dir ? `${dir}/${href}` : href;
  return normalizePath(combined);
}

/** Tree distance between two root-relative directories — the number of
 * "up" and "down" steps to get from one to the other. Used to pick the
 * nearest candidate for an ambiguous wikilink stem (PLAN.md §5). */
export function dirDistance(a: string, b: string): number {
  const pa = a ? a.split("/") : [];
  const pb = b ? b.split("/") : [];
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  return pa.length - i + (pb.length - i);
}

/** Normalise a wikilink target / file stem for matching: lowercase, and
 * treat hyphens/underscores/whitespace as equivalent. Obsidian-style vaults
 * name files with spaces ("torture test.md"); this repo's samples use
 * hyphens on disk ("torture-test.md") but prose wikilinks read naturally
 * with spaces ([[torture test]]) — both must resolve to the same file. */
export function normalizeStem(text: string): string {
  return text.trim().toLowerCase().replace(/[-_\s]+/g, " ");
}
