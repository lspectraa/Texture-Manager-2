import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderInput, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  includesForRuleSet,
  isRuleSetId,
  overridesForIncluded,
  tagSprite,
  MENU_RECOLOR_RULE_SETS,
  normalizeOverride,
  type DiscoveredSprite,
  type MenuRecolorOptions,
  type MenuRecolorRuleSetId,
  type SpriteOverride,
} from "../../domain/menuRecolor";
import { identityRecipe, type ColorRecipe } from "../../domain/menuRecolorColor";
import {
  discoverMenuRecolorSprites,
  getMenuRecolorDefaultInput,
  loadMenuRecolorThumbs,
} from "../../services/tauriMenuRecolor";
import { isTauriRuntime } from "../../services/tauriOperations";
import {
  graphicsTierFromStem,
  type IconEditorGraphicsTier,
} from "../../utils/iconEditorGraphicsTier";
import { isAppSandboxPath } from "../../utils/pathDisplay";
import { PickFolderFn } from "./types";
import {
  FolderPathField,
  ToolCheckboxField,
  ToolPage,
  ToolPageHeader,
  ToolSection,
  ToolSelectField,
  ToolTextField,
} from "./layout";
import { MenuRecolorGrid } from "./menuRecolor/MenuRecolorGrid";
import { MenuRecolorChannels } from "./menuRecolor/MenuRecolorSliders";

const STANDALONE_SHEET_FILTER = "__standalone__";
const THUMB_BATCH = 160;

type MenuRecolorToolPanelProps = {
  inputDir: string;
  outputDir: string;
  options: MenuRecolorOptions;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onOptionsChange: (next: MenuRecolorOptions) => void;
  pickFolder: PickFolderFn;
  geometryDashFound: boolean;
};

