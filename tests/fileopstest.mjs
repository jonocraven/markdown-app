// fileopstest.mjs — file ops via the UI: create, rename, move-to-bin.
//
// Covers: New File dialog (create a file, it appears in the tree and opens;
// cancel path), tree context-menu (right-click) Rename with inline input
// (Enter confirms, Escape cancels), Move to Bin with its confirm popover
// (and cancel path), binned file disappears from the tree.
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/fileopstest.mjs

import { launch, openApp, makeChecker, assert, assertEqual, run } from "./helpers.mjs";

await run("fileopstest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page } = await openApp(browser);

    await check.ok("New File dialog cancel path leaves no file behind", async () => {
      await page.locator(".tree-item", { hasText: "New file" }).click();
      await page.locator(".new-file-dialog").waitFor({ timeout: 3000 });
      await page.locator(".new-file-input").fill("should-not-exist");
      await page.locator(".link-popover-button", { hasText: "Cancel" }).click();
      await page.locator(".new-file-dialog").waitFor({ state: "detached", timeout: 3000 });
      assertEqual(await page.locator(".tree-col-item-label", { hasText: "should-not-exist" }).count(), 0, "cancelled new-file dialog must not create a file");
    });

    const newFileName = `fileops-test-${Date.now()}`;

    await check.ok("New File dialog creates a file, which appears in the tree and opens", async () => {
      await page.locator(".tree-item", { hasText: "New file" }).click();
      await page.locator(".new-file-dialog").waitFor({ timeout: 3000 });
      await page.locator(".new-file-input").fill(newFileName);
      await page.locator(".link-popover-button", { hasText: "Create" }).click();
      await page.locator(".new-file-dialog").waitFor({ state: "detached", timeout: 3000 });

      await page.locator(".doc-path", { hasText: `${newFileName}.md` }).waitFor({ timeout: 5000 });
      const path = await page.locator(".doc-path").first().textContent();
      assertEqual(path, `${newFileName}.md`, "new file should open automatically after creation");

      const h1 = await page.locator(".reader h1").first().textContent();
      assertEqual(h1, newFileName, "new file should start with a `# <stem>` heading");

      assertEqual(await page.locator(".tree-col-item-label", { hasText: newFileName }).count(), 1, "new file should appear in the tree");
    });

    const renamedFileName = `${newFileName}-renamed`;

    await check.ok("tree context-menu Escape/cancel path leaves the file unrenamed", async () => {
      await page.locator(".tree-col-item-label", { hasText: newFileName }).click({ button: "right" });
      const menu = page.locator("[data-testid='link-popover'][data-popover-kind='tree-menu']");
      await menu.waitFor({ timeout: 3000 });
      const items = await page.locator(".link-popover-item").allTextContents();
      assert(items.some((t) => t.includes("Rename")), `context menu missing Rename — got ${JSON.stringify(items)}`);
      assert(items.some((t) => t.includes("Move to Bin")), `context menu missing Move to Bin — got ${JSON.stringify(items)}`);
      await page.locator(".link-popover-item", { hasText: "Rename" }).click();
      await page.locator(".tree-rename-input").waitFor({ timeout: 3000 });
      await page.locator(".tree-rename-input").fill("this-should-be-discarded");
      await page.keyboard.press("Escape");
      await page.locator(".tree-rename-input").waitFor({ state: "detached", timeout: 3000 });
      assertEqual(await page.locator(".tree-col-item-label", { hasText: newFileName }).count(), 1, "Escape should leave the original filename in place");
      assertEqual(await page.locator(".tree-col-item-label", { hasText: "this-should-be-discarded" }).count(), 0, "Escape must not apply the in-progress rename");
    });

    await check.ok("tree context-menu Rename with Enter confirms the new name", async () => {
      await page.locator(".tree-col-item-label", { hasText: newFileName }).click({ button: "right" });
      await page.locator("[data-testid='link-popover'][data-popover-kind='tree-menu']").waitFor({ timeout: 3000 });
      await page.locator(".link-popover-item", { hasText: "Rename" }).click();
      await page.locator(".tree-rename-input").waitFor({ timeout: 3000 });
      await page.locator(".tree-rename-input").fill(renamedFileName);
      await page.keyboard.press("Enter");
      await page.locator(".tree-rename-input").waitFor({ state: "detached", timeout: 3000 });

      const labels = await page.locator(".tree-col-item-label").allTextContents();
      assert(labels.includes(renamedFileName), `renamed file should appear under its new name — got ${JSON.stringify(labels)}`);
      assert(!labels.includes(newFileName), `old filename should no longer be present — got ${JSON.stringify(labels)}`);

      // The open document (still the just-created file) should follow the rename.
      await page.locator(".doc-path", { hasText: `${renamedFileName}.md` }).waitFor({ timeout: 5000 });
    });

    await check.ok("Move to Bin confirm popover cancel path leaves the file in place", async () => {
      await page.locator(".tree-col-item-label", { hasText: renamedFileName }).click({ button: "right" });
      await page.locator("[data-testid='link-popover'][data-popover-kind='tree-menu']").waitFor({ timeout: 3000 });
      await page.locator(".link-popover-item", { hasText: "Move to Bin" }).click();
      const confirm = page.locator("[data-testid='link-popover'][data-popover-kind='tree-delete-confirm']");
      await confirm.waitFor({ timeout: 3000 });
      const text = await confirm.textContent();
      assert(text.includes("Move to Bin?"), `delete confirm popover missing expected copy: "${text}"`);
      assert(text.includes(`${renamedFileName}.md`), "delete confirm popover should show the target path");
      await page.locator(".link-popover-button", { hasText: "Cancel" }).click();
      await confirm.waitFor({ state: "detached", timeout: 3000 });
      assertEqual(await page.locator(".tree-col-item-label", { hasText: renamedFileName }).count(), 1, "Cancel must leave the file in the tree");
    });

    await check.ok("Move to Bin confirm deletes the file and it disappears from the tree", async () => {
      await page.locator(".tree-col-item-label", { hasText: renamedFileName }).click({ button: "right" });
      await page.locator("[data-testid='link-popover'][data-popover-kind='tree-menu']").waitFor({ timeout: 3000 });
      await page.locator(".link-popover-item", { hasText: "Move to Bin" }).click();
      const confirm = page.locator("[data-testid='link-popover'][data-popover-kind='tree-delete-confirm']");
      await confirm.waitFor({ timeout: 3000 });
      await page.locator(".link-popover-button", { hasText: "Confirm" }).click();
      await confirm.waitFor({ state: "detached", timeout: 3000 });
      await page.waitForTimeout(300);

      assertEqual(await page.locator(".tree-col-item-label", { hasText: renamedFileName }).count(), 0, "binned file should disappear from the tree");

      // Deleting the currently-open document clears the reading pane too
      // (App.tsx's removePath handling) — this is real app behaviour, not a
      // test artefact, so assert on it rather than working around it.
      const emptyState = await page.locator(".empty-state").count();
      assert(emptyState === 1, "binning the open document should show the empty state");
    });

    await check.ok("New File dialog reports an error on a name collision, without navigating away", async () => {
      // index.md already exists at the vault root.
      await page.locator(".tree-item", { hasText: "New file" }).click();
      await page.locator(".new-file-dialog").waitFor({ timeout: 3000 });
      await page.locator(".new-file-input").fill("index");
      await page.locator(".link-popover-button", { hasText: "Create" }).click();
      await page.locator(".new-file-error").waitFor({ timeout: 3000 });
      const errorText = await page.locator(".new-file-error").textContent();
      assert(errorText.includes("already exists"), `unexpected new-file error text: "${errorText}"`);
      // Dialog should stay open so the user can pick a different name.
      assertEqual(await page.locator(".new-file-dialog").count(), 1, "dialog should remain open after a collision error");
      await page.locator(".link-popover-button", { hasText: "Cancel" }).click();
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
