import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Palette, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  includesForRuleSet,
  isRuleSetId,
  MENU_RECOLOR_RULE_SETS,
  normalizeOverride,
  normalizeRecipe,
  recipeFileFromOptions,
  type DiscoveredSprite,
  type MenuRecolorOptions,
  type MenuRecolorRuleSetId,
  type SpriteOverride,
} from "../../domain/menuRecolor";
import { identityRecipe, type BandId, type ColorRecipe } from "../../domain/menuRecolorColor";
import { finalizeUserSave, pickUserFile, pickUserSaveFile } from "../../services/tauriPicker";
import {
  discoverMenuRecolorSprites,
  loadMenuRecolorThumbs,
  readMenuRecolorRecipe,
  writeMenuRecolorRecipe,
} from "../../services/tauriMenuRecolor";
import { isTauriRuntime } from "../../services/tauriOperations";
import { useRangeDoubleReset } from "../../hooks/useRangeDoubleReset";
import { PickFolderFn } from "./types";
import {
  ToolCheckboxField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolSelectField,
  ToolTextField,
} from "./layout";
import { MenuRecolorGrid } from "./menuRecolor/MenuRecolorGrid";
import { MenuRecolorBandSliders } from "./menuRecolor/MenuRecolorSliders";

type MenuRecolorToolPanelProps = {
  inputDir: string;
  outputDir: string;
  options: MenuRecolorOptions;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onOptionsChange: (next: MenuRecolorOptions) => void;
  pickFolder: PickFolderFn;
};

