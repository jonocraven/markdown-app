// Shared helpers for the plain-node Playwright regression scripts
// (smoke.mjs, linktest.mjs, edittest.mjs, searchtest.mjs, fileopstest.mjs).
//
// No test framework — each script launches its own browser, runs a
// sequence of checks, prints "ok — <check>" as it goes, and exits 0 on
// success or 1 (with a clear FAIL message) on the first failed assertion.
//
// Usage: each script is standalone against an already-running preview
// server. Point it at a different origin with PREVIEW_URL if needed;
// defaults to http://localhost:4173 (the port `npm run test:all` starts
// `vite preview` on). See tests/README.md.

import { chromium } from "playwright";

export const PREVIEW_URL = process.env.PREVIEW_URL ?? "http://localhost:4173";

// Chromium is preinstalled in this container at a fixed path (see
// CLAUDE.md/task instructions) — PLAYWRIGHT_BROWSERS_PATH points at
// /opt/pw-browsers, but the exact revisioned subfolder can drift between
// environments, so resolve it defensively instead of hardcoding the
// "-1194" suffix. Falls back to Playwright's own resolution (a plain
// chromium.launch()) if nothing matches, so this also works unmodified in
// an environment where `playwright install` was run for real.
function resolveExecutablePath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    if (!fs.existsSync(base)) return undefined;
    const entries = fs.readdirSync(base).filter((e) => e.startsWith("chromium-"));
    for (const entry of entries) {
      const candidate = path.join(base, entry, "chrome-linux", "chrome");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // fall through to undefined — chromium.launch() will use its own default resolution
  }
  return undefined;
}

// require() shim for the tiny bit of CJS above (this file is loaded as ESM).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

/** Launch headless Chromium, matching this container's setup. */
export async function launch() {
  const executablePath = resolveExecutablePath();
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** A tiny progressive-checklist runner: prints "ok — <label>" as each
 * check passes, and throws (with a "FAIL — <label>: <reason>" message) on
 * the first failure, so the calling script's top-level catch can print it
 * and exit non-zero. */
export function makeChecker() {
  let count = 0;
  return {
    async ok(label, fn) {
      try {
        await fn();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`FAIL — ${label}: ${reason}`);
      }
      count += 1;
      console.log(`ok — ${label}`);
    },
    count() {
      return count;
    },
  };
}

/** Assertion helpers with clear failure messages. */
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message ?? "values differ"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Open a fresh page against the preview server and wait for the initial
 * render (torture-test.md, opened automatically in browser mode — see
 * App.tsx's browser-mode bootstrap effect). */
export async function openApp(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto(PREVIEW_URL);
  await page.locator(".reader").first().waitFor({ state: "visible", timeout: 15000 });
  return { page, pageErrors };
}

/** Meta (Cmd) is what App.tsx's keydown handler checks first (e.metaKey ||
 * e.ctrlKey) — Chromium on Linux honours Meta as a real modifier key for
 * keyboard shortcuts, so this matches the project's own guidance
 * (CLAUDE.md: "use Meta on Chromium/Linux"). */
export async function chord(page, key, { shift = false } = {}) {
  await page.keyboard.down("Meta");
  if (shift) await page.keyboard.down("Shift");
  await page.keyboard.press(key);
  if (shift) await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
}

/** Run `main`, print a summary, and set the process exit code — the common
 * tail every script shares. */
export async function run(name, main) {
  const startedAt = Date.now();
  try {
    const checks = await main();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n${name}: ${checks} check(s) passed in ${elapsed}s`);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${name}: ${message}`);
    process.exit(1);
  }
}
