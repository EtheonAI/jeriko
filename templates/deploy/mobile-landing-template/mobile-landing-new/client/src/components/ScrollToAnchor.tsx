import { useEffect } from 'react';
import { useLocation } from 'wouter';

function ScrollToAnchor() {
  const [location] = useLocation();

  useEffect(() => {
    // Check if there's a hash in the URL
    if (location.includes('#')) {
      const hash = location.split('#')[1];
      const element = document.getElementById(hash);
      
      if (element) {
        // Smooth scroll to the element
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [location]);

  // Also handle hash changes from anchor clicks
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash) {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return null;
}

export default ScrollToAnchor;