export function MenuRecolorToolPanel({
  inputDir,
  outputDir,
  options,
  onInputDirChange,
  onOutputDirChange,
  onOptionsChange,
  pickFolder,
}: MenuRecolorToolPanelProps) {
  const { t } = useTranslation("tools");
  const [sprites, setSprites] = useState<DiscoveredSprite[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [draftMode, setDraftMode] = useState<SpriteOverride["mode"]>("custom");
  const [draftStrength, setDraftStrength] = useState(1);
  const [draftRecipe, setDraftRecipe] = useState<ColorRecipe>(identityRecipe());
  const [recipeMessage, setRecipeMessage] = useState<string | null>(null);
  const anchorRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  const pendingThumbs = useRef(new Set<string>());
  const thumbTimer = useRef<number | null>(null);

  useEffect(() => {
    const trimmed = inputDir.trim();
    setSprites([]);
    setThumbs({});
    setSelectedIds([]);
    pendingThumbs.current.clear();
    if (!trimmed) {
      setDiscoverError(null);
      return;
    }
    if (!isTauriRuntime()) {
      setDiscoverError(t("menuRecolor.discoverFailed"));
      return;
    }
    let cancelled = false;
    setDiscoverError(null);
    discoverMenuRecolorSprites(trimmed)
      .then((list) => {
        if (cancelled) {
          return;
        }
        setSprites(list);
        const current = optionsRef.current;
        onOptionsChange({
          ...current,
          includes: includesForRuleSet(list, current.ruleSet),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoverError(t("menuRecolor.discoverFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inputDir, onOptionsChange, t]);

  const flushThumbs = useCallback(async () => {
    const dir = inputDir.trim();
    if (!dir) {
      return;
    }
    const ids = [...pendingThumbs.current].filter((id) => !thumbsRef.current[id]).slice(0, 64);
    if (ids.length === 0) {
      return;
    }
    for (const id of ids) {
      pendingThumbs.current.delete(id);
    }
    try {
      const loaded = await loadMenuRecolorThumbs(dir, ids);
      setThumbs((current) => {
        const next = { ...current };
        for (const thumb of loaded) {
          next[thumb.id] = thumb.dataUrl;
        }
        return next;
      });
    } catch {
      // Visible tiles stay blank until the next scroll asks again.
    }
  }, [inputDir]);

  const onNeedThumbs = useCallback(
    (ids: string[]) => {
      let added = false;
      for (const id of ids) {
        if (!thumbsRef.current[id] && !pendingThumbs.current.has(id)) {
          pendingThumbs.current.add(id);
          added = true;
        }
      }
      if (!added) {
        return;
      }
      if (thumbTimer.current !== null) {
        window.clearTimeout(thumbTimer.current);
      }
      thumbTimer.current = window.setTimeout(() => {
        thumbTimer.current = null;
        void flushThumbs();
      }, 40);
    },
    [flushThumbs],
  );

  const sheetStems = useMemo(() => {
    const stems = new Set<string>();
    for (const sprite of sprites) {
      if (sprite.sheetStem) {
        stems.add(sprite.sheetStem);
      }
    }
    return [...stems].sort();
  }, [sprites]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sprites.filter((sprite) => {
      if (query && !sprite.name.toLowerCase().includes(query)) {
        return false;
      }
      if (sheetFilter && sprite.sheetStem !== sheetFilter) {
        return false;
      }
      if (includedOnly && !options.includes[sprite.id]) {
        return false;
      }
      return true;
    });
  }, [includedOnly, options.includes, search, sheetFilter, sprites]);

  const counts = useMemo(() => {
    let included = 0;
    for (const sprite of sprites) {
      if (options.includes[sprite.id]) {
        included += 1;
      }
    }
    return { total: sprites.length, included, excluded: sprites.length - included };
  }, [options.includes, sprites]);

  const onRuleSet = (value: string) => {
    if (!isRuleSetId(value)) {
      return;
    }
    onOptionsChange({
      ...options,
      ruleSet: value,
      includes: includesForRuleSet(sprites, value),
    });
  };

  const onGlobalRecipe = (recipe: ColorRecipe) => {
    onOptionsChange({ ...options, recipe });
  };

  const commitOverride = (override: SpriteOverride, ids: readonly string[]) => {
    const overrides = { ...options.overrides };
    const normalized = normalizeOverride(override);
    for (const id of ids) {
      if (normalized.mode === "inherit") {
        delete overrides[id];
      } else {
        overrides[id] = normalized;
      }
    }
    onOptionsChange({ ...options, overrides });
  };

  const buildDraftOverride = (mode: SpriteOverride["mode"]): SpriteOverride => {
    switch (mode) {
      case "inherit":
        return { mode: "inherit" };
      case "off":
        return { mode: "off" };
      case "strength":
        return { mode: "strength", amount: draftStrength };
      case "custom":
        return { mode: "custom", recipe: draftRecipe };
      default: {
        const neverMode: never = mode;
        return neverMode;
      }
    }
  };

  const onSelect = (
    id: string,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    const order = filtered.map((sprite) => sprite.id);
    if (event.shiftKey && anchorRef.current) {
      const start = order.indexOf(anchorRef.current);
      const end = order.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelectedIds(order.slice(from, to + 1));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
      anchorRef.current = id;
      return;
    }
    setSelectedIds([id]);
    anchorRef.current = id;
  };

  useEffect(() => {
    if (selectedIds.length < 2) {
      return;
    }
    setDraftMode("custom");
    setDraftStrength(1);
    setDraftRecipe(optionsRef.current.recipe);
  }, [selectedIds]);

  useEffect(() => {
    if (selectedIds.length !== 1) {
      return;
    }
    const override = options.overrides[selectedIds[0]];
    if (!override || override.mode === "inherit") {
      setDraftMode("inherit");
      setDraftRecipe(options.recipe);
      return;
    }
    if (override.mode === "off") {
      setDraftMode("off");
      return;
    }
    if (override.mode === "strength") {
      setDraftMode("strength");
      setDraftStrength(override.amount);
      setDraftRecipe(options.recipe);
      return;
    }
    setDraftMode("custom");
    setDraftRecipe(override.recipe);
  }, [options.overrides, options.recipe, selectedIds]);

  const onOverrideRecipe = (recipe: ColorRecipe) => {
    setDraftRecipe(recipe);
    setDraftMode("custom");
    if (selectedIds.length === 1) {
      commitOverride({ mode: "custom", recipe }, selectedIds);
    }
  };

  const onMode = (mode: SpriteOverride["mode"]) => {
    setDraftMode(mode);
    if (selectedIds.length === 1) {
      commitOverride(buildDraftOverride(mode), selectedIds);
    }
  };

  const bandLabel = (band: BandId) => t(`menuRecolor.band${bandLabelKey(band)}`);

  const saveRecipe = async () => {
    const picked = await pickUserSaveFile({
      title: t("menuRecolor.saveRecipeDialog"),
      defaultName: "menu-recolor.json",
      extensions: ["json"],
      filterName: t("menuRecolor.recipeFilter"),
    });
    if (!picked) {
      return;
    }
    try {
      await writeMenuRecolorRecipe(picked.path, recipeFileFromOptions(options));
      if (picked.needsCommit) {
        await finalizeUserSave(picked.path);
      }
      setRecipeMessage(null);
    } catch (error) {
      setRecipeMessage(error instanceof Error ? error.message : t("menuRecolor.recipeFailed"));
    }
  };

  const loadRecipe = async () => {
    const path = await pickUserFile({
      title: t("menuRecolor.loadRecipeDialog"),
      extensions: ["json"],
      filterName: t("menuRecolor.recipeFilter"),
    });
    if (!path) {
      return;
    }
    try {
      const file = await readMenuRecolorRecipe(path);
      const ruleSet: MenuRecolorRuleSetId = isRuleSetId(file.ruleSetId) ? file.ruleSetId : "menuChrome";
      const overrides: Record<string, SpriteOverride> = {};
      for (const [id, override] of Object.entries(file.overrides ?? {})) {
        overrides[id] = normalizeOverride(override);
      }
      onOptionsChange({
        ruleSet,
        recipe: normalizeRecipe(file.recipe),
        overrides,
        includes: includesForRuleSet(sprites, ruleSet),
      });
      setRecipeMessage(null);
    } catch {
      setRecipeMessage(t("menuRecolor.recipeFailed"));
    }
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const strengthReset = useRangeDoubleReset(() => {
    setDraftStrength(1);
    if (selectedIds.length === 1 && draftMode === "strength") {
      commitOverride({ mode: "strength", amount: 1 }, selectedIds);
    }
  });

  return (
    <ToolPage accent="cyan" wide>
      <ToolPageHeader toolId="menuRecolor" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
        outputToolId="menuRecolor"
      />
      <ToolSection
        title={t("menuRecolor.settings")}
        subtitle={t("menuRecolor.settingsDescription")}
        icon={Palette}
      >
        <ToolSelectField
          label={t("menuRecolor.ruleSet")}
          hint={t("menuRecolor.ruleSetHint")}
          value={options.ruleSet}
          options={MENU_RECOLOR_RULE_SETS.map((id) => ({
            value: id,
            label: ruleSetLabel(t, id),
          }))}
          onChange={onRuleSet}
        />
        <div className="tm-menu-recolor-locks">
          <span>{t("menuRecolor.locks")}</span>
          <ToolCheckboxField
            label={t("menuRecolor.neutralLock")}
            checked={options.recipe.locks.neutral}
            onChange={(neutral) =>
              onGlobalRecipe({
                ...options.recipe,
                points: [],
                locks: { ...options.recipe.locks, neutral },
              })
            }
          />
          <ToolCheckboxField
            label={t("menuRecolor.goldLock")}
            checked={options.recipe.locks.gold}
            onChange={(gold) =>
              onGlobalRecipe({
                ...options.recipe,
                points: [],
                locks: { ...options.recipe.locks, gold },
              })
            }
          />
        </div>
        <div className="tm-menu-recolor-recipe-actions">
          <button type="button" className="tm-menu-recolor-text-btn" onClick={() => void saveRecipe()}>
            {t("menuRecolor.saveRecipe")}
          </button>
          <button type="button" className="tm-menu-recolor-text-btn" onClick={() => void loadRecipe()}>
            {t("menuRecolor.loadRecipe")}
          </button>
          {recipeMessage ? <span className="tm-tool-section-note">{recipeMessage}</span> : null}
        </div>
        <MenuRecolorBandSliders
          recipe={options.recipe}
          onChange={onGlobalRecipe}
          labelForBand={bandLabel}
          hueLabel={t("menuRecolor.hue")}
          satLabel={t("menuRecolor.saturation")}
          valLabel={t("menuRecolor.value")}
        />
      </ToolSection>
      <ToolSection
        title={t("menuRecolor.grid")}
        subtitle={t("menuRecolor.gridDescription")}
        icon={SlidersHorizontal}
      >
        <div className="tm-menu-recolor-filters">
          <ToolTextField
            label={t("menuRecolor.search")}
            value={search}
            placeholder={t("menuRecolor.searchPlaceholder")}
            onChange={setSearch}
          />
          <ToolSelectField
            label={t("menuRecolor.sheetFilter")}
            value={sheetFilter}
            options={[
              { value: "", label: t("menuRecolor.allSheets") },
              ...sheetStems.map((stem) => ({ value: stem, label: stem })),
            ]}
            onChange={setSheetFilter}
          />
          <ToolCheckboxField
            label={t("menuRecolor.includedOnly")}
            checked={includedOnly}
            onChange={setIncludedOnly}
          />
        </div>
        <div className="tm-menu-recolor-chips">
          <span>{t("menuRecolor.countTotal", { count: counts.total })}</span>
          <span>{t("menuRecolor.countIncluded", { count: counts.included })}</span>
          <span>{t("menuRecolor.countExcluded", { count: counts.excluded })}</span>
        </div>
        {discoverError ? <p className="tm-tool-section-note">{discoverError}</p> : null}
        {!inputDir.trim() ? <p className="tm-tool-section-note">{t("menuRecolor.discoverEmpty")}</p> : null}
        {inputDir.trim() && !discoverError && sprites.length === 0 ? (
          <p className="tm-tool-section-note">{t("menuRecolor.discoverNone")}</p>
        ) : null}
        <MenuRecolorGrid
          key={inputDir}
          sprites={filtered}
          thumbs={thumbs}
          includes={options.includes}
          overrides={options.overrides}
          globalRecipe={options.recipe}
          selectedIds={selectedSet}
          onToggleInclude={(id, included) =>
            onOptionsChange({
              ...options,
              includes: { ...options.includes, [id]: included },
            })
          }
          onSelect={onSelect}
          onNeedThumbs={onNeedThumbs}
          includeLabel={t("menuRecolor.include")}
          badgeLabel={(override) => overrideBadge(t, override)}
        />
      </ToolSection>
      <ToolSection
        title={t("menuRecolor.selection")}
        subtitle={
          selectedIds.length > 1
            ? t("menuRecolor.selectionMany", { count: selectedIds.length })
            : t("menuRecolor.selectionDescription")
        }
        icon={SlidersHorizontal}
      >
        {selectedIds.length === 0 ? (
          <p className="tm-tool-section-note">{t("menuRecolor.noSelection")}</p>
        ) : (
          <>
            <div className="tm-menu-recolor-modes">
              {(["inherit", "off", "strength", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`tm-menu-recolor-text-btn${draftMode === mode ? " is-active" : ""}`}
                  onClick={() => onMode(mode)}
                >
                  {overrideBadge(t, mode === "inherit" ? undefined : buildDraftOverride(mode))}
                </button>
              ))}
              {selectedIds.length > 1 ? (
                <button
                  type="button"
                  className="tm-menu-recolor-text-btn is-active"
                  onClick={() => commitOverride(buildDraftOverride(draftMode), selectedIds)}
                >
                  {t("menuRecolor.applyToSelection")}
                </button>
              ) : null}
            </div>
            {draftMode === "strength" ? (
              <label className="tm-menu-recolor-channel">
                <span>
                  {t("menuRecolor.strength")} <strong>{draftStrength.toFixed(2)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={draftStrength}
                  onChange={(event) => {
                    const amount = Number(event.target.value);
                    setDraftStrength(amount);
                    if (selectedIds.length === 1) {
                      commitOverride({ mode: "strength", amount }, selectedIds);
                    }
                  }}
                  {...strengthReset}
                />
              </label>
            ) : null}
            {draftMode === "custom" || draftMode === "inherit" ? (
              <MenuRecolorBandSliders
                recipe={draftMode === "inherit" ? options.recipe : draftRecipe}
                onChange={onOverrideRecipe}
                labelForBand={bandLabel}
                hueLabel={t("menuRecolor.hue")}
                satLabel={t("menuRecolor.saturation")}
                valLabel={t("menuRecolor.value")}
              />
            ) : null}
          </>
        )}
      </ToolSection>
    </ToolPage>
  );
}

function bandLabelKey(band: BandId): string {
  switch (band) {
    case "red":
      return "Red";
    case "orange":
      return "Orange";
    case "yellow":
      return "Yellow";
    case "green":
      return "Green";
    case "aqua":
      return "Aqua";
    case "blue":
      return "Blue";
    case "purple":
      return "Purple";
    case "magenta":
      return "Magenta";
    case "neutral":
      return "Neutral";
    case "gold":
      return "Gold";
    default: {
      const neverBand: never = band;
      return neverBand;
    }
  }
}

function ruleSetLabel(t: (key: string) => string, id: MenuRecolorRuleSetId): string {
  switch (id) {
    case "menuChrome":
      return t("menuRecolor.ruleMenuChrome");
    case "exceptIcons":
      return t("menuRecolor.ruleExceptIcons");
    case "facesOnly":
      return t("menuRecolor.ruleFacesOnly");
    default: {
      const neverId: never = id;
      return neverId;
    }
  }
}

function overrideBadge(t: (key: string) => string, override: SpriteOverride | undefined): string {
  const mode = override?.mode ?? "inherit";
  switch (mode) {
    case "inherit":
      return t("menuRecolor.overrideInherit");
    case "off":
      return t("menuRecolor.overrideOff");
    case "strength":
      return t("menuRecolor.overrideStrength");
    case "custom":
      return t("menuRecolor.overrideCustom");
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
