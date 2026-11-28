import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { getGameFilesLayout } from "../services/tauriGeodeButtons";
import { openPathInOs } from "../services/tauriSettings";
import { redactAbsolutePathsInText } from "../utils/pathDisplay";

export type HomeUtilityKind = "packs" | "game" | "save";

/** Home "Open packs / game files / save folder" shortcuts (desktop only). */
export function useHomeUtilityFolders(): {
  openUtilityFolder: (kind: HomeUtilityKind) => Promise<void>;
  utilityBusy: boolean;
  utilityError: string | null;
} {
  const { t } = useTranslation("navigation");
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [utilityBusy, setUtilityBusy] = useState(false);

  const openUtilityFolder = useCallback(
    async (kind: HomeUtilityKind) => {
      setUtilityError(null);
      setUtilityBusy(true);
      try {
        const layout = await getGameFilesLayout();
        let path = "";
        let failKey = "homeScreen.openSaveFolderFailed";
        switch (kind) {
          case "packs":
            path = layout.textureLoaderPacksDir;
            failKey = "homeScreen.openPacksFolderFailed";
            break;
          case "game":
            path = layout.geometryDashDir;
            failKey = "homeScreen.openGameFilesFailed";
            break;
          case "save":
            path = layout.geometryDashSaveDir;
            failKey = "homeScreen.openSaveFolderFailed";
            break;
          default: {
            const _exhaustive: never = kind;
            return _exhaustive;
          }
        }
        if (!path.trim()) {
          throw new Error(t(failKey));
        }
        await openPathInOs(path);
      } catch (err: unknown) {
        setUtilityError(
          redactAbsolutePathsInText(
            err instanceof Error ? err.message : t("homeScreen.openSaveFolderFailed"),
          ),
        );
      } finally {
        setUtilityBusy(false);
      }
    },
    [t],
  );

  return { openUtilityFolder, utilityBusy, utilityError };
}
