import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Component that handles scrolling to anchor elements when the URL hash changes
 * This is particularly useful for React Router applications where navigation
 * might not automatically scroll to anchor elements
 */
function ScrollToAnchor() {
  const [location] = useLocation();

  useEffect(() => {
    // Extract the hash from the current location
    const hash = window.location.hash;

    if (hash) {
      // Remove the '#' to get the element ID
      const elementId = hash.substring(1);
      
      // Find the target element
      const element = document.getElementById(elementId);
      
      if (element) {
        // Small delay to ensure the page has rendered
        setTimeout(() => {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 100);
      }
    } else {
      // If no hash, scroll to top
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [location]);

  // This component doesn't render anything
  return null;
}

export default ScrollToAnchor;

