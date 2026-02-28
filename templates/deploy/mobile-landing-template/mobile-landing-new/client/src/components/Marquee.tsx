import React from 'react';

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  vertical?: boolean;
  repeat?: number;
}

export function Marquee({ 
  children, 
  className = "", 
  reverse = false, 
  pauseOnHover = false, 
  vertical = false,
  repeat = 4
}: MarqueeProps) {
  return (
    <div 
      className={`relative overflow-hidden ${vertical ? 'h-full' : 'w-full'} ${className}`}
      style={{
        WebkitMaskImage: vertical 
          ? 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
          : 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        maskImage: vertical 
          ? 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
          : 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
      }}
    >
      <div
        className={`flex ${vertical ? 'flex-col' : 'flex-row'} whitespace-nowrap`}
        style={{
          animation: `marquee 30s linear infinite ${reverse ? 'reverse' : 'normal'}`,
          animationPlayState: 'running',
        }}
        onMouseEnter={pauseOnHover ? (e) => e.currentTarget.style.animationPlayState = 'paused' : undefined}
        onMouseLeave={pauseOnHover ? (e) => e.currentTarget.style.animationPlayState = 'running' : undefined}
      >
        {/* Original */}
        <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} min-w-max`}>
          {children}
        </div>
        
        {/* Clones */}
        {Array.from({ length: repeat }).map((_, index) => (
          <div key={index} className={`flex ${vertical ? 'flex-col' : 'flex-row'} min-w-max`}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

