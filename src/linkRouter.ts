/**
 * Resolves a single <a> click (relative link, wikilink, anchor or external)
 * into an action for the caller to perform. This is deliberately pure
 * resolution logic — it never touches history or the DOM itself, except for
 * opening external links, which have no in-app navigation consequence.
 * See PLAN.md §5 for the behaviour spec.
 */
import { slug } from "github-slugger";
import { isTauri } from "./ipc";
import { vault } from "./vault";
import { dirDistance, dirname, joinRelative, normalizeStem } from "./pathUtils";

export type LinkAction =
  | { type: "navigate"; path: string; anchor?: string }
  | { type: "scroll"; id: string }
  | { type: "external" }
  | { type: "disambiguate"; candidates: string[] }
  | { type: "create-offer"; path: string; title: string }
  | { type: "noop" };

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Filesystem-safe slug for a *new* file created from wikilink text — not
 * to be confused with the heading-anchor slug (github-slugger), which must
 * match rehype-slug's algorithm exactly. */
function filenameSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function resolveLinkClick(
  href: string | null,
  wikilink: string | null,
  currentPath: string | null,
): Promise<LinkAction> {
  const currentDir = currentPath ? dirname(currentPath) : "";

  if (wikilink) {
    const target = normalizeStem(wikilink);
    const index = await vault.linkIndex();
    const candidates = index.filter((e) => normalizeStem(e.stem) === target);

    if (candidates.length === 0) {
      const path = joinRelative(currentDir, `${filenameSlug(wikilink)}.md`);
      return { type: "create-offer", path, title: titleCase(wikilink.trim()) };
    }
    if (candidates.length === 1) {
      return { type: "navigate", path: candidates[0].path };
    }

    // Prefer the candidate whose directory is closest to the current file's.
    const withDistance = candidates.map((c) => ({
      path: c.path,
      distance: dirDistance(currentDir, dirname(c.path)),
    }));
    const minDistance = Math.min(...withDistance.map((c) => c.distance));
    const nearest = withDistance.filter((c) => c.distance === minDistance);

    if (nearest.length === 1) {
      return { type: "navigate", path: nearest[0].path };
    }
    return { type: "disambiguate", candidates: nearest.map((c) => c.path) };
  }

  if (!href) return { type: "noop" };

  if (/^https?:\/\//i.test(href)) {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
    return { type: "external" };
  }

  if (href.startsWith("#")) {
    return { type: "scroll", id: href.slice(1) };
  }

  const [pathPart, anchorPart] = href.split("#");
  if (!pathPart) return { type: "noop" };

  const targetPath = joinRelative(currentDir, pathPart);
  const exists = await vault.exists(targetPath);
  if (!exists) {
    // Broken standard link: already styled .broken-link by the post-mount
    // pass; PLAN.md §5 only offers the create-on-click flow for wikilinks.
    return { type: "noop" };
  }

  return {
    type: "navigate",
    path: targetPath,
    // Slugify with the same algorithm rehype-slug used to mint heading ids.
    anchor: anchorPart ? slug(anchorPart) : undefined,
  };
}
