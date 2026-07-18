/** Frost plate — keeps backdrop-filter off scroll/overflow hosts. */
export function GlassFrost({ className = "tm-glass-frost" }: { className?: string }) {
  return <span className={className} aria-hidden="true" />;
}
