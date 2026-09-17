/** A table wrapper that can scroll sideways; focusable so keyboards can scroll it too. */
export function ScrollX({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scroll-x" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
