import { ImageOff, Layers, LoaderCircle, Package, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRef, type ReactElement } from "react";
import type {
  AppliedPackEntry,
  InstallUnit,
  InstallUnitKind,
  InstalledPack,
  PackInstallerBridge,
  PackInstallerLibraryRailTab,
  PackMetadata,
} from "../../domain/packInstaller";
import {
  DEFAULT_PACK_METADATA,
  slugifyPackIdSegment,
} from "../../domain/packInstaller";
import { isPackMetadataValid } from "../../domain/packMetadataValidation";
import { shortenPathForDisplay } from "../../utils/pathDisplay";
import { PackAppliedOrderPanel } from "./PackAppliedOrderPanel";
import { ToolTextField } from "./layout";

type PackInstallerMetadataSidebarProps = {
  bridge: PackInstallerBridge;
  onBridgeChange: (next: PackInstallerBridge) => void;
  libraryPacks: InstalledPack[];
  libraryPreviews: Record<string, string | null>;
  onBrowsePackPng?: () => void;
  onClearPackPng?: () => void;
  /** Install-mode: persist metadata edits into the selected plan unit. */
  onUpdateSelectedPackMetadata?: (metadata: PackMetadata) => void;
  /** Library-mode: persist metadata edits into the selected library pack (in memory). */
  onUpdateLibraryPackMetadata?: (metadata: PackMetadata) => void;
  /** Library-mode: write metadata + optional PNG to disk. */
  onSaveLibraryMetadata?: () => void;
  onAddPackToApplied?: (pack: InstalledPack) => void;
  onCommitAppliedEntries?: (entries: AppliedPackEntry[]) => void;
};

