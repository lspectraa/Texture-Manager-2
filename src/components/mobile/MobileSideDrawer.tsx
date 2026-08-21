import { Activity, Package } from "lucide-react";
import { useEffect, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

type MobileSideDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "status" | "metadata";
  tone?: string;
  hasAttention?: boolean;
};

export function MobileSideDrawer({
  open,
  onOpenChange,
  mode,
  tone = "idle",
  hasAttention = false,
}: MobileSideDrawerProps) {
  const { t } = useTranslation();
  const label =
    mode === "metadata"
      ? t("tools:packInstaller.metadataPanelTitle")
      : t("reports:panelTitle");
  const startXRef = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const startX = startXRef.current;
    startXRef.current = null;
    if (startX == null) {
      return;
    }
    const delta = event.clientX - startX;
    if (open && delta > 48) {
      onOpenChange(false);
      return;
    }
    if (!open && delta < -48) {
      onOpenChange(true);
    }
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          className="tm-mobile-drawer-backdrop"
          aria-label={t("navigation:mobile.closeDrawerAria")}
          onClick={() => onOpenChange(false)}
        />
      ) : null}
      <button
        type="button"
        className={`tm-mobile-drawer-handle tm-mobile-drawer-handle-${tone}${
          open ? " is-open" : ""
        }${hasAttention ? " has-attention" : ""}`}
        aria-expanded={open}
        aria-controls="tm-mobile-report-rail"
        aria-label={
          open
            ? t("navigation:mobile.hideDrawerAria", { panel: label })
            : t("navigation:mobile.showDrawerAria", { panel: label })
        }
        onClick={() => onOpenChange(!open)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {mode === "metadata" ? (
          <Package size={16} strokeWidth={1.85} aria-hidden />
        ) : (
          <Activity size={16} strokeWidth={1.85} aria-hidden />
        )}
      </button>
    </>
  );
}
