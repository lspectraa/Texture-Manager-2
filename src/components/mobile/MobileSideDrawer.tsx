import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type MobileSideDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Backdrop + Escape only — open/close via in-tool buttons and the panel close control. */
export function MobileSideDrawer({ open, onOpenChange }: MobileSideDrawerProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  return (
    <button
      type="button"
      className={`tm-mobile-drawer-backdrop${open ? " is-open" : ""}`}
      aria-label={t("navigation:mobile.closeDrawerAria")}
      aria-hidden={!open}
      tabIndex={-1}
      onClick={() => {
        if (open) {
          onOpenChange(false);
        }
      }}
    />
  );
}
