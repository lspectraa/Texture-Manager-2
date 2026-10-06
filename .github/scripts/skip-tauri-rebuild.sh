#!/usr/bin/env bash
# tauri-apps/tauri-action@v0 (0.6.2) always runs `<tauriScript> build <args>`
# before it uploads, and it has no upload-only input. publish.yml's macOS
# upload step points tauriScript here so the second invocation keeps the
# already verified bundles and still uses the action's release upload and
# latest.json merge.
#
# Arguments from the action (`build`, `--target`, `--bundles`, ...) are ignored.
exit 0
