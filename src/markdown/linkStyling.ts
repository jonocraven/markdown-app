/**
 * Post-mount DOM pass: marks unresolvable links `.broken-link` and
 * http(s) links `.external-link`. Resolution needs the link index, which is
 * async (an ipc round-trip in Tauri mode) — the unified pipeline itself
 * stays pure/synchronous, so this runs after mount, the same pattern
 * mermaid.ts already uses for diagram rendering.
 */
import { vault } from "../vault";
import { dirname, joinRelative, normalizeStem } from "../pathUtils";

export async function styleLinks(container: HTMLElement, currentPath: string): Promise<void> {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"));
  if (anchors.length === 0) return;

  const index = await vault.linkIndex();
  const stems = new Set(index.map((e) => normalizeStem(e.stem)));
  const paths = new Set(index.map((e) => e.path));
  const currentDir = dirname(currentPath);

  for (const a of anchors) {
    const wikilink = a.getAttribute("data-wikilink");
    const href = a.getAttribute("href");

    if (wikilink) {
      a.classList.toggle("broken-link", !stems.has(normalizeStem(wikilink)));
      continue;
    }
    if (!href) continue;

    if (/^https?:\/\//i.test(href)) {
      a.classList.add("external-link");
      continue;
    }
    if (href.startsWith("#")) continue; // same-page anchors are never "broken"

    const [pathPart] = href.split("#");
    if (!pathPart) continue;
    const target = joinRelative(currentDir, pathPart);
    a.classList.toggle("broken-link", !paths.has(target));
  }
}
