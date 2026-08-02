import { ImageOff, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRef } from "react";
import type {
  InstallUnit,
  InstallUnitKind,
  PackInstallerBridge,
  PackMetadata,
} from "../../domain/packInstaller";
import {
  DEFAULT_PACK_METADATA,
  slugifyPackIdSegment,
} from "../../domain/packInstaller";
import { shortenPathForDisplay } from "../../utils/pathDisplay";
import { ToolTextField } from "./layout";

type PackInstallerMetadataSidebarProps = {
  bridge: PackInstallerBridge;
  onBridgeChange: (next: PackInstallerBridge) => void;
  onBrowsePackPng?: () => void;
  onClearPackPng?: () => void;
  /** Install-mode: persist metadata edits into the selected plan unit. */
  onUpdateSelectedPackMetadata?: (metadata: PackMetadata) => void;
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

export function PackInstallerMetadataSidebar({
  bridge,
  onBridgeChange,
  onBrowsePackPng,
  onClearPackPng,
  onUpdateSelectedPackMetadata,
}: PackInstallerMetadataSidebarProps) {
  const { t } = useTranslation("tools");
  const createIdTouchedRef = useRef(false);
  const installIdTouchedRef = useRef<string | null>(null);

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

        <div className="tm-pack-meta-fields">
          <ToolTextField
            label={t("packInstaller.fieldTextureldr")}
            value={bridge.createMetadata.textureldr}
            onChange={(textureldr) => updateCreateMetadata({ textureldr })}
            placeholder="1.5.0"
          />
          <ToolTextField
            label={t("packInstaller.fieldName")}
            value={bridge.createMetadata.name}
            onChange={(name) => updateCreateMetadata({ name })}
            placeholder={t("packInstaller.namePlaceholder")}
          />
          <ToolTextField
            label={t("packInstaller.fieldId")}
            value={bridge.createMetadata.id}
            onChange={(id) => updateCreateMetadata({ id }, { idManual: true })}
            placeholder="author.pack-id"
          />
          <ToolTextField
            label={t("packInstaller.fieldVersion")}
            value={bridge.createMetadata.version}
            onChange={(version) => updateCreateMetadata({ version })}
            placeholder="1.0.0"
          />
          <ToolTextField
            label={t("packInstaller.fieldAuthor")}
            value={bridge.createMetadata.author}
            onChange={(author) => updateCreateMetadata({ author })}
            placeholder={t("packInstaller.authorPlaceholder")}
          />
        </div>
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

  const meta = unit.metadata ?? {
    ...DEFAULT_PACK_METADATA,
    name: unit.label,
  };

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

      <div className="tm-pack-meta-fields">
        <ToolTextField
          label={t("packInstaller.fieldTextureldr")}
          value={meta.textureldr}
          onChange={(textureldr) => updateInstallMetadata(unit, { textureldr })}
          placeholder="1.5.0"
        />
        <ToolTextField
          label={t("packInstaller.fieldName")}
          value={meta.name}
          onChange={(name) => updateInstallMetadata(unit, { name })}
          placeholder={t("packInstaller.namePlaceholder")}
        />
        <ToolTextField
          label={t("packInstaller.fieldId")}
          value={meta.id}
          onChange={(id) => updateInstallMetadata(unit, { id }, { idManual: true })}
          placeholder="author.pack-id"
        />
        <ToolTextField
          label={t("packInstaller.fieldVersion")}
          value={meta.version}
          onChange={(version) => updateInstallMetadata(unit, { version })}
          placeholder="1.0.0"
        />
        <ToolTextField
          label={t("packInstaller.fieldAuthor")}
          value={meta.author}
          onChange={(author) => updateInstallMetadata(unit, { author })}
          placeholder={t("packInstaller.authorPlaceholder")}
        />
        <p className="tm-pack-meta-path">
          <span className="tm-pack-meta-path-label">{t("packInstaller.destination")}</span>
          <span title={unit.destinationPath}>
            {shortenPathForDisplay(unit.destinationPath)}
          </span>
        </p>
      </div>
    </div>
  );
}
