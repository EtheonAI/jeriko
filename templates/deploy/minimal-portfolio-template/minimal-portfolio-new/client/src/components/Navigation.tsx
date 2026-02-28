import { forwardRef, useState, useEffect } from 'react';
import placeholderPerson from '../assets/placeholder-person.webp';

const Navigation = forwardRef<HTMLElement>((props, ref) => {
  const [activeSection, setActiveSection] = useState('hero');
  const [clickedSection, setClickedSection] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    setClickedSection(sectionId);
    setIsMobileMenuOpen(false);
    setTimeout(() => setClickedSection(null), 600);
    
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (section) {
      section.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const sections = document.querySelectorAll('[data-section]');
          const scrollPosition = window.scrollY + 100;

          sections.forEach((section) => {
            const sectionTop = (section as HTMLElement).offsetTop;
            const sectionHeight = (section as HTMLElement).offsetHeight;
            const sectionId = section.getAttribute('data-section');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
              setActiveSection(sectionId || 'hero');
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { label: 'What I Do', sectionId: 'introduction' },
    { label: 'Work', sectionId: 'portfolio' },
    { label: 'Testimonials', sectionId: 'testimonials' },
    { label: 'About', sectionId: 'about' }
  ];

  return (
    <nav ref={ref} className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm transition-all duration-300">
      <div className="max-w-6xl mx-auto py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-gray-300 overflow-hidden relative">
              <img src={placeholderPerson} alt="NAME Doe" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <button 
              className="nav-logo font-medium tracking-wide transition-colors duration-300 cursor-pointer"
              onClick={() => scrollToSection('hero')}
            >
              NAME DOE
            </button>
          </div>
          
          <div className="flex items-center space-x-8">
            <div className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                <button 
                  key={item.sectionId}
                  className="nav-item hover:opacity-100 transition-all duration-300 relative group"
                  onClick={() => scrollToSection(item.sectionId)}
                >
                  {item.label}
                  <span 
                    className={`absolute bottom-0 left-0 h-0.5 bg-current transition-all duration-300 ${
                      activeSection === item.sectionId ? 'w-full opacity-60' : 'w-0 opacity-0'
                    }`}
                  ></span>
                  <span 
                    className={`absolute bottom-0 left-0 h-0.5 bg-current ${
                      clickedSection === item.sectionId 
                        ? 'animate-drawUnderline' 
                        : 'w-0'
                    }`}
                  ></span>
                </button>
              ))}
            </div>

            <button 
              className="md:hidden flex flex-col justify-center items-center w-8 h-8 space-y-1.5 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 rounded"
              onClick={toggleMobileMenu}
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span className={`w-6 h-0.5 transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ backgroundColor: 'var(--brand-accent)' }}></span>
              <span className={`w-6 h-0.5 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} style={{ backgroundColor: 'var(--brand-accent)' }}></span>
              <span className={`w-6 h-0.5 transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ backgroundColor: 'var(--brand-accent)' }}></span>
            </button>
          </div>
        </div>

        <div className={`md:hidden transition-all duration-300 overflow-hidden ${
          isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="px-6 py-4 space-y-4">
            {navItems.map((item) => (
              <button 
                key={item.sectionId}
                className="block w-full text-left nav-item hover:opacity-100 transition-all duration-300 relative group py-2"
                onClick={() => scrollToSection(item.sectionId)}
              >
                {item.label}
                <span 
                  className={`absolute bottom-0 left-0 h-0.5 bg-current transition-all duration-300 ${
                    activeSection === item.sectionId ? 'w-full opacity-60' : 'w-0 opacity-0'
                  }`}
                ></span>
                <span 
                  className={`absolute bottom-0 left-0 h-0.5 bg-current ${
                    clickedSection === item.sectionId 
                      ? 'animate-drawUnderline' 
                      : 'w-0'
                  }`}
                ></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
});

Navigation.displayName = 'Navigation';

export default Navigation;

