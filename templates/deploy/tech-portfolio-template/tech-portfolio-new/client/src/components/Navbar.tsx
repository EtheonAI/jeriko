interface NavbarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const Navbar = ({ activeSection, setActiveSection }: NavbarProps) => {
  const navItems = [
    { id: 'about', label: 'About' },
    { id: 'resume', label: 'Resume' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'blog', label: 'Blog' }
  ];

  const handleNavClick = (sectionId: string) => {
    setActiveSection(sectionId);
    window.scrollTo(0, 0);
  };

  return (
    <nav className="navbar mb-8">
      <ul className="navbar-list flex flex-wrap gap-2">
        {navItems.map((item) => (
          <li key={item.id} className="navbar-item">
            <button
              className={`navbar-link px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeSection === item.id
                  ? 'bg-gradient-to-r from-orange-yellow-crayola to-vegas-gold text-white font-semibold'
                  : 'text-light-gray hover:text-white hover:bg-jet'
              }`}
              onClick={() => handleNavClick(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navbar;

