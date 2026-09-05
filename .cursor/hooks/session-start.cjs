/**
 * sessionStart: set env (reliable) + additional_context (best-effort; may race).
 * Reads stdin JSON from Cursor; writes JSON to stdout.
 */
const fs = require("node:fs");
const path = require("node:path");

let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {
  input = "";
}

void input;

const root =
  (process.env.CURSOR_PROJECT_DIR && String(process.env.CURSOR_PROJECT_DIR)) ||
  process.cwd();

const playbook = path.join(root, "docs", "playbook.md");
const vaultOk = fs.existsSync(playbook);

const additional_context = vaultOk
  ? [
      "Texture Manager 2 agent vault is at docs/.",
      "After the IDE plan is approved, read docs/playbook.md and keep docs/processes/definition-of-done.md open.",
      "App map: docs/app/ (purpose-and-flows, tools, invoke-surface, run-test-lint, publish, verify).",
      "Do not open or merge PRs. Verify runtime work per docs/app/verify.md.",
      "Load Cursor skill agent-knowledge-base when starting product work.",
    ].join(" ")
  : "Expected docs/playbook.md was not found; check workspace root.";

const payload = {
  env: {
    TM2_AGENT_VAULT: "docs",
    TM2_AGENT_PLAYBOOK: "docs/playbook.md",
  },
  additional_context,
};

process.stdout.write(JSON.stringify(payload));
