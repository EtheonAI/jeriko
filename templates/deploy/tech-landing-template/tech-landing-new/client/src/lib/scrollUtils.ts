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
 */
export const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
  const href = e.currentTarget.getAttribute('href');
  
  // Check if the link is an anchor link
  if (href && href.startsWith('#')) {
    e.preventDefault();
    scrollToElement(href);
  }
};

