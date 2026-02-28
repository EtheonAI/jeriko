import React from 'react';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

interface SlideUpProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
  threshold?: number;
}

const SlideUp = ({ 
  children, 
  delay = 0, 
  duration = 800, 
  distance = 50,
  className = '',
  threshold = 0.1 
}: SlideUpProps) => {
  const [ref, isVisible] = useIntersectionObserver({ threshold });

  return (
    <div
      ref={ref}
      className={`transition-all ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : `translateY(${distance}px)`,
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

export default SlideUp;

