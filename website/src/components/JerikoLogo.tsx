export default function JerikoLogo({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      {/* Outer shape: chevron arrow + square base */}
      <path d="M 8 5 L 58 5 L 92 48 L 42 48 L 42 92 L 8 92 Z" />
      {/* Internal divider: separates arrow from square */}
      <line x1="8" y1="48" x2="42" y2="48" />
    </svg>
  );
}
