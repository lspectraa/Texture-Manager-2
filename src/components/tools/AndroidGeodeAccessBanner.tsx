import { FolderKey, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAndroidStorageAccess } from "../../hooks/useAndroidStorageAccess";
import { isMobileShell } from "../../utils/platform";
import type { AppSettingsView } from "../../domain/settings";

type AndroidGeodeAccessBannerProps = {
  geometryDashFound: boolean;
  onSettingsUpdated?: (settings: AppSettingsView) => void;
  className?: string;
};

/**
 * Shown on mobile after onboarding when All files access is missing or Geode
 * media cannot be read.
 */
export function AndroidGeodeAccessBanner({
  geometryDashFound,
  onSettingsUpdated,
  className = "",
}: AndroidGeodeAccessBannerProps) {
  const { t } = useTranslation();
  const mobileShell = isMobileShell();
  const {
    storageReady,
    permissionBlocked,
    statusMessage,
    busy,
    refreshDetection,
    requestAccess,
  } = useAndroidStorageAccess({
    enabled: mobileShell,
    geometryDashFound,
    onSettingsUpdated,
  });

  if (!mobileShell || storageReady) {
    return null;
  }

  const showGrantButton = permissionBlocked;

  return (
    <div
      className={`tm-android-geode-access ${className}`.trim()}
      data-testid="android-storage-banner"
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
      ) : null}
    </div>
  );
}
