// searchtest.mjs — full-text search panel and the quick switcher.
//
// Covers: ⇧⌘F opens the search panel, a query returns grouped-by-file
// results, clicking a hit opens the file and scrolls to the line (brief
// highlight pulse); ⌘K quick switcher fuzzy-matches a filename and opens it.
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/searchtest.mjs

import { launch, openApp, makeChecker, assert, assertEqual, chord, run } from "./helpers.mjs";

await run("searchtest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page } = await openApp(browser);

    await check.ok("⇧⌘F opens the search panel and focuses its input", async () => {
      await chord(page, "F", { shift: true });
      await page.locator(".search-panel").waitFor({ timeout: 3000 });
      const isFocused = await page.locator(".search-input").evaluate((el) => el === document.activeElement);
      assert(isFocused, "search input should be focused when the panel opens");
    });

    await check.ok("a query returns results grouped by file", async () => {
      // "overview" appears in both notes/overview.md and specs/overview.md
      // (see samples/index.md's deliberate ambiguous-stem note), so this
      // also exercises multiple file groups in one query.
      await page.locator(".search-input").fill("overview");
      await page.waitForTimeout(500); // 200ms debounce + render
      const groups = await page.locator(".search-file-group").count();
      assert(groups >= 2, `expected at least 2 file groups for "overview", got ${groups}`);
      const paths = await page.locator(".search-file-path").allTextContents();
      assert(paths.includes("notes/overview.md"), `missing notes/overview.md in ${JSON.stringify(paths)}`);
      assert(paths.includes("specs/overview.md"), `missing specs/overview.md in ${JSON.stringify(paths)}`);
      const hitCountText = await page.locator(".search-hit-count").textContent();
      assert(/\d+ match/.test(hitCountText), `unexpected hit-count text: "${hitCountText}"`);
    });

    await check.ok("clicking a hit opens the file and scrolls with a highlight pulse", async () => {
      await page.locator(".search-input").fill("Bringhurst");
      await page.waitForTimeout(500);
      const hit = page.locator(".search-hit").first();
      assert((await hit.count()) === 1, "expected exactly one hit for the unique word 'Bringhurst'");
      await hit.click();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });
      // Search panel closes itself on result click (onClose in handleResultClick).
      assertEqual(await page.locator(".search-panel").count(), 0, "search panel should close after clicking a result");
      // The brief highlight pulse class is added then removed ~600ms later —
      // poll for it rather than racing a single fixed wait.
      await page.locator(".search-scroll-pulse").waitFor({ timeout: 2000 });
    });

    await check.ok("⌘K opens the quick switcher and focuses its input", async () => {
      await chord(page, "k");
      await page.locator(".quick-switcher").waitFor({ timeout: 3000 });
      const isFocused = await page.locator(".quick-switcher-input").evaluate((el) => el === document.activeElement);
      assert(isFocused, "quick switcher input should be focused when it opens");
    });

    await check.ok("fuzzy match on a filename opens that file", async () => {
      // "dly" is a subsequence fuzzy match for "daily" (notes/daily.md),
      // not a literal substring — exercises the actual fuzzy scorer.
      await page.locator(".quick-switcher-input").fill("dly");
      await page.waitForTimeout(200);
      const items = await page.locator(".quick-switcher-item").allTextContents();
      assert(items.some((t) => t.includes("daily")), `expected a "daily" match for fuzzy query "dly", got ${JSON.stringify(items)}`);
      await page.keyboard.press("Enter");
      await page.locator(".doc-path", { hasText: "notes/daily.md" }).waitFor({ timeout: 5000 });
      assertEqual(await page.locator(".quick-switcher").count(), 0, "quick switcher should close after selecting a file");
    });

    await check.ok("quick switcher Escape closes without navigating", async () => {
      await chord(page, "k");
      await page.locator(".quick-switcher").waitFor({ timeout: 3000 });
      await page.locator(".quick-switcher-input").fill("index");
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      await page.locator(".quick-switcher").waitFor({ state: "detached", timeout: 3000 });
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, "notes/daily.md", "Escape should not have navigated away from the current document");
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
