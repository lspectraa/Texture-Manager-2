import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_BANDS,
  applyColorRecipeToBytes,
  type ColorRecipe,
} from "../../../domain/menuRecolorColor";
import type { DiscoveredSprite, SpriteOverride } from "../../../domain/menuRecolor";
import { effectiveRecolor } from "../../../domain/menuRecolor";
import { ToolCheckboxField } from "../layout";

const PREVIEW_BOX = 112;
const CELL_WIDTH = 128;
const ROW_HEIGHT = 168;
const GRID_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + GRID_GAP;
const VIEW_HEIGHT = 520;
/** Extra rows above/below the viewport to prefetch thumbs. */
const OVERSCAN_ROWS = 3;

type MenuRecolorGridProps = {
  sprites: DiscoveredSprite[];
  thumbs: Record<string, string>;
  includes: Record<string, boolean>;
  overrides: Record<string, SpriteOverride>;
  globalRecipe: ColorRecipe;
  selectedIds: ReadonlySet<string>;
  onToggleInclude: (id: string, included: boolean) => void;
  onSelect: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onNeedThumbs: (ids: string[]) => void;
  includeLabel: string;
  badgeLabel: (override: SpriteOverride | undefined) => string;
};

export function MenuRecolorGrid({
  sprites,
  thumbs,
  includes,
  overrides,
  globalRecipe,
  selectedIds,
  onToggleInclude,
  onSelect,
  onNeedThumbs,
  includeLabel,
  badgeLabel,
}: MenuRecolorGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [width, setWidth] = useState(640);
  const sourcesRef = useRef(new Map<string, ImageData>());
  const decodeInFlight = useRef(new Set<string>());
  const [sourceVersion, setSourceVersion] = useState(0);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setWidth(node.clientWidth);
    });
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(1, Math.floor((width + GRID_GAP) / (CELL_WIDTH + GRID_GAP)));
  const rowCount = Math.ceil(sprites.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_STRIDE) - OVERSCAN_ROWS);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_STRIDE) + OVERSCAN_ROWS,
  );
  const startIndex = startRow * columns;
  const endIndex = Math.min(sprites.length, endRow * columns);
  const visible = sprites.slice(startIndex, endIndex);

  const visibleKey = visible.map((sprite) => sprite.id).join("\n");
  useEffect(() => {
    const ids = visibleKey.length === 0 ? [] : visibleKey.split("\n");
    const missing = ids.filter((id) => !thumbs[id]);
    if (missing.length > 0) {
      onNeedThumbs(missing);
    }
  }, [onNeedThumbs, thumbs, visibleKey]);

  useEffect(() => {
    let cancelled = false;
    const ids = visibleKey.length === 0 ? [] : visibleKey.split("\n");
    let pendingBump = false;
    const bump = () => {
      if (cancelled || pendingBump) {
        return;
      }
      pendingBump = true;
      requestAnimationFrame(() => {
        pendingBump = false;
        if (!cancelled) {
          setSourceVersion((version) => version + 1);
        }
      });
    };

    for (const id of ids) {
      const url = thumbs[id];
      if (!url || sourcesRef.current.has(id) || decodeInFlight.current.has(id)) {
        continue;
      }
      decodeInFlight.current.add(id);
      void decodeThumbToImageData(url)
        .then((imageData) => {
          decodeInFlight.current.delete(id);
          if (cancelled || !imageData) {
            return;
          }
          sourcesRef.current.set(id, imageData);
          bump();
        })
        .catch(() => {
          decodeInFlight.current.delete(id);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [thumbs, visibleKey]);

  const topPad = startRow * ROW_STRIDE;
  const height = Math.max(ROW_STRIDE, rowCount * ROW_STRIDE);

  return (
    <div
      ref={scrollerRef}
      className="tm-menu-recolor-grid"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="tm-menu-recolor-grid-spacer" style={{ height }}>
        <div
          className="tm-menu-recolor-grid-window"
          style={{
            transform: `translateY(${topPad}px)`,
            gridTemplateColumns: `repeat(${columns}, ${CELL_WIDTH}px)`,
          }}
        >
          {visible.map((sprite) => (
            <MenuRecolorTile
              key={sprite.id}
              sprite={sprite}
              thumbUrl={thumbs[sprite.id] ?? null}
              source={sourcesRef.current.get(sprite.id) ?? null}
              sourceVersion={sourceVersion}
              included={includes[sprite.id] ?? false}
              override={overrides[sprite.id]}
              globalRecipe={globalRecipe}
              selected={selectedIds.has(sprite.id)}
              onToggleInclude={onToggleInclude}
              onSelect={onSelect}
              includeLabel={includeLabel}
              badge={badgeLabel(overrides[sprite.id])}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function isNoopRecolor(applied: { recipe: ColorRecipe; strength: number }): boolean {
  if (applied.strength <= 1e-6) {
    return true;
  }
  for (const band of ALL_BANDS) {
    const delta = applied.recipe.bands[band];
    if (
      Math.abs(delta.hueDeg) > 1e-6 ||
      Math.abs(delta.satDelta) > 1e-6 ||
      Math.abs(delta.valDelta) > 1e-6
    ) {
      return false;
    }
  }
  return true;
}

async function decodeThumbToImageData(url: string): Promise<ImageData | null> {
  if (typeof createImageBitmap === "function" && url.startsWith("data:")) {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    bitmap.close();
    return data;
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

type MenuRecolorTileProps = {
  sprite: DiscoveredSprite;
  thumbUrl: string | null;
  source: ImageData | null;
  sourceVersion: number;
  included: boolean;
  override: SpriteOverride | undefined;
  globalRecipe: ColorRecipe;
  selected: boolean;
  onToggleInclude: (id: string, included: boolean) => void;
  onSelect: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  includeLabel: string;
  badge: string;
};

function MenuRecolorTile({
  sprite,
  thumbUrl,
  source,
  sourceVersion,
  included,
  override,
  globalRecipe,
  selected,
  onToggleInclude,
  onSelect,
  includeLabel,
  badge,
}: MenuRecolorTileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const applied = useMemo(
    () => effectiveRecolor(included, globalRecipe, override),
    [globalRecipe, included, override],
  );
  const needsRecolor = applied !== null && !isNoopRecolor(applied);

  useEffect(() => {
    if (!applied) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !source) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    canvas.width = PREVIEW_BOX;
    canvas.height = PREVIEW_BOX;
    const image = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    applyColorRecipeToBytes(image.data, applied.recipe, applied.strength);
    let scratch = scratchRef.current;
    if (!scratch) {
      scratch = document.createElement("canvas");
      scratchRef.current = scratch;
    }
    scratch.width = source.width;
    scratch.height = source.height;
    const sourceContext = scratch.getContext("2d");
    if (!sourceContext) {
      return;
    }
    sourceContext.putImageData(image, 0, 0);
    const scale = Math.min(PREVIEW_BOX / source.width, PREVIEW_BOX / source.height);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const x = Math.floor((PREVIEW_BOX - width) / 2);
    const y = Math.floor((PREVIEW_BOX - height) / 2);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, PREVIEW_BOX, PREVIEW_BOX);
    context.drawImage(scratch, x, y, width, height);
  }, [applied, source, sourceVersion]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={sprite.name}
      className={`tm-menu-recolor-tile${selected ? " is-selected" : ""}`}
      onClick={(event) =>
        onSelect(sprite.id, {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        })
      }
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(sprite.id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
        }
      }}
    >
      {needsRecolor ? (
        <canvas ref={canvasRef} className="tm-menu-recolor-thumb" />
      ) : thumbUrl ? (
        <img src={thumbUrl} alt="" className="tm-menu-recolor-thumb" draggable={false} />
      ) : (
        <canvas ref={canvasRef} className="tm-menu-recolor-thumb" />
      )}
      <span className="tm-menu-recolor-badge">{badge}</span>
      <div
        className="tm-menu-recolor-include"
        onClick={(event) => event.stopPropagation()}
      >
        <ToolCheckboxField
          label={includeLabel}
          checked={included}
          onChange={(next) => onToggleInclude(sprite.id, next)}
        />
      </div>
    </div>
  );
}
