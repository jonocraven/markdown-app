# Vault index

A map of the sample vault used to exercise Folio's link routing and history
(PLAN.md §5, §7 Phase 3). Every link style appears somewhere in this vault:
standard relative links, wikilinks, an anchor link, an ambiguous wikilink
stem, and a deliberately broken link.

- [Torture test](./torture-test.md) — the permanent rendering fixture; keep it intact.
- [Linked note](./linked-note.md)
- [[api spec]] — a wikilink that resolves unambiguously to `specs/api-spec.md`.
- [API spec, Endpoints section](./specs/api-spec.md#endpoints) — a relative link with an anchor.
- [[overview]] — deliberately ambiguous: both `specs/overview.md` and `notes/overview.md` share this stem. Clicked from here (the root), the two candidates are equidistant, so this should open a disambiguation popover.
- [Archive](./archive/old-plan.md) — contains a link to a file that does not exist, and a broken wikilink.
