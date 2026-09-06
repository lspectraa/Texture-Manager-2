# Tauri capabilities and plugins

| File | Platforms | Permissions |
| --- | --- | --- |
| `capabilities/default.json` | main | `core:default`, `dialog:default`, opener for GitHub/YouTube/Discord only |
| `capabilities/desktop.json` | macOS/Windows/Linux | `updater:default`, `process:default` |
| `capabilities/mobile.json` | Android | Same as default (no updater/process) |

Plugins in `lib.rs`: dialog + opener always; `process` + `updater` desktop-only; Android storage + APK update modules always registered (no-op stubs off Android).

Config notes: window starts hidden then shown after game-files bootstrap; `assetProtocol` off; Android conf clears `externalBin` and updater artifacts. Details: [[overview]], [[updater]], [[upscaler]].
