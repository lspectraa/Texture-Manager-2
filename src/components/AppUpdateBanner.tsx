import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
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

  return (
    <div className="tm-update-banner" role="status" aria-live="polite">
      <div className="tm-update-banner-main">
        <span className="tm-update-banner-icon" aria-hidden>
          <Download size={16} strokeWidth={2} />
        </span>
        <div className="tm-update-banner-copy">
          <p className="tm-update-banner-title">
            {t("updates.availableTitle", { version: update.version })}
          </p>
          <p className="tm-update-banner-meta">
            {t("updates.availableMeta", {
              current: update.currentVersion,
              version: update.version,
            })}
          </p>
          {update.notes ? (
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
          {busy && percent !== null ? (
            <p className="tm-update-banner-progress">
              {t("updates.downloading", { percent })}
            </p>
          ) : null}
          {busy && percent === null ? (
            <p className="tm-update-banner-progress">{t("updates.installing")}</p>
          ) : null}
        </div>
      </div>
      <div className="tm-update-banner-actions">
        <button
          type="button"
          className="tm-settings-action-btn"
          disabled={busy || operationRunning}
          onClick={() => {
            void handleInstall();
          }}
        >
          <RefreshCw size={14} strokeWidth={1.9} />
          {busy ? t("updates.installing") : t("updates.installAndRestart")}
        </button>
        <button
          type="button"
          className="tm-settings-action-btn"
          disabled={busy}
          onClick={handleDismiss}
          aria-label={t("updates.dismiss")}
        >
          <X size={14} strokeWidth={1.9} />
          {t("updates.later")}
        </button>
      </div>
    </div>
  );
}
