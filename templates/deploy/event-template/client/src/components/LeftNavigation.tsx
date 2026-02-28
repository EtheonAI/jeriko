import { useState, useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  name: string;
  href: string;
}

const NavBar = () => {
  const [activeSection, setActiveSection] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  const navItems: NavItem[] = [
    { name: "Events", href: "#events" },
    { name: "Wedding Party", href: "#wedding-party" },
    { name: "Location", href: "#location" },
    { name: "RSVP", href: "#rsvp" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Handle scroll visibility - Hide when scrolling DOWN, show when scrolling UP
      if (currentScrollY > lastScrollY.current && currentScrollY > 80) {
        setIsVisible(false); // Hide when scrolling down
      } else {
        setIsVisible(true); // Show when scrolling up or at top
      }
      
      // Handle collapsed state (only when visible)
      setIsScrolled(false); // Disable small state for now
      
      // Handle active section
      const sections = navItems.map(item => item.href.replace('#', ''));
      const scrollPosition = currentScrollY + 100; // Offset for header

      for (let i = sections.length - 1; i >= 0; i--) {
        const element = document.getElementById(sections[i]);
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
      
      // Update lastScrollY after all other state updates
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-40 w-full transition-all duration-300 ease-in-out ${
      isVisible ? 'translate-y-0' : '-translate-y-full'
    } ${
      isScrolled 
        ? 'bg-background/98 backdrop-blur-md border-b border-border shadow-lg' 
        : 'bg-background/95 backdrop-blur-sm border-b border-border'
    }`}>
      <div className="mx-auto px-6 max-w-full">
        <div className={`flex items-center justify-between transition-all duration-300 ${
          isScrolled ? 'h-14' : 'h-16'
        }`}>
          {/* Logo Section */}
          <div className="flex items-center space-x-3">
            <div className={`bg-gradient-to-r from-gold to-gold-light rounded-lg flex items-center justify-center transition-all duration-300 ${
              isScrolled ? 'w-9 h-9' : 'w-10 h-10'
            }`}>
              <Heart className={`text-white transition-all duration-300 ${
                isScrolled ? 'w-4 h-4' : 'w-5 h-5'
              }`} />
            </div>
            <p className={`font-medium text-muted-foreground transition-all duration-300 ${
              isScrolled ? 'text-xs' : 'text-sm'
            }`}>S&M</p>
          </div>

          {/* Navigation Items */}
          <nav className="hidden md:flex">
            <ul className={`flex items-center transition-all duration-300 ${
              isScrolled ? 'space-x-4' : 'space-x-8'
            }`}>
              {navItems.map((item) => {
                const sectionId = item.href.replace('#', '');
                const isActive = activeSection === sectionId;
                
                return (
                  <li key={item.name}>
                    <button
                      onClick={() => handleNavClick(item.href)}
                      className={`transition-all duration-300 ${
                        isScrolled ? 'px-2 py-1' : 'px-3 py-2'
                      } ${
                        isActive 
                          ? 'text-gold font-medium transform scale-105' 
                          : 'text-muted-foreground hover:text-gold'
                      }`}
                    >
                      <span className={`whitespace-nowrap transition-all duration-300 ${
                        isScrolled ? 'text-xs' : 'text-sm'
                      }`}>
                        {item.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* CTA Button */}
          <div className="flex items-center">
            <Button 
              variant="outline" 
              size="sm"
              className="border-gold text-gold hover:bg-gold hover:text-white"
              title="RSVP Now"
            >
              RSVP
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavBar;

