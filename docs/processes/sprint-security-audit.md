# Sprint security audit

Run once per sprint. Findings are advice. The human decides what to fix.

Audit the repo against the list below. Group findings as high, medium, low, info. For each finding give path, why it matters, and a suggested fix. Do not apply fixes unless the human names the finding and says to fix that one. Do not open a pull request. If a class of issue should be remembered, append [[lessons-learned]].

Look for secrets or credentials in source, tests, fixtures, or docs; hardcoded URLs or keys; missing authz on new endpoints; known-bad dependency patterns in lockfiles; logs that might capture tokens, passwords, or PII; dangerous defaults (open CORS, debug left on, verbose prod errors); untrusted input concatenated into queries, templates, or file paths.
