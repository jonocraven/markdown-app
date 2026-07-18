// mobiletest.mjs — the mobile single-column shell and system-back-button
// contract (PLAN-ANDROID.md §3/§6 Phase A2).
//
// Runs against the SAME browser-mode preview server as the other five
// scripts, but with a Pixel-ish emulated context (390×844, hasTouch,
// isMobile) and the `?platform=android` dev override (see src/platform.ts)
// so isAndroid() — and therefore useIsMobile() — is true regardless of
// viewport width, matching how a real device would report itself.
//
// Covers: app bar (title/path), drawer open via button / close via scrim /
// close via hardware back (without navigating) / file tap (navigates AND
// closes), the popstate contract walking real navigation history (A→B→C,
// back to B then A, a further back at the root doesn't crash or navigate),
// the TOC bottom sheet (opened from the overflow menu, entry tap scrolls
// and dismisses), the search and quick-switcher full-screen takeovers, the
// overflow menu's zoom actions, and the app bar's edit toggle.
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/mobiletest.mjs

import { launch, PREVIEW_URL, makeChecker, assert, assertEqual, run } from "./helpers.mjs";

/** Mirrors helpers.mjs's openApp, but with touch/mobile emulation and the
 * `?platform=android` override — kept local to this script rather than
 * added to helpers.mjs, since the other five scripts never need it. */
async function openMobileApp(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto(`${PREVIEW_URL}/?platform=android`);
  await page.locator(".reader").first().waitFor({ state: "visible", timeout: 15000 });
  return { page, pageErrors };
}

