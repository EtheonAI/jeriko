import { useState } from 'react';

export const useCounter = (end: number | string, duration = 2000, start = 0) => {
  const [count, setCount] = useState(start);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);

  const startAnimation = () => {
    if (isAnimating || hasCompleted) return;
    
    setIsAnimating(true);
    const startTime = Date.now();
    const startValue = start;
    const endValue = typeof end === 'string' ? parseInt(end.replace(/\D/g, '')) : end;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (endValue - startValue) * easeOutQuart;

      setCount(Math.floor(currentValue));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(endValue);
        setIsAnimating(false);
        setHasCompleted(true);
      }
    };

    requestAnimationFrame(animate);
  };

  return [count, startAnimation, isAnimating, hasCompleted] as const;
};

