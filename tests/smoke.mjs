// smoke.mjs — torture-test.md renders correctly.
//
// Covers: title, headings/TOC, table, task-list checkboxes, footnotes,
// callouts, KaTeX output, Shiki-highlighted code, Mermaid diagram
// (lazy-loaded — waited for explicitly), frontmatter block, word count.
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/smoke.mjs
// (defaults to http://localhost:4173 if PREVIEW_URL is unset).

import { launch, openApp, makeChecker, assert, run } from "./helpers.mjs";

await run("smoke", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page, pageErrors } = await openApp(browser);

    await check.ok("torture-test.md is open on load", async () => {
      const text = await page.locator(".doc-path").first().textContent();
      assert(text === "torture-test.md", `expected doc-path "torture-test.md", got "${text}"`);
    });

    await check.ok("title heading renders", async () => {
      const h1 = await page.locator(".reader h1").first().textContent();
      assert(h1 === "The Markdown Reader torture test", `unexpected h1: "${h1}"`);
    });

    await check.ok("frontmatter metadata block renders", async () => {
      const count = await page.locator(".frontmatter").count();
      assert(count === 1, `expected 1 .frontmatter block, got ${count}`);
      const text = await page.locator(".frontmatter").textContent();
      assert(text.includes("title") && text.includes("Torture test"), "frontmatter missing expected fields");
    });

    await check.ok("headings populate the TOC panel", async () => {
      const items = await page.locator(".toc-item").allTextContents();
      for (const expected of ["Tables", "Task lists", "Callouts", "Mermaid", "Footnotes"]) {
        assert(items.includes(expected), `TOC missing "${expected}" — got ${JSON.stringify(items)}`);
      }
    });

    await check.ok("GFM table renders with rows", async () => {
      const rows = await page.locator(".reader table tbody tr").count();
      assert(rows === 3, `expected 3 table body rows, got ${rows}`);
      const headerText = await page.locator(".reader table thead").textContent();
      assert(headerText.includes("Category"), "table header missing expected column");
    });

    await check.ok("task-list checkboxes render with data-task-index", async () => {
      const count = await page.locator("[data-task-index]").count();
      assert(count === 4, `expected 4 task checkboxes, got ${count}`);
      const firstChecked = await page.locator('[data-task-index="0"]').isChecked();
      assert(firstChecked === true, "first task checkbox should start checked");
      const secondChecked = await page.locator('[data-task-index="1"]').isChecked();
      assert(secondChecked === false, "second task checkbox should start unchecked");
    });

    await check.ok("footnotes render at the end of the document", async () => {
      const section = page.locator("section[data-footnotes]");
      assert((await section.count()) === 1, "expected a footnotes section");
      const text = await section.textContent();
      assert(text.includes("hairline rule"), "footnote body text missing");
      assert((await section.locator("a[data-footnote-backref]").count()) >= 1, "missing footnote backref link");
    });

    await check.ok("all five callout kinds render", async () => {
      const kinds = await page.locator(".callout").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-callout")),
      );
      for (const expected of ["note", "tip", "important", "warning", "caution"]) {
        assert(kinds.includes(expected), `missing callout kind "${expected}" — got ${JSON.stringify(kinds)}`);
      }
    });

    await check.ok("KaTeX renders inline and display maths", async () => {
      const inline = await page.locator(".katex").count();
      assert(inline >= 2, `expected at least 2 .katex nodes (inline + display), got ${inline}`);
      const display = await page.locator(".katex-display").count();
      assert(display === 1, `expected 1 .katex-display node, got ${display}`);
    });

    await check.ok("Shiki highlights fenced code blocks", async () => {
      const langs = await page.locator("pre[data-lang]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-lang")),
      );
      assert(langs.includes("typescript"), `expected a typescript code block — got ${JSON.stringify(langs)}`);
      assert(langs.includes("rust"), `expected a rust code block — got ${JSON.stringify(langs)}`);
      const coloured = await page.locator(".code-block pre span[style*='color']").count();
      assert(coloured > 0, "expected Shiki to emit inline colour spans");
      const copyButtons = await page.locator(".code-copy").count();
      assert(copyButtons >= 3, `expected a copy button per code block, got ${copyButtons}`);
    });

    await check.ok("Mermaid diagram lazy-loads and renders an SVG", async () => {
      // Lazy-loaded after paint (see src/markdown/mermaid.ts) — give it a
      // generous window since the mermaid bundle is large.
      await page.locator(".mermaid-block svg").first().waitFor({ state: "visible", timeout: 20000 });
      const svgCount = await page.locator(".mermaid-block svg").count();
      assert(svgCount === 1, `expected 1 rendered mermaid diagram, got ${svgCount}`);
      // The raw ```mermaid fence should have been replaced, not left as source.
      const rawFenceLeft = await page.locator("pre > code.language-mermaid").count();
      assert(rawFenceLeft === 0, "mermaid fence was not replaced by the rendered diagram");
    });

    await check.ok("word count appears in the footer", async () => {
      const text = await page.locator(".footer-status").textContent();
      assert(/\d[\d,]* words?/.test(text), `footer status doesn't look like a word count: "${text}"`);
    });

    await check.ok("no uncaught page errors during render", async () => {
      assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
