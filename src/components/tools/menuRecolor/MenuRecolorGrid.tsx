import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyColorRecipeToBytes,
  type ColorRecipe,
} from "../../../domain/menuRecolorColor";
import type { DiscoveredSprite, SpriteOverride } from "../../../domain/menuRecolor";
import { effectiveRecolor } from "../../../domain/menuRecolor";

const CELL_WIDTH = 156;
const ROW_HEIGHT = 188;
const GRID_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + GRID_GAP;
const VIEW_HEIGHT = 440;

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
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_STRIDE) - 1);
  const endRow = Math.min(rowCount, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_STRIDE) + 2);
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
    for (const id of ids) {
      const url = thumbs[id];
      if (!url || sourcesRef.current.has(id)) {
        continue;
      }
      const image = new Image();
      image.onload = () => {
        if (cancelled) {
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }
        context.drawImage(image, 0, 0);
        sourcesRef.current.set(id, context.getImageData(0, 0, canvas.width, canvas.height));
        setSourceVersion((version) => version + 1);
      };
      image.src = url;
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

type MenuRecolorTileProps = {
  sprite: DiscoveredSprite;
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
  const applied = useMemo(
    () => effectiveRecolor(included, globalRecipe, override),
    [globalRecipe, included, override],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    canvas.width = source.width;
    canvas.height = source.height;
    const image = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    if (applied) {
      applyColorRecipeToBytes(image.data, applied.recipe, applied.strength);
    }
    context.putImageData(image, 0, 0);
  }, [applied, source, sourceVersion]);

  return (
    <div
      role="button"
      tabIndex={0}
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
      <canvas ref={canvasRef} className="tm-menu-recolor-thumb" />
      <span className="tm-menu-recolor-name" title={sprite.name}>
        {sprite.name}
      </span>
      <span className="tm-menu-recolor-tags">{sprite.tags.join(" · ")}</span>
      <span className="tm-menu-recolor-badge">{badge}</span>
      <label
        className="tm-menu-recolor-include"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={included}
          onChange={(event) => onToggleInclude(sprite.id, event.target.checked)}
        />
        <span>{includeLabel}</span>
      </label>
    </div>
  );
}
