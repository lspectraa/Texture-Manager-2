---
name: api-probe
description: Call an API endpoint on the fly to test or debug it. Use when a route is new or failing, or when UI tests are the wrong tool for a contract check.
---

# API probe

Hit the real endpoint. Print status, relevant headers, and body. If it fails, read logs, patch, and call again. Do not invent a passing mock. Do not log secrets. Stop processes you started.
