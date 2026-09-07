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

const payload = {
  env: {
    TM2_AGENT_VAULT: "docs",
    TM2_AGENT_PLAYBOOK: "docs/playbook.md",
  },
};

process.stdout.write(JSON.stringify(payload));
