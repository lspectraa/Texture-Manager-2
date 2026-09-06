import { CheckCircle2, FolderKey, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAndroidStorageAccess } from "../../hooks/useAndroidStorageAccess";
import type { AppSettingsView } from "../../domain/settings";

type AndroidStorageAccessPanelProps = {
  geometryDashFound: boolean;
  onSettingsUpdated?: (settings: AppSettingsView) => void;
  onAccessStatusChanged?: (granted: boolean) => void;
  className?: string;
  showReadyHint?: boolean;
};

export function AndroidStorageAccessPanel({
  geometryDashFound,
  onSettingsUpdated,
  onAccessStatusChanged,
  className = "",
  showReadyHint = false,
}: AndroidStorageAccessPanelProps) {
  const { t } = useTranslation();
  const {
    storageReady,
    allFilesGranted,
    permissionBlocked,
    statusMessage,
    busy,
    checking,
    refreshDetection,
    requestAccess,
  } = useAndroidStorageAccess({
    enabled: true,
    geometryDashFound,
    onSettingsUpdated,
  });

  useEffect(() => {
    onAccessStatusChanged?.(allFilesGranted);
  }, [allFilesGranted, onAccessStatusChanged]);

  if (storageReady && showReadyHint) {
    return (
      <div
        className={`tm-android-geode-access tm-android-geode-access--ready ${className}`.trim()}
        data-testid="android-storage-access"
        role="status"
      >
        <p className="tm-onboarding-hint">
          <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden />
          {t("onboarding:androidStorage.looksGood")}
        </p>
      </div>
    );
  }

  if (storageReady) {
    return null;
  }

  if (checking && !permissionBlocked) {
    return (
      <div
        className={`tm-android-geode-access tm-android-geode-access--checking ${className}`.trim()}
        data-testid="android-storage-access"
        role="status"
      >
        <p className="tm-onboarding-hint">
          <RefreshCw size={14} className="tm-update-banner-spin" strokeWidth={2.1} aria-hidden />
          {t("errors:packInstaller.geodeCheckingAccess")}
        </p>
      </div>
    );
  }

  if (allFilesGranted) {
    return (
      <div
        className={`tm-android-geode-access tm-android-geode-access--geode-missing ${className}`.trim()}
        data-testid="android-storage-access"
        role="status"
      >
        <p className="tm-onboarding-hint">
          <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden />
          {t("onboarding:androidStorage.permissionGranted")}
        </p>
        <p className="tm-onboarding-warning" role="status">
          {t("errors:packInstaller.geodeRequiredMobile")}
        </p>
        <div className="tm-android-geode-access-actions">
          <button
            type="button"
            className="tm-settings-action-btn"
            disabled={busy}
            onClick={() => {
              void refreshDetection();
            }}
          >
            <RefreshCw size={14} strokeWidth={1.9} />
            {t("onboarding:gd.redetect")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tm-android-geode-access ${className}`.trim()}
      data-testid="android-storage-access"
      role="alert"
    >
      <p className="tm-tool-inline-error">{statusMessage}</p>
      <div className="tm-android-geode-access-actions">
        <button
          type="button"
          className="tm-android-geode-grant-btn"
          disabled={busy}
          data-testid="android-storage-grant-btn"
          onClick={() => {
            void requestAccess();
          }}
        >
          <FolderKey size={16} strokeWidth={2.2} />
          {t("errors:packInstaller.grantAllFilesAccess")}
        </button>
        <button
          type="button"
          className="tm-settings-action-btn"
          disabled={busy}
          onClick={() => {
            void refreshDetection();
          }}
        >
          <RefreshCw size={14} strokeWidth={1.9} />
          {t("onboarding:androidStorage.recheck")}
        </button>
      </div>
      <p className="tm-onboarding-warning" role="status">
        {t("onboarding:androidStorage.skipWarning")}
      </p>
    </div>
  );
}
