/**
 * Smoothly scrolls to an element with the specified ID
 * @param {string} elementId - The ID of the element to scroll to
 */
export const scrollToElement = (elementId: string) => {
  // Remove the '#' if it's included
  const targetId = elementId.startsWith('#') ? elementId.substring(1) : elementId;
  
  // Find the target element by ID
  const targetElement = document.getElementById(targetId);
  
  if (targetElement) {
    // Smooth scroll to the element
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
};

/**
 * Handle click on anchor links for smooth scrolling
 * @param {Event} e - The click event
 * @param {Function} navigate - The navigate function from react-router-dom (optional)
 */
export const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, navigate: ((path: string) => void) | null = null) => {
  const href = e.currentTarget.getAttribute('href');
  
  // Check if the link is an anchor link
  if (href && href.startsWith('#')) {
    e.preventDefault();
    scrollToElement(href);
  } else if (href && href.includes('#') && navigate) {
    // Handle links to other pages with anchors
    e.preventDefault();
    const [path, hash] = href.split('#');
    navigate(`${path}#${hash}`);
  }
};