export function MenuRecolorToolPanel({
  inputDir,
  outputDir,
  options,
  onInputDirChange,
  onOutputDirChange,
  onOptionsChange,
  pickFolder,
  geometryDashFound,
}: MenuRecolorToolPanelProps) {
  const { t } = useTranslation(["tools", "errors"]);
  const [sprites, setSprites] = useState<DiscoveredSprite[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [graphicsFilter, setGraphicsFilter] = useState<IconEditorGraphicsTier | "all">("uhd");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [draftRecipe, setDraftRecipe] = useState<ColorRecipe>(identityRecipe());
  const [channelSlot, setChannelSlot] = useState<HTMLElement | null>(null);
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [resolvingDefault, setResolvingDefault] = useState(true);
  const anchorRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onOptionsChangeRef = useRef(onOptionsChange);
  onOptionsChangeRef.current = onOptionsChange;
  const tRef = useRef(t);
  tRef.current = t;
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  const pendingThumbs = useRef(new Set<string>());
  const thumbTimer = useRef<number | null>(null);
  const thumbInFlight = useRef(false);

  useLayoutEffect(() => {
    setChannelSlot(document.getElementById("tm-menu-recolor-channels"));
  }, []);

  useEffect(() => {
    if (useCustomInput) {
      setResolvingDefault(false);
      return;
    }
    if (!isTauriRuntime()) {
      setResolvingDefault(false);
      return;
    }
    let cancelled = false;
    setResolvingDefault(true);
    getMenuRecolorDefaultInput()
      .then((resolved) => {
        if (cancelled) {
          return;
        }
        if (resolved?.inputDir.trim()) {
          setGraphicsFilter(graphicsFilterForDefaultSheets(resolved.sheetStem));
          setDiscoverError(null);
          onInputDirChange(resolved.inputDir);
        } else if (geometryDashFound) {
          setDiscoverError(tRef.current("errors:geodeButtons.gameFilesNotFound"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDiscoverError(
            err instanceof Error
              ? err.message
              : tRef.current("errors:geodeButtons.resolveDefaultInputFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setResolvingDefault(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [geometryDashFound, onInputDirChange, useCustomInput]);

  useEffect(() => {
    const trimmed = inputDir.trim();
    if (!trimmed) {
      setSprites([]);
      setThumbs({});
      setSelectedIds([]);
      pendingThumbs.current.clear();
      return;
    }
    if (!isTauriRuntime()) {
      setDiscoverError(tRef.current("menuRecolor.discoverFailed"));
      return;
    }
    let cancelled = false;
    setDiscoverError(null);
    discoverMenuRecolorSprites(trimmed)
      .then((list) => {
        if (cancelled) {
          return;
        }
        const tagged = list.map((sprite) => ({
          ...sprite,
          tags: tagSprite(sprite.relativePath, sprite.name, sprite.sheetStem),
        }));
        setSprites(tagged);
        const current = optionsRef.current;
        const includes = includesForRuleSet(tagged, current.ruleSet);
        onOptionsChangeRef.current({
          ...current,
          includes,
          overrides: overridesForIncluded(current.overrides, includes),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoverError(tRef.current("menuRecolor.discoverFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inputDir]);

  const flushThumbs = useCallback(async () => {
    const dir = inputDir.trim();
    if (!dir || thumbInFlight.current) {
      return;
    }
    const ids = [...pendingThumbs.current].filter((id) => !thumbsRef.current[id]).slice(0, THUMB_BATCH);
    if (ids.length === 0) {
      return;
    }
    for (const id of ids) {
      pendingThumbs.current.delete(id);
    }
    thumbInFlight.current = true;
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
      for (const id of ids) {
        pendingThumbs.current.add(id);
      }
    } finally {
      thumbInFlight.current = false;
      if (pendingThumbs.current.size > 0) {
        void flushThumbs();
      }
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
      // First paint: flush ASAP; coalesce bursts with a short debounce.
      thumbTimer.current = window.setTimeout(() => {
        thumbTimer.current = null;
        void flushThumbs();
      }, thumbInFlight.current ? 24 : 0);
    },
    [flushThumbs],
  );

  useEffect(() => {
    if (selectedIds.length === 0) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".tm-menu-recolor-grid") ||
        target.closest(".tm-menu-recolor-channels") ||
        target.closest("#tm-menu-recolor-channels") ||
        target.closest(".tm-menu-recolor-rail-tabs")
      ) {
        return;
      }
      setSelectedIds([]);
      anchorRef.current = null;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selectedIds.length]);

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
      if (sheetFilter === STANDALONE_SHEET_FILTER) {
        if (sprite.sheetStem != null) {
          return false;
        }
      } else if (sheetFilter && sprite.sheetStem !== sheetFilter) {
        return false;
      }
      if (graphicsFilter !== "all" && spriteGraphicsTier(sprite) !== graphicsFilter) {
        return false;
      }
      if (includedOnly && !options.includes[sprite.id]) {
        return false;
      }
      return true;
    });
  }, [graphicsFilter, includedOnly, options.includes, search, sheetFilter, sprites]);

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
    const includes = includesForRuleSet(sprites, value);
    setSelectedIds((current) => current.filter((id) => includes[id]));
    onOptionsChange({
      ...options,
      ruleSet: value,
      includes,
      overrides: overridesForIncluded(options.overrides, includes),
    });
  };

  const onGlobalRecipe = (recipe: ColorRecipe) => {
    onOptionsChange({ ...options, recipe });
  };

  const commitOverride = (override: SpriteOverride, ids: readonly string[]) => {
    const overrides = { ...options.overrides };
    const normalized = normalizeOverride(override);
    for (const id of ids) {
      if (!options.includes[id] || normalized.mode === "inherit") {
        delete overrides[id];
      } else {
        overrides[id] = normalized;
      }
    }
    onOptionsChange({ ...options, overrides });
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
        setDraftRecipe(optionsRef.current.recipe);
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
    if (!options.includes[id]) {
      return;
    }
    const existing = options.overrides[id];
    const recipe = existing?.mode === "custom" ? existing.recipe : options.recipe;
    setDraftRecipe(recipe);
    commitOverride({ mode: "custom", recipe }, [id]);
  };

  const onOverrideRecipe = (recipe: ColorRecipe) => {
    setDraftRecipe(recipe);
    const ids = selectedIds.filter((id) => options.includes[id]);
    if (ids.length > 0) {
      commitOverride({ mode: "custom", recipe }, ids);
    }
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const includedSelectedIds = selectedIds.filter((id) => options.includes[id]);
  const selectedOverride =
    includedSelectedIds.length === 1 ? options.overrides[includedSelectedIds[0]] : undefined;
  const sliderRecipe =
    includedSelectedIds.length === 0
      ? options.recipe
      : selectedOverride?.mode === "custom"
        ? selectedOverride.recipe
        : draftRecipe;
  const onSliderRecipe = (recipe: ColorRecipe) => {
    if (includedSelectedIds.length > 0) {
      onOverrideRecipe(recipe);
      return;
    }
    onGlobalRecipe(recipe);
  };
  const channels = (
    <>
      <MenuRecolorChannels
        recipe={sliderRecipe}
        onRecipeChange={onSliderRecipe}
        selectedCount={includedSelectedIds.length}
      />
    </>
  );

  const pickInputFolder: PickFolderFn = (assign, folderOptions) =>
    pickFolder((path) => {
      setUseCustomInput(true);
      assign(path);
    }, { ...folderOptions, importToSandbox: false });

  return (
    <ToolPage accent="cyan" wide>
      <ToolPageHeader toolId="menuRecolor" />
      <ToolSection title={t("common.sourceAndOutput")} icon={FolderInput} columns={2}>
        <FolderPathField
          label={t("common.inputDirectory")}
          value={inputDir}
          onChange={(value) => {
            setUseCustomInput(true);
            onInputDirChange(value);
          }}
          pickFolder={pickInputFolder}
          placeholder={
            resolvingDefault
              ? t("menuRecolor.resolvingDefaultSheet")
              : "C:/path/to/texturepack"
          }
          sandboxImported={isAppSandboxPath(inputDir)}
          onBrowse={(path) => {
            setUseCustomInput(true);
            onInputDirChange(path);
            if (!outputDir.trim()) {
              onOutputDirChange(path);
            }
          }}
        />
        <FolderPathField
          label={t("common.outputDirectory")}
          value={outputDir}
          onChange={onOutputDirChange}
          pickFolder={(assign, folderOptions) =>
            pickFolder(assign, { ...folderOptions, importToSandbox: false })
          }
          placeholder="C:/path/to/output"
          sandboxImported={isAppSandboxPath(outputDir)}
        />
      </ToolSection>
      <ToolSection
        title={t("menuRecolor.grid")}
        subtitle={t("menuRecolor.gridDescription")}
        icon={SlidersHorizontal}
      >
        <div className="tm-menu-recolor-filters">
          <div className="tm-menu-recolor-filter-row">
            <ToolSelectField
              label={t("menuRecolor.settings")}
              value={options.ruleSet}
              options={MENU_RECOLOR_RULE_SETS.map((id) => ({
                value: id,
                label: ruleSetLabel(t, id),
              }))}
              onChange={onRuleSet}
            />
            <ToolSelectField
              className="tm-menu-recolor-sheet-filter"
              selectClassName="tm-menu-recolor-sheet-select"
              menuClassName="tm-menu-recolor-sheet-menu"
              label={t("menuRecolor.sheetFilter")}
              value={sheetFilter}
              options={[
                { value: "", label: t("menuRecolor.allSheets") },
                { value: STANDALONE_SHEET_FILTER, label: t("menuRecolor.standalonePngs") },
                ...sheetStems.map((stem) => ({ value: stem, label: stem })),
              ]}
              onChange={setSheetFilter}
            />
            <ToolSelectField
              label={t("menuRecolor.graphicsFilter")}
              value={graphicsFilter}
              options={[
                { value: "all", label: t("menuRecolor.graphicsAll") },
                { value: "low", label: t("menuRecolor.graphicsLow") },
                { value: "hd", label: t("menuRecolor.graphicsMedium") },
                { value: "uhd", label: t("menuRecolor.graphicsHigh") },
              ]}
              onChange={(value) => {
                if (value === "all" || value === "low" || value === "hd" || value === "uhd") {
                  setGraphicsFilter(value);
                }
              }}
            />
          </div>
          <div className="tm-menu-recolor-filter-row tm-menu-recolor-filter-row-search">
            <ToolTextField
              className="tm-menu-recolor-search"
              label={t("menuRecolor.search")}
              value={search}
              placeholder={t("menuRecolor.searchPlaceholder")}
              onChange={setSearch}
            />
            <div className="tm-menu-recolor-included">
              <ToolCheckboxField
                label={t("menuRecolor.includedOnly")}
                checked={includedOnly}
                onChange={setIncludedOnly}
              />
            </div>
          </div>
        </div>
        <div className="tm-menu-recolor-chips">
          <span>{t("menuRecolor.countTotal", { count: counts.total })}</span>
          <span>{t("menuRecolor.countIncluded", { count: counts.included })}</span>
          <span>{t("menuRecolor.countExcluded", { count: counts.excluded })}</span>
        </div>
        {discoverError ? <p className="tm-tool-section-note">{discoverError}</p> : null}
        {resolvingDefault ? (
          <p className="tm-tool-section-note">{t("menuRecolor.resolvingDefaultSheet")}</p>
        ) : null}
        {!resolvingDefault && !inputDir.trim() ? (
          <p className="tm-tool-section-note">{t("menuRecolor.discoverEmpty")}</p>
        ) : null}
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
          onToggleInclude={(id, included) => {
            const includes = { ...options.includes, [id]: included };
            if (!included) {
              setSelectedIds((current) => current.filter((item) => item !== id));
            }
            onOptionsChange({
              ...options,
              includes,
              overrides: overridesForIncluded(options.overrides, includes),
            });
          }}
          onSelect={onSelect}
          onNeedThumbs={onNeedThumbs}
          includeLabel={t("menuRecolor.include")}
          badgeLabel={(override) => overrideBadge(t, override)}
        />
      </ToolSection>
      {channelSlot ? createPortal(channels, channelSlot) : null}
    </ToolPage>
  );
}

function graphicsFilterForDefaultSheets(sheetStem: string): IconEditorGraphicsTier | "all" {
  const stems = sheetStem
    .split(",")
    .map((stem) => stem.trim())
    .filter((stem) => stem.length > 0);
  if (stems.length === 0) {
    return "uhd";
  }
  const tiers = new Set(stems.map(graphicsTierFromStem));
  if (tiers.size === 1) {
    const [tier] = tiers;
    return tier ?? "uhd";
  }
  return "all";
}

function spriteGraphicsTier(sprite: DiscoveredSprite): IconEditorGraphicsTier {
  if (sprite.sheetStem) {
    return graphicsTierFromStem(sprite.sheetStem);
  }
  return graphicsTierFromStem(sprite.name.replace(/\.png$/i, ""));
}

function ruleSetLabel(t: (key: string) => string, id: MenuRecolorRuleSetId): string {
  switch (id) {
    case "menuChrome":
      return t("menuRecolor.ruleMenuChrome");
    case "symbols":
      return t("menuRecolor.ruleSymbols");
    case "facesOnly":
      return t("menuRecolor.ruleFacesOnly");
    case "fonts":
      return t("menuRecolor.ruleFonts");
    case "editor":
      return t("menuRecolor.ruleEditor");
    case "shop":
      return t("menuRecolor.ruleShop");
    case "gauntlets":
      return t("menuRecolor.ruleGauntlets");
    case "objects":
      return t("menuRecolor.ruleObjects");
    case "effects":
      return t("menuRecolor.ruleEffects");
    case "icons":
      return t("menuRecolor.ruleIcons");
    case "geode":
      return t("menuRecolor.ruleGeode");
    case "logos":
      return t("menuRecolor.ruleLogos");
    case "exceptIcons":
      return t("menuRecolor.ruleExceptIcons");
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
