// run-all.mjs — orchestrates the full regression suite for `npm run test:all`.
//
// Builds once, starts `vite preview` on a fixed port (4173, strictPort),
// waits for it to answer, runs all six scripts sequentially against it
// (the five desktop scripts, then mobiletest.mjs — PLAN-ANDROID.md §6
// Phase A2), then kills the server — reporting a combined pass/fail summary.
//
// Each script also works standalone against an already-running preview
// server via PREVIEW_URL (see tests/README.md) — this file is only the
// "build + serve + run everything + tear down" convenience wrapper.

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 4173;
const PREVIEW_URL = `http://localhost:${PORT}`;
const SCRIPTS = ["smoke.mjs", "linktest.mjs", "edittest.mjs", "searchtest.mjs", "fileopstest.mjs", "mobiletest.mjs"];

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))));
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(300);
  }
  throw new Error(`preview server at ${url} did not come up within ${timeoutMs}ms`);
}

async function main() {
  console.log("== test:all — building ==");
  await run("npm", ["run", "build"]);

  console.log(`== test:all — starting vite preview on :${PORT} ==`);
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (d) => (serverOutput += d.toString()));
  server.stderr.on("data", (d) => (serverOutput += d.toString()));

  const results = [];
  try {
    await waitForServer(PREVIEW_URL);
    console.log(`== test:all — preview server is up at ${PREVIEW_URL} ==\n`);

    for (const script of SCRIPTS) {
      console.log(`\n---- ${script} ----`);
      try {
        await run(process.execPath, [new URL(script, import.meta.url).pathname], {
          env: { ...process.env, PREVIEW_URL },
        });
        results.push({ script, ok: true });
      } catch (err) {
        results.push({ script, ok: false, error: err.message });
      }
    }
  } finally {
    server.kill();
    // Give it a moment to release the port before the process exits.
    await delay(200);
  }

  console.log("\n== test:all — summary ==");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.script}${r.ok ? "" : `: ${r.error}`}`);
  }
  const allOk = results.every((r) => r.ok);
  if (!allOk) {
    console.error("\nSome scripts failed. Server output tail:\n" + serverOutput.split("\n").slice(-30).join("\n"));
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("test:all failed:", err);
  process.exit(1);
});
