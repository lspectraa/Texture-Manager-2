# Verify changes

Do not claim UI or runtime work done from reading code alone. Prefer the running app.

## What to run

| Change | Verify with |
| --- | --- |
| Frontend logic with existing Vitest | `npm test` |
| Type / build break risk | `npm run build` |
| Rust core | `cargo test` in `src-tauri/` |
| Desktop UI / Tauri commands | `npm run tauri dev`, then exercise the tool path |
| Mobile shell layout only | `npm run dev` + `?shell=mobile` (no Tauri invokes) |
| Android device path | `npm run android:dev` when SDK/emulator available |

## Workspace browser tooling

This project’s Cursor rules prefer **IronBee DevTools** (browser + node MCP) for driving a real browser when those servers are enabled. Backend IronBee is off here.

- Frontend-only shell: Vite at `http://localhost:1420`.
- Full tool runs need the Tauri window (`npm run tauri dev`) — browser-only cannot invoke Rust commands.
- Docs-only or CI-config-only changes need no app verification.

## Pass criteria

Exercise the changed path (click/fill/run, not only open the screen). Check console/errors for unexpected failures. Match [[definition-of-done]]. Always shut down any dev servers, background processes, or app runs started during verification before claiming done.
