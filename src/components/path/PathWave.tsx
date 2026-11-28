/** Bounded standing-wave underline for Path display titles (SPEC §7.2). Frozen under reduced motion. */
export function PathWave() {
  return (
    <span className="tm-path-wave" aria-hidden="true">
      <svg viewBox="0 0 560 12" preserveAspectRatio="none">
        <path d="M0 6 Q 35 1.4 70 6 T 140 6 T 210 6 T 280 6 T 350 6 T 420 6 T 490 6 T 560 6" />
      </svg>
    </span>
  );
}
