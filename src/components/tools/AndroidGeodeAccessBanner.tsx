import { useCallback, useEffect, useRef, useState } from "react";
import { FolderKey } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  androidCheckAllFilesAccess,
  androidRequestAllFilesAccess,
} from "../../services/tauriAndroidStorage";
import { redetectGeometryDashDir } from "../../services/tauriSettings";
import { isMobileShell } from "../../utils/platform";
import type { AppSettingsView } from "../../domain/settings";

type AndroidGeodeAccessBannerProps = {
  geometryDashFound: boolean;
  onSettingsUpdated?: (settings: AppSettingsView) => void;
  className?: string;
};

/**
 * Shown on mobile when Geode paths cannot be resolved — usually because
 * All files access has not been granted, or Geode is not installed on
 * internal storage yet.
 */
export function AndroidGeodeAccessBanner({
  geometryDashFound,
  onSettingsUpdated,
  className = "",
}: AndroidGeodeAccessBannerProps) {
  const { t } = useTranslation();
  const mobileShell = isMobileShell();
  const [allFilesAccess, setAllFilesAccess] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const refreshAccess = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await androidCheckAllFilesAccess();
      setAllFilesAccess(granted);
      return granted;
    } catch {
      setAllFilesAccess(false);
      return false;
    }
  }, []);

  const refreshDetection = useCallback(async (): Promise<void> => {
    setBusy(true);
    setLocalError(null);
    try {
      const granted = await refreshAccess();
      if (!granted) {
        return;
      }
      const settings = await redetectGeometryDashDir();
      onSettingsUpdated?.(settings);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("errors:packInstaller.geodeRequiredMobile"),
      );
    } finally {
      setBusy(false);
    }
  }, [onSettingsUpdated, refreshAccess, t]);

  useEffect(() => {
    if (!mobileShell || geometryDashFound) {
      return;
    }
    // Re-check permission + paths whenever this tool mounts (e.g. after granting
    // access from Pack Installer, then opening Geode Buttons).
    void refreshDetection();
  }, [geometryDashFound, mobileShell, refreshDetection]);

  useEffect(() => {
    if (!mobileShell || geometryDashFound) {
      return;
    }
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void refreshDetection();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [geometryDashFound, mobileShell, refreshDetection]);

  if (!mobileShell || geometryDashFound) {
    return null;
  }

  const permissionBlocked = allFilesAccess === false;
  const resolvedStatus = localError
    ? localError
    : permissionBlocked
      ? t("errors:packInstaller.allFilesAccessRequired")
      : allFilesAccess === true
        ? t("errors:packInstaller.geodeRequiredMobile")
        : null;
  // Hold the last actionable error across brief re-checks instead of flashing "Checking…".
  if (resolvedStatus) {
    lastStatusRef.current = resolvedStatus;
  }
  const statusMessage =
    resolvedStatus ??
    lastStatusRef.current ??
    t("errors:packInstaller.geodeCheckingAccess");

  return (
    <div className={`tm-android-geode-access ${className}`.trim()} role="alert">
      <p className="tm-tool-inline-error">{statusMessage}</p>
      {permissionBlocked ? (
        <div className="tm-android-geode-access-actions">
          <button
            type="button"
            className="tm-android-geode-grant-btn"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setLocalError(null);
                try {
                  await androidRequestAllFilesAccess();
                } catch (err: unknown) {
                  setLocalError(
                    err instanceof Error
                      ? err.message
                      : t("errors:packInstaller.allFilesAccessRequestFailed"),
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <FolderKey size={16} strokeWidth={2.2} />
            {t("errors:packInstaller.grantAllFilesAccess")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
