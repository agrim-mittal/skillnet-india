// Ashoka-chakra style mark: a wheel with 24 spokes
export function Chakra({ size = 34, className = "" }) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      {spokes.map((a) => <line key={a} x1="20" y1="20" x2={20 + 16 * Math.cos((a * Math.PI) / 180)} y2={20 + 16 * Math.sin((a * Math.PI) / 180)} stroke="currentColor" strokeWidth="1" />)}
    </svg>
  );
}
