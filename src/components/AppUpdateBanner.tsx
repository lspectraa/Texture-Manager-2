import { useState } from "react";
import { ArrowDownToLine, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  dismissPendingUpdate,
  downloadAndInstallPendingUpdate,
  relaunchAppAfterUpdate,
  type AvailableAppUpdate,
  type UpdateDownloadProgress,
} from "../services/tauriUpdater";

type AppUpdateBannerProps = {
  update: AvailableAppUpdate;
  operationRunning: boolean;
  onDismiss: () => void;
};

function shouldShowReleaseNotes(notes: string | null): boolean {
  if (!notes?.trim()) {
    return false;
  }
  const normalized = notes.trim().toLowerCase();
  // Hide the default CI draft body — it is not useful release notes.
  if (normalized.includes("draft windows msi release created by ci")) {
    return false;
  }
  if (normalized.includes("review assets, then publish when ready")) {
    return false;
  }
  return true;
}

export function AppUpdateBanner({
  update,
  operationRunning,
  onDismiss,
}: AppUpdateBannerProps) {
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);

  const handleInstall = async (): Promise<void> => {
    if (operationRunning || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await downloadAndInstallPendingUpdate((next) => {
        setProgress(next);
      });
      await relaunchAppAfterUpdate();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDismiss = (): void => {
    dismissPendingUpdate();
    onDismiss();
  };

  const percent =
    progress && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;
  const showNotes = shouldShowReleaseNotes(update.notes);

  return (
    <div className="tm-update-banner" role="status" aria-live="polite">
      <div className="tm-update-banner-glow" aria-hidden />
      <div className="tm-update-banner-body">
        <div className="tm-update-banner-main">
          <span className="tm-update-banner-icon" aria-hidden>
            <ArrowDownToLine size={18} strokeWidth={2.2} />
          </span>
          <div className="tm-update-banner-copy">
            <div className="tm-update-banner-headline">
              <p className="tm-update-banner-title">
                {t("updates.availableTitle", { version: update.version })}
              </p>
              <span className="tm-update-banner-version-pill">
                v{update.currentVersion}
                <span className="tm-update-banner-version-arrow" aria-hidden>
                  →
                </span>
                v{update.version}
              </span>
            </div>
            <p className="tm-update-banner-meta">
              {t("updates.availableMeta", {
                current: update.currentVersion,
                version: update.version,
              })}
            </p>
            {showNotes ? (
              <p className="tm-update-banner-notes">{update.notes}</p>
            ) : null}
            {operationRunning ? (
              <p className="tm-update-banner-warning">
                {t("updates.waitForOperation")}
              </p>
            ) : null}
            {error ? (
              <p className="tm-update-banner-error" role="alert">
                {error}
              </p>
            ) : null}
            {busy ? (
              <div className="tm-update-banner-progress-block">
                <p className="tm-update-banner-progress">
                  {percent !== null
                    ? t("updates.downloading", { percent })
                    : t("updates.installing")}
                </p>
                <div
                  className="tm-update-banner-progress-track"
                  aria-hidden={percent === null}
                >
                  <div
                    className={`tm-update-banner-progress-fill${
                      percent === null ? " tm-update-banner-progress-fill--indeterminate" : ""
                    }`}
                    style={percent !== null ? { width: `${percent}%` } : undefined}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tm-update-banner-actions">
          <button
            type="button"
            className="tm-update-banner-install"
            disabled={busy || operationRunning}
            onClick={() => {
              void handleInstall();
            }}
          >
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={busy ? "tm-update-banner-spin" : undefined}
            />
            {busy ? t("updates.installing") : t("updates.installAndRestart")}
          </button>
          <button
            type="button"
            className="tm-update-banner-later"
            disabled={busy}
            onClick={handleDismiss}
            aria-label={t("updates.dismiss")}
          >
            <X size={14} strokeWidth={2} />
            {t("updates.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
