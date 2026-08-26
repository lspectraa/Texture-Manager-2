import { FolderKey } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAndroidStorageAccess } from "../../hooks/useAndroidStorageAccess";
import type { AppSettingsView } from "../../domain/settings";

type AndroidStorageAccessPanelProps = {
  geometryDashFound: boolean;
  onSettingsUpdated?: (settings: AppSettingsView) => void;
  className?: string;
  showReadyHint?: boolean;
};

export function AndroidStorageAccessPanel({
  geometryDashFound,
  onSettingsUpdated,
  className = "",
  showReadyHint = false,
}: AndroidStorageAccessPanelProps) {
  const { t } = useTranslation();
  const {
    storageReady,
    permissionBlocked,
    statusMessage,
    busy,
    requestAccess,
  } = useAndroidStorageAccess({
    enabled: true,
    geometryDashFound,
    onSettingsUpdated,
  });

  if (storageReady && showReadyHint) {
    return (
      <div
        className={`tm-android-geode-access tm-android-geode-access--ready ${className}`.trim()}
        data-testid="android-storage-access"
        role="status"
      >
        <p className="tm-onboarding-hint">{t("onboarding:androidStorage.looksGood")}</p>
      </div>
    );
  }

  if (storageReady) {
    return null;
  }

  const showGrantButton = permissionBlocked;

  return (
    <div
      className={`tm-android-geode-access ${className}`.trim()}
      data-testid="android-storage-access"
      role="alert"
    >
      <p className="tm-tool-inline-error">{statusMessage}</p>
      {showGrantButton ? (
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
        </div>
      ) : null}
      {!storageReady && !permissionBlocked ? (
        <p className="tm-onboarding-warning" role="status">
          {t("onboarding:androidStorage.skipWarning")}
        </p>
      ) : null}
    </div>
  );
}
