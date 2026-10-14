/** A hook drawn as a flight path: the stroke is the route, the dot is the event on it. */
export function LabMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16 3v10.5a6 6 0 0 1-12 0V12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <circle cx="16" cy="3.5" r="2.6" fill="var(--t-cyan)" />
      <path d="M2 12h4" stroke="var(--t-cyan)" strokeWidth="1.6" />
    </svg>
  );
}
