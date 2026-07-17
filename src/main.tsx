import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getAppSettings } from "./services/tauriSettings";
import { isTauriRuntime } from "./services/tauriOperations";
import { applyTheme, initTheme, setStoredTheme } from "./utils/theme";

// First paint from localStorage; Tauri settings can refine once loaded.
initTheme();

if (isTauriRuntime()) {
  void getAppSettings()
    .then((settings) => {
      applyTheme(settings.theme);
      setStoredTheme(settings.theme);
    })
    .catch(() => {
      // Keep localStorage / default dark.
    });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