function unitKindLabel(
  kind: InstallUnitKind,
  t: (key: string) => string,
): string {
  switch (kind) {
    case "pack":
      return t("packInstaller.kindPack");
    case "configTree":
      return t("packInstaller.kindConfigTree");
    case "mod":
      return t("packInstaller.kindMod");
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function PackPngPreview({
  dataUrl,
  alt,
  missingLabel,
}: {
  dataUrl: string | null;
  alt: string;
  missingLabel: string;
}) {
  return (
    <div className="tm-pack-meta-png">
      {dataUrl ? (
        <img className="tm-pack-meta-png-img" src={dataUrl} alt={alt} />
      ) : (
        <div className="tm-pack-meta-png-empty" aria-hidden>
          <ImageOff size={28} strokeWidth={1.6} />
          <span>{missingLabel}</span>
        </div>
      )}
    </div>
  );
}

function PackPngActions({
  onBrowse,
  onClear,
  canClear,
  browseLabel,
  clearLabel,
  path,
}: {
  onBrowse?: () => void;
  onClear?: () => void;
  canClear: boolean;
  browseLabel: string;
  clearLabel: string;
  path: string | null;
}) {
  return (
    <>
      <div className="tm-pack-meta-png-actions">
        <button type="button" className="tm-tool-path-browse" onClick={onBrowse}>
          {browseLabel}
        </button>
        {canClear ? (
          <button type="button" className="tm-pack-meta-clear-png" onClick={onClear}>
            {clearLabel}
          </button>
        ) : null}
      </div>
      {path ? (
        <p className="tm-pack-meta-path" title={path}>
          {shortenPathForDisplay(path)}
        </p>
      ) : null}
    </>
  );
}

function PackMetadataHint({
  message,
  variant,
}: {
  message: string;
  variant: "invalid" | "info";
}): ReactElement {
  return (
    <p
      className={
        variant === "invalid" ? "tm-pack-meta-invalid-hint" : "tm-pack-meta-info-hint"
      }
      role={variant === "invalid" ? "alert" : undefined}
    >
      {message}
    </p>
  );
}

function MetadataFields({
  meta,
  onPatch,
  t,
}: {
  meta: PackMetadata;
  onPatch: (patch: Partial<PackMetadata>, options?: { idManual?: boolean }) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="tm-pack-meta-fields">
      <ToolTextField
        label={t("packInstaller.fieldTextureldr")}
        value={meta.textureldr}
        onChange={(textureldr) => onPatch({ textureldr })}
        placeholder="1.5.0"
      />
      <ToolTextField
        label={t("packInstaller.fieldName")}
        value={meta.name}
        onChange={(name) => onPatch({ name })}
        placeholder={t("packInstaller.namePlaceholder")}
      />
      <ToolTextField
        label={t("packInstaller.fieldId")}
        value={meta.id}
        onChange={(id) => onPatch({ id }, { idManual: true })}
        placeholder="author.pack-id"
      />
      <ToolTextField
        label={t("packInstaller.fieldVersion")}
        value={meta.version}
        onChange={(version) => onPatch({ version })}
        placeholder="1.0.0"
      />
      <ToolTextField
        label={t("packInstaller.fieldAuthor")}
        value={meta.author}
        onChange={(author) => onPatch({ author })}
        placeholder={t("packInstaller.authorPlaceholder")}
      />
    </div>
  );
}

function NonPackUnitSummary({ unit }: { unit: InstallUnit }) {
  const { t } = useTranslation("tools");
  const kind = unitKindLabel(unit.kind, t);

  switch (unit.kind) {
    case "pack":
      return null;
    case "configTree":
      return (
        <div className="tm-pack-meta-summary">
          <p className="tm-pack-meta-summary-kind">{kind}</p>
          <p>{t("packInstaller.metadataConfigSummary", { label: unit.label })}</p>
          {typeof unit.fileCount === "number" ? (
            <p>{t("packInstaller.files", { count: unit.fileCount })}</p>
          ) : null}
          <p className="tm-pack-meta-path">
            <span className="tm-pack-meta-path-label">{t("packInstaller.destination")}</span>
            <span title={unit.destinationPath}>
              {shortenPathForDisplay(unit.destinationPath)}
            </span>
          </p>
        </div>
      );
    case "mod":
      return (
        <div className="tm-pack-meta-summary">
          <p className="tm-pack-meta-summary-kind">{kind}</p>
          <p>{t("packInstaller.metadataModSummary", { label: unit.label })}</p>
          <p className="tm-pack-meta-path">
            <span className="tm-pack-meta-path-label">{t("packInstaller.destination")}</span>
            <span title={unit.destinationPath}>
              {shortenPathForDisplay(unit.destinationPath)}
            </span>
          </p>
        </div>
      );
    default: {
      const _exhaustive: never = unit.kind;
      return _exhaustive;
    }
  }
}

function libraryDisplayName(pack: InstalledPack): string {
  const name = pack.metadata?.name?.trim();
  return name || pack.folderName;
}

function LibraryRailTabs({
  activeTab,
  onTabChange,
  t,
}: {
  activeTab: PackInstallerLibraryRailTab;
  onTabChange: (tab: PackInstallerLibraryRailTab) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="tm-pack-rail-tabs" role="tablist" aria-label={t("packInstaller.libraryRailTabsLabel")}>
      <button
        type="button"
        role="tab"
        className={`tm-pack-rail-tab${activeTab === "metadata" ? " tm-pack-rail-tab-active" : ""}`}
        aria-selected={activeTab === "metadata"}
        onClick={() => onTabChange("metadata")}
      >
        <Package size={14} strokeWidth={1.85} aria-hidden />
        {t("packInstaller.libraryRailTabMetadata")}
      </button>
      <button
        type="button"
        role="tab"
        className={`tm-pack-rail-tab${activeTab === "applied" ? " tm-pack-rail-tab-active" : ""}`}
        aria-selected={activeTab === "applied"}
        onClick={() => onTabChange("applied")}
      >
        <Layers size={14} strokeWidth={1.85} aria-hidden />
        {t("packInstaller.libraryRailTabApplied")}
      </button>
    </div>
  );
}

export function PackInstallerMetadataSidebar({
  bridge,
  onBridgeChange,
  libraryPacks,
  libraryPreviews,
  onBrowsePackPng,
  onClearPackPng,
  onUpdateSelectedPackMetadata,
  onUpdateLibraryPackMetadata,
  onSaveLibraryMetadata,
  onAddPackToApplied,
  onCommitAppliedEntries,
}: PackInstallerMetadataSidebarProps) {
  const { t } = useTranslation("tools");
  const createIdTouchedRef = useRef(false);
  const installIdTouchedRef = useRef<string | null>(null);
  const libraryIdTouchedRef = useRef<string | null>(null);

  const suggestedId = (meta: PackMetadata): string => {
    const author = slugifyPackIdSegment(meta.author) || "author";
    const pack = slugifyPackIdSegment(meta.name) || "pack";
    return `${author}.${pack}`;
  };

  const updateCreateMetadata = (
    patch: Partial<PackMetadata>,
    options?: { idManual?: boolean },
  ): void => {
    if (options?.idManual) {
      createIdTouchedRef.current = true;
    }
    const next = { ...bridge.createMetadata, ...patch };
    if (
      !createIdTouchedRef.current &&
      !options?.idManual &&
      ("name" in patch || "author" in patch)
    ) {
      next.id = suggestedId(next);
    }
    onBridgeChange({
      ...bridge,
      createMetadata: next,
    });
  };

  const updateInstallMetadata = (
    unit: InstallUnit,
    patch: Partial<PackMetadata>,
    options?: { idManual?: boolean },
  ): void => {
    if (options?.idManual) {
      installIdTouchedRef.current = unit.id;
    }
    const base = unit.metadata ?? {
      ...DEFAULT_PACK_METADATA,
      name: unit.label,
    };
    const next = { ...base, ...patch };
    const idAuto =
      installIdTouchedRef.current !== unit.id &&
      !options?.idManual &&
      ("name" in patch || "author" in patch);
    if (idAuto) {
      next.id = suggestedId(next);
    }
    onUpdateSelectedPackMetadata?.(next);
  };

  const updateLibraryMetadata = (
    pack: InstalledPack,
    patch: Partial<PackMetadata>,
    options?: { idManual?: boolean },
  ): void => {
    if (options?.idManual) {
      libraryIdTouchedRef.current = pack.id;
    }
    const base = pack.metadata ?? {
      ...DEFAULT_PACK_METADATA,
      name: pack.folderName,
    };
    const next = { ...base, ...patch };
    const idAuto =
      libraryIdTouchedRef.current !== pack.id &&
      !options?.idManual &&
      ("name" in patch || "author" in patch);
    if (idAuto) {
      next.id = suggestedId(next);
    }
    onUpdateLibraryPackMetadata?.(next);
  };

  if (bridge.mode === "create") {
    return (
      <div className="tm-pack-meta">
        <header className="tm-pack-meta-head">
          <span className="tm-pack-meta-head-icon" aria-hidden>
            <Package size={16} strokeWidth={1.85} />
          </span>
          <div>
            <h3 className="tm-pack-meta-title">{t("packInstaller.metadataTitle")}</h3>
            <p className="tm-pack-meta-subtitle">{t("packInstaller.metadataCreateHint")}</p>
          </div>
        </header>

        <PackPngPreview
          dataUrl={bridge.packPngDataUrl}
          alt={t("packInstaller.packPngAlt")}
          missingLabel={t("packInstaller.packPngMissing")}
        />

        <PackPngActions
          onBrowse={onBrowsePackPng}
          onClear={onClearPackPng}
          canClear={Boolean(bridge.createPackPngPath)}
          browseLabel={t("packInstaller.browsePackPng")}
          clearLabel={t("packInstaller.clearPackPng")}
          path={bridge.createPackPngPath}
        />

        <MetadataFields meta={bridge.createMetadata} onPatch={updateCreateMetadata} t={t} />
        {!isPackMetadataValid(bridge.createMetadata) ? (
          <PackMetadataHint
            variant="invalid"
            message={t("packInstaller.metadataInvalidHint")}
          />
        ) : null}
      </div>
    );
  }

  if (bridge.mode === "library") {
    const metadataContent =
      bridge.libraryRailTab === "metadata" ? (
        bridge.libraryPack ? (
          (() => {
            const pack = bridge.libraryPack;
            const hasPackJson = Boolean(pack.metadata);
            const metadataValid = pack.metadata
              ? isPackMetadataValid(pack.metadata)
              : false;
            const pngPath = bridge.libraryPackPngDirty
              ? (bridge.libraryPackPngPath ?? null)
              : (pack.packPngPath ?? null);

            return (
              <>
                <header className="tm-pack-meta-head">
                  <span className="tm-pack-meta-head-icon" aria-hidden>
                    <Package size={16} strokeWidth={1.85} />
                  </span>
                  <div>
                    <h3 className="tm-pack-meta-title">{libraryDisplayName(pack)}</h3>
                    <p className="tm-pack-meta-subtitle">{t("packInstaller.metadataLibraryHint")}</p>
                  </div>
                </header>

                {!hasPackJson ? (
                  <PackMetadataHint
                    variant="info"
                    message={t("packInstaller.metadataNoPackJsonLibraryHint")}
                  />
                ) : null}

                <PackPngPreview
                  dataUrl={bridge.packPngDataUrl}
                  alt={t("packInstaller.packPngAlt")}
                  missingLabel={t("packInstaller.packPngMissing")}
                />

                {hasPackJson ? (
                  <>
                    <PackPngActions
                      onBrowse={onBrowsePackPng}
                      onClear={onClearPackPng}
                      canClear={Boolean(pngPath) || Boolean(bridge.packPngDataUrl)}
                      browseLabel={t("packInstaller.browsePackPng")}
                      clearLabel={t("packInstaller.clearPackPng")}
                      path={pngPath}
                    />

                    <MetadataFields
                      meta={pack.metadata ?? DEFAULT_PACK_METADATA}
                      onPatch={(patch, options) => updateLibraryMetadata(pack, patch, options)}
                      t={t}
                    />

                    {!metadataValid ? (
                      <PackMetadataHint
                        variant="invalid"
                        message={t("packInstaller.metadataInvalidHint")}
                      />
                    ) : null}
                  </>
                ) : null}

                <p className="tm-pack-meta-path">
                  <span className="tm-pack-meta-path-label">{t("packInstaller.destination")}</span>
                  <span title={pack.path}>{shortenPathForDisplay(pack.path)}</span>
                </p>

                {hasPackJson ? (
                  <button
                    type="button"
                    className="tm-tool-run-btn tm-pack-meta-save-btn"
                    onClick={() => onSaveLibraryMetadata?.()}
                    disabled={
                      bridge.librarySaving || !onSaveLibraryMetadata || !metadataValid
                    }
                  >
                  {bridge.librarySaving ? (
                    <LoaderCircle size={15} className="tm-pack-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {bridge.librarySaving
                    ? t("packInstaller.librarySavingMetadata")
                    : t("packInstaller.librarySaveMetadata")}
                  </button>
                ) : null}
              </>
            );
          })()
        ) : (
          <div className="tm-pack-meta tm-pack-meta-empty">
            <span className="tm-pack-meta-empty-icon" aria-hidden>
              <Package size={22} strokeWidth={1.75} />
            </span>
            <p className="tm-pack-meta-empty-title">{t("packInstaller.metadataEmptyTitle")}</p>
            <p className="tm-pack-meta-empty-hint">
              {t("packInstaller.metadataLibraryEmptyHint")}
            </p>
          </div>
        )
      ) : null;

    return (
      <div className="tm-pack-meta tm-pack-meta-library-rail">
        <LibraryRailTabs
          activeTab={bridge.libraryRailTab}
          onTabChange={(tab) => onBridgeChange({ ...bridge, libraryRailTab: tab })}
          t={t}
        />
        <div
          className={bridge.libraryRailTab === "applied" ? undefined : "tm-pack-applied-sr"}
          aria-hidden={bridge.libraryRailTab !== "applied"}
        >
          <PackAppliedOrderPanel
            bridge={bridge}
            libraryPacks={libraryPacks}
            libraryPreviews={libraryPreviews}
            onAppliedEntriesChange={(entries) => onCommitAppliedEntries?.(entries)}
            onAddPack={(pack) => onAddPackToApplied?.(pack)}
          />
        </div>
        {metadataContent}
      </div>
    );
  }

  const unit = bridge.selectedUnit;
  if (!unit) {
    return (
      <div className="tm-pack-meta tm-pack-meta-empty">
        <span className="tm-pack-meta-empty-icon" aria-hidden>
          <Package size={22} strokeWidth={1.75} />
        </span>
        <p className="tm-pack-meta-empty-title">{t("packInstaller.metadataEmptyTitle")}</p>
        <p className="tm-pack-meta-empty-hint">{t("packInstaller.metadataEmptyHint")}</p>
      </div>
    );
  }

  if (unit.kind !== "pack") {
    return (
      <div className="tm-pack-meta">
        <header className="tm-pack-meta-head">
          <span className="tm-pack-meta-head-icon" aria-hidden>
            <Package size={16} strokeWidth={1.85} />
          </span>
          <div>
            <h3 className="tm-pack-meta-title">{unit.label}</h3>
            <p className="tm-pack-meta-subtitle">{unitKindLabel(unit.kind, t)}</p>
          </div>
        </header>
        <NonPackUnitSummary unit={unit} />
      </div>
    );
  }

  const meta = unit.metadata;
  const metadataValid = meta ? isPackMetadataValid(meta) : false;

  return (
    <div className="tm-pack-meta">
      <header className="tm-pack-meta-head">
        <span className="tm-pack-meta-head-icon" aria-hidden>
          <Package size={16} strokeWidth={1.85} />
        </span>
        <div>
          <h3 className="tm-pack-meta-title">{unit.label}</h3>
          <p className="tm-pack-meta-subtitle">{t("packInstaller.metadataInstallHint")}</p>
        </div>
      </header>

      {!meta ? (
        <PackMetadataHint
          variant="info"
          message={t("packInstaller.metadataNoPackJsonInstallHint")}
        />
      ) : null}

      <PackPngPreview
        dataUrl={bridge.packPngDataUrl}
        alt={t("packInstaller.packPngAlt")}
        missingLabel={t("packInstaller.packPngMissing")}
      />

      <PackPngActions
        onBrowse={onBrowsePackPng}
        onClear={onClearPackPng}
        canClear={Boolean(unit.packPngPath) || Boolean(bridge.packPngDataUrl)}
        browseLabel={t("packInstaller.browsePackPng")}
        clearLabel={t("packInstaller.clearPackPng")}
        path={unit.packPngPath ?? null}
      />

      {meta ? (
        <>
          <MetadataFields
            meta={meta}
            onPatch={(patch, options) => updateInstallMetadata(unit, patch, options)}
            t={t}
          />
          {!metadataValid ? (
            <PackMetadataHint
              variant="invalid"
              message={t("packInstaller.metadataInvalidHint")}
            />
          ) : null}
        </>
      ) : null}

      <p className="tm-pack-meta-path">
        <span className="tm-pack-meta-path-label">{t("packInstaller.destination")}</span>
        <span title={unit.destinationPath}>
          {shortenPathForDisplay(unit.destinationPath)}
        </span>
      </p>
    </div>
  );
}
