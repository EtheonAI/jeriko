// Centralized navigation configuration
// Add new navigation items here to automatically update both desktop and mobile navigation

export const navigationItems = [
  {
    id: "home",
    label: "Home",
    href: "#",
    isHome: true,
  },
  {
    id: "features",
    label: "Features",
    href: "#features",
    targetId: "features",
  },
  {
    id: "specs",
    label: "Specs",
    href: "#details",
    targetId: "details",
  },
  {
    id: "testimonials",
    label: "Testimonials",
    href: "#testimonials",
    targetId: "testimonials",
  },
];

// Utility function to get navbar height dynamically
export const getNavbarHeight = () => {
  const navbar = document.querySelector("header");
  if (!navbar) return window.innerWidth < 768 ? 100 : 80; // fallback

  const rect = navbar.getBoundingClientRect();
  return rect.height + 20; // Add some padding
};

// Smooth scroll utility with dynamic offset
export const smoothScrollToSection = (targetId?: string) => {
  if (!targetId) {
    // Scroll to top
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    return;
  }

  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    console.warn(`Target element with id "${targetId}" not found`);
    return;
  }

  const offset = getNavbarHeight();

  window.scrollTo({
    top: targetElement.offsetTop - offset,
    behavior: "smooth",
  });
};

