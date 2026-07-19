// linktest.mjs — link routing across the samples vault (src/linkRouter.ts).
//
// Covers: relative link navigation, wikilink navigation, [[wikilink|display]]
// aliased text, anchor link scroll, broken-link styling, broken-wikilink
// create popover (cancelled), ambiguous-stem disambiguation popover,
// external link handler (never actually opened), back/forward history via
// both the footer buttons and ⌘[ / ⌘].
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/linktest.mjs

import { launch, openApp, makeChecker, assert, assertEqual, chord, run } from "./helpers.mjs";

async function openFromRootBrowser(page, label) {
  // The sidebar file browser opens at the vault root when torture-test.md
  // (a root file) is the current document — see Tree.tsx's "reveal the open
  // document" effect. Click a file/folder label visible in the root listing.
  await page.locator(".tree-col-item-label", { hasText: label }).first().click();
}

await run("linktest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page } = await openApp(browser);

    await check.ok("relative link navigates to the target file", async () => {
      await openFromRootBrowser(page, "index");
      await page.locator(".doc-path", { hasText: "index.md" }).waitFor({ timeout: 5000 });
      await page.locator(".reader a", { hasText: "Linked note" }).click();
      await page.locator(".doc-path", { hasText: "linked-note.md" }).waitFor({ timeout: 5000 });
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, "linked-note.md", "relative link did not navigate correctly");
    });

    await check.ok("wikilink on the target page navigates back via [[torture test]]", async () => {
      await page.locator(".reader a", { hasText: "torture test" }).click();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, "torture-test.md", "wikilink navigation failed");
    });

    await check.ok("aliased wikilink [[linked note|the same note, aliased]] shows display text and navigates", async () => {
      const link = page.locator(".reader a", { hasText: "the same note, aliased" });
      assert((await link.count()) === 1, "aliased wikilink display text not found");
      await link.click();
      await page.locator(".doc-path", { hasText: "linked-note.md" }).waitFor({ timeout: 5000 });
    });

    await check.ok("anchor link scrolls to the target heading", async () => {
      // Back to torture-test.md, then follow the same-page anchor link to
      // #mermaid — far enough down the page that a real scroll must occur.
      await page.locator(".reader a", { hasText: "torture test" }).click();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });
      const before = await page.locator(".doc-scroll-host").evaluate((el) => el.scrollTop);
      await page.locator(".reader a", { hasText: "the Mermaid diagram" }).click();
      await page.waitForTimeout(500);
      const after = await page.locator(".doc-scroll-host").evaluate((el) => el.scrollTop);
      assert(after > before, `expected scrollTop to increase (before=${before}, after=${after})`);
    });

    await check.ok("broken relative link is styled graphite/dashed", async () => {
      await openFromRootBrowser(page, "archive");
      await page.locator(".tree-col-item-label", { hasText: "old-plan" }).click();
      await page.locator(".doc-path", { hasText: "old-plan.md" }).waitFor({ timeout: 5000 });
      const broken = page.locator(".reader a.broken-link", { hasText: "gone" });
      assert((await broken.count()) === 1, "broken relative link missing .broken-link class");
      const style = await broken.evaluate((el) => getComputedStyle(el).textDecorationStyle);
      assertEqual(style, "dashed", "broken link should have a dashed text-decoration-style");
    });

    await check.ok("broken wikilink is styled and offers a create popover (cancelled)", async () => {
      const brokenWikilink = page.locator(".reader a.broken-link", { hasText: "nonexistent page" });
      assert((await brokenWikilink.count()) === 1, "broken wikilink missing .broken-link class");
      await brokenWikilink.click();
      const popover = page.locator("[data-testid='link-popover']");
      await popover.waitFor({ timeout: 3000 });
      assertEqual(await popover.getAttribute("data-popover-kind"), "create", "expected the create-offer popover");
      const text = await popover.textContent();
      assert(text.includes("File not found"), "create popover missing expected copy");
      await page.locator(".link-popover-button", { hasText: "Cancel" }).click();
      await popover.waitFor({ state: "detached", timeout: 3000 });
      // Cancelling must not have created the file or navigated away.
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, "archive/old-plan.md", "cancel should leave the current document unchanged");
    });

    await check.ok("ambiguous wikilink stem opens a disambiguation popover", async () => {
      // The tree browser is still showing the "archive" folder (from the
      // previous check); jump back to the vault root via the breadcrumb
      // before opening index.md.
      await page.locator(".tree-crumb", { hasText: "Files" }).first().click();
      await page.locator(".tree-col-item-label", { hasText: "index" }).first().click();
      await page.locator(".doc-path", { hasText: "index.md" }).waitFor({ timeout: 5000 });

      await page.locator(".reader a", { hasText: "overview" }).click();
      const popover = page.locator("[data-testid='link-popover']");
      await popover.waitFor({ timeout: 3000 });
      assertEqual(await popover.getAttribute("data-popover-kind"), "disambiguate", "expected the disambiguation popover");
      const items = await page.locator(".link-popover-item").allTextContents();
      assert(items.includes("notes/overview.md"), "disambiguation missing notes/overview.md candidate");
      assert(items.includes("specs/overview.md"), "disambiguation missing specs/overview.md candidate");
      await page.keyboard.press("Escape");
      await popover.waitFor({ state: "detached", timeout: 3000 });
    });

    await check.ok("external links are handled without in-app navigation", async () => {
      // torture-test.md has the only autolink (https://example.com) in the
      // fixture vault — index.md's links are all relative/wikilinks.
      await page.locator(".reader a", { hasText: "torture test" }).click();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });
      const extLink = page.locator(".reader a[href^='http']").first();
      const href = await extLink.getAttribute("href");
      assert(/^https?:\/\//.test(href), "expected an external http(s) link on the page");
      assert(await extLink.evaluate((el) => el.classList.contains("external-link")), "external link missing .external-link styling class");

      let popupSeen = false;
      page.once("popup", async (popup) => {
        popupSeen = true;
        await popup.close();
      });
      const urlBefore = page.url();
      await extLink.click();
      await page.waitForTimeout(500);
      assert(popupSeen, "external link click did not open a new tab/window");
      assertEqual(page.url(), urlBefore, "external link click must not navigate the app's own page");
    });

    await check.ok("Back/Forward footer buttons replay history like a browser", async () => {
      // Current state: index.md is the last real navigation before the
      // external-link test (which didn't navigate). History so far:
      // linked-note -> torture-test -> linked-note -> old-plan -> index.
      const current = await page.locator(".doc-path").first().textContent();
      await page.locator('button[aria-label="Back"]').click();
      await page.waitForTimeout(300);
      const afterBack = await page.locator(".doc-path").first().textContent();
      assert(afterBack !== current, "Back button did not change the open document");
      await page.locator('button[aria-label="Forward"]').click();
      await page.waitForTimeout(300);
      const afterForward = await page.locator(".doc-path").first().textContent();
      assertEqual(afterForward, current, "Forward button should return to where Back left from");
    });

    await check.ok("⌘[ / ⌘] keyboard history matches the Back/Forward buttons", async () => {
      const current = await page.locator(".doc-path").first().textContent();
      await chord(page, "[");
      await page.waitForTimeout(300);
      const afterBack = await page.locator(".doc-path").first().textContent();
      assert(afterBack !== current, "⌘[ did not go back");
      await chord(page, "]");
      await page.waitForTimeout(300);
      const afterForward = await page.locator(".doc-path").first().textContent();
      assertEqual(afterForward, current, "⌘] did not return forward to the same document");
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
