// externalfilestest.mjs — file-manager links for non-Markdown files.
//
// Covers: all visible file types appear, Markdown remains in-app, other files
// launch separately with the OS default app in Tauri, and nested filenames
// remain keyboard-accessible.

import { launch, openApp, makeChecker, assert, assertEqual, run } from "./helpers.mjs";

async function openFilesFolder(page) {
  await page.locator(".tree-col-item-label", { hasText: "files" }).first().click();
  await page.locator(".tree-crumb.current", { hasText: "files" }).waitFor({ timeout: 3000 });
}

await run("externalfilestest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page } = await openApp(browser);

    await check.ok("folders lead, then Markdown and Other files are grouped separately", async () => {
      const markdownRow = page.locator("button.tree-col-item", { hasText: "index" }).first();
      assertEqual(await markdownRow.count(), 1, "Markdown row should retain button navigation");
      assertEqual(await page.locator(".tree-section[aria-label='Markdown']").count(), 1, "Markdown needs its own section");
      assertEqual(await page.locator(".tree-section[aria-label='Other files']").count(), 1, "Other files needs its own section");

      await openFilesFolder(page);
      const expected = ["report.pdf", "cover.PNG", "brief.DOCX", "backup.zip", "README", "example.HTML"];
      const labels = await page.locator(".tree-col-item-label").allTextContents();
      for (const name of expected) {
        assert(labels.includes(name), `visible non-Markdown file missing: ${name}; got ${JSON.stringify(labels)}`);
      }
      assert(!labels.includes(".DS_Store"), "hidden files must remain hidden");
    });

    await check.ok("other-file rows preserve filename, shade and describe the default-app launch", async () => {
      const row = page.locator("button.tree-col-item.external-file", { hasText: "report.pdf" });
      await row.waitFor({ timeout: 3000 });
      assert((await row.getAttribute("aria-label"))?.includes("default application"), "launch behaviour must be understandable without colour");
      const background = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
      assert(background !== "rgba(0, 0, 0, 0)", "external row must use the alternative paper shade");
    });

    await check.ok("other files launch separately and never enter the Markdown reader", async () => {
      const before = await page.locator(".doc-path").first().textContent();
      const popup = page.waitForEvent("popup");
      await page.locator("button.tree-col-item.external-file", { hasText: "report.pdf" }).click();
      await (await popup).close();
      assertEqual(await page.locator(".doc-path").first().textContent(), before, "external file must not navigate the reader");
    });

    await check.ok("nested Unicode and URL-sensitive filenames remain launchable and keyboard-accessible", async () => {
      await page.locator(".tree-col-item-label", { hasText: "nested" }).click();
      const row = page.locator("button.tree-col-item.external-file", { hasText: "résumé # 100%.html" });
      await row.waitFor({ timeout: 3000 });
      await row.focus();
      assertEqual(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "résumé # 100%.html (opens with the default application)", "external row must receive keyboard focus");
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
