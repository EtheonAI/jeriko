import { useEffect } from 'react';
import { useLocation } from 'wouter';

function ScrollToAnchor() {
  const [location] = useLocation();

  useEffect(() => {
    if (location.includes('#')) {
      const id = location.split('#')[1];
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [location]);

  return null;
}

export default ScrollToAnchor;