await run("mobiletest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page, pageErrors } = await openMobileApp(browser);

    await check.ok("app bar renders with title and path on load", async () => {
      const title = await page.locator(".app-bar-title").textContent();
      assertEqual(title, "torture-test", "app bar title should be the file stem");
      const path = await page.locator(".app-bar-subtitle").textContent();
      assertEqual(path, "torture-test.md", "app bar subtitle should be the root-relative path");
      // Desktop-only chrome must not be in the DOM at all on mobile.
      assertEqual(await page.locator(".pane-tree").count(), 0, "desktop tree pane should not render on mobile");
      assertEqual(await page.locator(".footer-chrome").count(), 0, "desktop footer should not render on mobile");
    });

    await check.ok("drawer opens via the app bar button and closes via the scrim", async () => {
      await page.locator('.app-bar-btn[aria-label="Open file tree"]').click();
      await page.locator(".drawer").waitFor({ state: "visible", timeout: 3000 });
      // The drawer (width ~320px of a 390px viewport) sits above the scrim
      // in z-index, so a default centre-click on the full-viewport scrim
      // element would land under the drawer itself. Click the strip of
      // scrim actually visible to the right of the drawer instead.
      await page.locator('[data-testid="drawer-scrim"]').click({ position: { x: 370, y: 400 } });
      await page.locator(".drawer").waitFor({ state: "detached", timeout: 3000 });
    });

    await check.ok("drawer opens then hardware back closes it WITHOUT navigating", async () => {
      const before = await page.locator(".doc-path").first().textContent();
      await page.locator('.app-bar-btn[aria-label="Open file tree"]').click();
      await page.locator(".drawer").waitFor({ state: "visible", timeout: 3000 });
      await page.goBack();
      await page.locator(".drawer").waitFor({ state: "detached", timeout: 3000 });
      const after = await page.locator(".doc-path").first().textContent();
      assertEqual(after, before, "hardware back while the drawer is open must not change the document");
    });

    await check.ok("tapping a tree file navigates and closes the drawer (A → B)", async () => {
      await page.locator('.app-bar-btn[aria-label="Open file tree"]').click();
      await page.locator(".drawer").waitFor({ state: "visible", timeout: 3000 });
      await page.locator(".drawer .tree-col-item-label", { hasText: "index" }).first().click();
      await page.locator(".doc-path", { hasText: "index.md" }).waitFor({ timeout: 5000 });
      await page.locator(".drawer").waitFor({ state: "detached", timeout: 3000 });
    });

    await check.ok("a second file tap navigates again (B → C)", async () => {
      await page.locator('.app-bar-btn[aria-label="Open file tree"]').click();
      await page.locator(".drawer").waitFor({ state: "visible", timeout: 3000 });
      await page.locator(".drawer .tree-col-item-label", { hasText: "linked-note" }).first().click();
      await page.locator(".doc-path", { hasText: "linked-note.md" }).waitFor({ timeout: 5000 });
      await page.locator(".drawer").waitFor({ state: "detached", timeout: 3000 });
    });

    await check.ok("popstate walks history: back → B, back → A", async () => {
      await page.goBack();
      await page.locator(".doc-path", { hasText: "index.md" }).waitFor({ timeout: 5000 });
      await page.goBack();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });
    });

    await check.ok("a further back at the history root does not crash or wrongly navigate", async () => {
      await page.goBack();
      // Give any (incorrect) navigation a moment to happen before asserting
      // it didn't — there's no positive event to wait on here.
      await page.waitForTimeout(400);
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, "torture-test.md", "back at the history root should be a no-op, not a navigation");
      assert(pageErrors.length === 0, `page errors after root back: ${JSON.stringify(pageErrors)}`);
    });

    await check.ok("TOC sheet opens from the overflow menu", async () => {
      await page.locator('.app-bar-btn[aria-label="More"]').click();
      await page.locator(".overflow-menu").waitFor({ state: "visible", timeout: 3000 });
      await page.locator(".overflow-menu-item", { hasText: "Contents" }).click();
      await page.locator(".toc-sheet").waitFor({ state: "visible", timeout: 3000 });
      const items = await page.locator(".toc-sheet .toc-item").allTextContents();
      assert(items.includes("Callouts"), `TOC sheet missing "Callouts" — got ${JSON.stringify(items)}`);
    });

    await check.ok("tapping a TOC entry scrolls the document and dismisses the sheet", async () => {
      const before = await page.locator(".doc-scroll-host").evaluate((el) => el.scrollTop);
      await page.locator(".toc-sheet .toc-item", { hasText: "Callouts" }).click();
      await page.locator(".toc-sheet").waitFor({ state: "detached", timeout: 3000 });
      await page.waitForTimeout(400); // smooth-scroll
      const after = await page.locator(".doc-scroll-host").evaluate((el) => el.scrollTop);
      assert(after > before, `expected scrollTop to increase (before=${before}, after=${after})`);
    });

    await check.ok("search takeover opens full-screen and a result navigates", async () => {
      await page.locator('.app-bar-btn[aria-label="Search"]').click();
      await page.locator(".search-panel").waitFor({ state: "visible", timeout: 3000 });
      const panelWidth = await page.locator(".search-panel").evaluate((el) => el.getBoundingClientRect().width);
      assert(panelWidth > 350, `expected the search panel to take over the full ~390px width, got ${panelWidth}`);

      await page.locator(".search-input").fill("overview");
      await page.waitForTimeout(500); // debounce + render
      const before = await page.locator(".doc-path").first().textContent();
      await page.locator(".search-hit").first().click();
      await page.waitForTimeout(300);
      const after = await page.locator(".doc-path").first().textContent();
      assert(after !== before, `search result click should have navigated (was "${before}")`);
      assertEqual(await page.locator(".search-panel").count(), 0, "search takeover should close after selecting a result");
    });

    await check.ok("quick-open takeover works", async () => {
      await page.locator('.app-bar-btn[aria-label="Quick open"]').click();
      await page.locator(".quick-switcher").waitFor({ state: "visible", timeout: 3000 });
      await page.locator(".quick-switcher-input").fill("dly");
      await page.waitForTimeout(200);
      await page.locator(".quick-switcher-item", { hasText: "daily" }).click();
      await page.locator(".doc-path", { hasText: "notes/daily.md" }).waitFor({ timeout: 5000 });
      assertEqual(await page.locator(".quick-switcher").count(), 0, "quick switcher should close after selecting a file");
    });

    await check.ok("overflow Zoom In / Zoom Out change the reader font size", async () => {
      const baseline = await page.locator(".doc-scroll-host").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

      await page.locator('.app-bar-btn[aria-label="More"]').click();
      await page.locator(".overflow-menu-item", { hasText: "Zoom In" }).click();
      await page.waitForTimeout(150);
      const zoomedIn = await page.locator(".doc-scroll-host").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert(zoomedIn > baseline, `Zoom In should increase font size (baseline=${baseline}, after=${zoomedIn})`);

      await page.locator('.app-bar-btn[aria-label="More"]').click();
      await page.locator(".overflow-menu-item", { hasText: "Zoom Out" }).click();
      await page.waitForTimeout(150);
      await page.locator('.app-bar-btn[aria-label="More"]').click();
      await page.locator(".overflow-menu-item", { hasText: "Zoom Out" }).click();
      await page.waitForTimeout(150);
      const zoomedOut = await page.locator(".doc-scroll-host").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert(zoomedOut < zoomedIn, `Zoom Out should decrease font size (was=${zoomedIn}, after=${zoomedOut})`);
    });

    await check.ok("edit toggle from the app bar enters the editor", async () => {
      await page.locator('.app-bar-btn[aria-label="Edit"]').click();
      await page.locator(".cm-host").waitFor({ state: "visible", timeout: 3000 });
      assertEqual(await page.locator(".editor-shell").count(), 1, "expected .editor-shell wrapper while editing");
    });

    await check.ok("no uncaught page errors during the mobile flow", async () => {
      assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
