interface BadgePillProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
  emoji?: string;
  text: string;
  className?: string;
}

function BadgePill({ theme, emoji, text, className = "" }: BadgePillProps) {
  return (
    <span className={`inline-block px-4 py-2 ${theme.bg} text-white rounded-full text-sm font-['Ranchers'] font-bold mb-6 ${className}`}>
      {text}
    </span>
  );
}

export default BadgePill;

