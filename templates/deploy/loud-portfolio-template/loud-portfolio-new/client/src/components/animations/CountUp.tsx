import React, { useEffect } from 'react';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { useCounter } from '../../hooks/useCounter';

interface CountUpProps {
  end: number | string;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  threshold?: number;
}

const CountUp = ({ 
  end, 
  duration = 2000, 
  suffix = '', 
  prefix = '',
  className = '',
  threshold = 0.3 
}: CountUpProps) => {
  const [ref, isVisible] = useIntersectionObserver({ threshold });
  const [count, startAnimation] = useCounter(end, duration);

  useEffect(() => {
    if (isVisible && typeof startAnimation === 'function') {
      startAnimation();
    }
  }, [isVisible, startAnimation]);

  const formatNumber = (num: number) => {
    if (typeof end === 'string' && end.includes('%')) {
      return `${num}%`;
    }
    if (typeof end === 'string' && end.includes('+')) {
      return `${num}+`;
    }
    if (typeof end === 'string' && end.includes('X')) {
      return `${num}X`;
    }
    return num;
  };

  return (
    <span ref={ref} className={className}>
      {prefix}{formatNumber(count)}{suffix}
    </span>
  );
};

export default CountUp;

