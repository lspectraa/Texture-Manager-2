import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  androidGetStorageStatus,
  androidRequestAllFilesAccess,
  type AndroidStorageStatus,
} from "../services/tauriAndroidStorage";
import { redetectGeometryDashDir } from "../services/tauriSettings";
import type { AppSettingsView } from "../domain/settings";

type UseAndroidStorageAccessOptions = {
  enabled: boolean;
  geometryDashFound: boolean;
  onSettingsUpdated?: (settings: AppSettingsView) => void;
};

export function useAndroidStorageAccess({
  enabled,
  geometryDashFound,
  onSettingsUpdated,
}: UseAndroidStorageAccessOptions) {
  const { t } = useTranslation();
  const [storageStatus, setStorageStatus] = useState<AndroidStorageStatus | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const refreshAccess = useCallback(async (): Promise<AndroidStorageStatus> => {
    try {
      const status = await androidGetStorageStatus();
      setStorageStatus(status);
      return status;
    } catch {
      const fallback: AndroidStorageStatus = {
        allFilesGranted: false,
        geodeReadable: false,
        geodePath: null,
      };
      setStorageStatus(fallback);
      return fallback;
    }
  }, []);

  const refreshDetection = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const status = await refreshAccess();
      if (!status.allFilesGranted) {
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
  }, [enabled, onSettingsUpdated, refreshAccess, t]);

  const requestAccess = useCallback(async (): Promise<void> => {
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
  }, [t]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshDetection();
  }, [enabled, refreshDetection]);

  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, refreshDetection]);

  const storageReady =
    storageStatus?.allFilesGranted === true &&
    storageStatus?.geodeReadable === true &&
    geometryDashFound;

  const permissionBlocked = storageStatus?.allFilesGranted === false;
  const geodeMissing =
    storageStatus?.allFilesGranted === true &&
    !storageStatus.geodeReadable &&
    !geometryDashFound;

  const resolvedStatus = localError
    ? localError
    : permissionBlocked
      ? t("errors:packInstaller.allFilesAccessRequired")
      : geodeMissing
        ? t("errors:packInstaller.geodeRequiredMobile")
        : storageStatus === null
          ? t("errors:packInstaller.geodeCheckingAccess")
          : !geometryDashFound
            ? t("errors:packInstaller.geodeRequiredMobile")
            : t("errors:packInstaller.allFilesAccessRequired");

  if (resolvedStatus) {
    lastStatusRef.current = resolvedStatus;
  }

  const statusMessage =
    resolvedStatus ??
    lastStatusRef.current ??
    t("errors:packInstaller.geodeCheckingAccess");

  return {
    storageStatus,
    storageReady,
    permissionBlocked,
    geodeMissing,
    statusMessage,
    busy,
    refreshDetection,
    requestAccess,
  };
}
