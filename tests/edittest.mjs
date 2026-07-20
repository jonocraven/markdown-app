// edittest.mjs — editing, autosave, conflict detection, task checkbox write-back.
//
// Covers: ⌘E toggles CodeMirror editor and back; typing + autosave (2s idle
// debounce) persists (verified by toggling back to the reader and checking
// rendered output); the kill-test (start editing, simulate an external edit
// on the same file via window.__markdownReaderSimulateExternalEdit, save,
// confirm the conflict banner appears); "keep mine" and "take theirs";
// task-checkbox click in the Reader writes back to source.
//
// Standalone usage: PREVIEW_URL=http://localhost:4173 node tests/edittest.mjs

import { launch, openApp, makeChecker, assert, assertEqual, chord, run } from "./helpers.mjs";

const AUTOSAVE_IDLE_MS = 2000;

await run("edittest", async () => {
  const browser = await launch();
  const check = makeChecker();

  try {
    const { page } = await openApp(browser);

    // Work against linked-note.md — short and isolated from the other
    // scripts' fixture use of torture-test.md, so nothing here depends on
    // (or disturbs) smoke.mjs/linktest.mjs assumptions when run standalone.
    await page.locator(".tree-col-item-label", { hasText: "linked-note" }).first().click();
    await page.locator(".doc-path", { hasText: "linked-note.md" }).waitFor({ timeout: 5000 });

    await check.ok("⌘E toggles into the CodeMirror editor", async () => {
      assertEqual(await page.locator(".cm-host").count(), 0, "editor should not be mounted in reader mode");
      await chord(page, "e");
      await page.locator(".cm-host").waitFor({ timeout: 3000 });
      assertEqual(await page.locator(".editor-shell").count(), 1, "expected .editor-shell wrapper while editing");
      assertEqual(await page.locator(".reader").count(), 0, "Reader should be unmounted while editing");
    });

    await check.ok("⌘E toggles back to the Reader", async () => {
      await chord(page, "e");
      await page.locator(".reader").first().waitFor({ timeout: 3000 });
      assertEqual(await page.locator(".cm-host").count(), 0, "editor should be unmounted back in reader mode");
    });

    const marker = `edit-marker-${Date.now()}`;

    await check.ok("typing in the editor marks the document unsaved", async () => {
      await chord(page, "e");
      await page.locator(".cm-content").waitFor({ timeout: 3000 });
      await page.locator(".cm-content").click();
      await page.keyboard.press("End");
      await page.keyboard.type(` ${marker}`);
      await page.waitForTimeout(200);
      const status = await page.locator(".footer-status").textContent();
      assert(status.includes("Unsaved changes"), `expected "Unsaved changes" in footer, got "${status}"`);
    });

    await check.ok("autosave (2s idle debounce) persists the edit", async () => {
      // Wait past the debounce window, then confirm the footer reports Saved.
      await page.waitForTimeout(AUTOSAVE_IDLE_MS + 800);
      const status = await page.locator(".footer-status").textContent();
      assert(status.includes("Saved"), `expected "Saved" in footer after the idle debounce, got "${status}"`);
    });

    await check.ok("the autosaved edit is really persisted — visible in the reader after toggling back", async () => {
      await chord(page, "e");
      await page.locator(".reader").first().waitFor({ timeout: 3000 });
      const text = await page.locator(".reader").first().textContent();
      assert(text.includes(marker), `rendered reader output missing the autosaved edit "${marker}"`);
    });

    await check.ok("kill-test: an external edit while dirty, then save, surfaces the conflict banner", async () => {
      await chord(page, "e");
      await page.locator(".cm-content").waitFor({ timeout: 3000 });
      await page.locator(".cm-content").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" mine-not-saved-yet");
      await page.waitForTimeout(200); // dirty, but well inside the 2s autosave window

      await page.evaluate(() => {
        window.__markdownReaderSimulateExternalEdit(
          "linked-note.md",
          "# Linked note\n\nChanged out from under the open editor.\n",
        );
      });
      await page.waitForTimeout(200);
      // Still dirty, so the live-reload subscription must have skipped the
      // reload (App.tsx: "If the open file has unsaved edits, do NOT clobber
      // the buffer") — the conflict only surfaces once a save is attempted.
      assertEqual(await page.locator(".conflict-banner").count(), 0, "conflict banner appeared before any save was attempted");

      await chord(page, "s");
      await page.locator(".conflict-banner").waitFor({ timeout: 3000 });
      const label = await page.locator(".conflict-banner-label").textContent();
      assertEqual(label, "File changed on disk", "unexpected conflict banner label");
    });

    await check.ok('"Keep mine" resolves the conflict and saves the local edit', async () => {
      await page.locator(".conflict-banner-button", { hasText: "Keep mine" }).click();
      await page.locator(".conflict-banner").waitFor({ state: "detached", timeout: 3000 });
      await page.waitForTimeout(300);
      await chord(page, "e"); // back to reader
      await page.locator(".reader").first().waitFor({ timeout: 3000 });
      const text = await page.locator(".reader").first().textContent();
      assert(text.includes("mine-not-saved-yet"), "Keep mine should have saved the local (pending) content");
    });

    await check.ok('"Take theirs" discards local edits in favour of the on-disk version', async () => {
      await chord(page, "e");
      await page.locator(".cm-content").waitFor({ timeout: 3000 });
      await page.locator(".cm-content").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" a-local-edit-about-to-be-discarded");
      await page.waitForTimeout(200);

      await page.evaluate(() => {
        window.__markdownReaderSimulateExternalEdit(
          "linked-note.md",
          "# Linked note\n\nTake-theirs external content.\n",
        );
      });
      await page.waitForTimeout(200);
      await chord(page, "s");
      await page.locator(".conflict-banner").waitFor({ timeout: 3000 });

      await page.locator(".conflict-banner-button", { hasText: "Take theirs" }).click();
      await page.locator(".conflict-banner").waitFor({ state: "detached", timeout: 3000 });
      await page.waitForTimeout(300);

      const cmText = await page.locator(".cm-content").textContent();
      assert(cmText.includes("Take-theirs external content"), "editor buffer should reflect the disk version after Take theirs");
      assert(!cmText.includes("a-local-edit-about-to-be-discarded"), "local edit should have been discarded by Take theirs");
    });

    await check.ok("task checkbox click in the Reader writes back to source", async () => {
      // Switch to torture-test.md, which has known task markers.
      await chord(page, "e"); // leave editor (if still in it) — safe no-op check below handles either state
      await page.locator(".tree-crumb", { hasText: "Files" }).first().click().catch(() => {});
      await page.locator(".tree-col-item-label", { hasText: "torture-test" }).first().click();
      await page.locator(".doc-path", { hasText: "torture-test.md" }).waitFor({ timeout: 5000 });

      const checkbox = page.locator('[data-task-index="1"]');
      const before = await checkbox.isChecked();
      assertEqual(before, false, "expected the second task checkbox to start unchecked");
      await checkbox.click();
      await page.waitForTimeout(400);
      assertEqual(await checkbox.isChecked(), true, "checkbox should stay checked after the click");

      // Reload the document (toggle to editor and back) to confirm the
      // write actually landed in source, not just optimistic UI state.
      await chord(page, "e");
      await page.locator(".cm-content").waitFor({ timeout: 3000 });
      const source = await page.locator(".cm-content").textContent();
      assert(/\[x\].*Tick this checkbox/.test(source) || source.includes("[x] Tick this checkbox"), "source does not show the task marker flipped to [x]");
      await chord(page, "e");
      await page.locator(".reader").first().waitFor({ timeout: 3000 });
    });
  } finally {
    await browser.close();
  }

  return check.count();
});
