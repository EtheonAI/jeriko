import React, { useState } from 'react'
import { Menu, X } from 'lucide-react'

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const menuItems = [
    { label: 'Projects', sectionId: 'portfolio' },
    { label: 'Articles', sectionId: 'articles' },
    { label: 'About', sectionId: 'about' },
    { label: 'Contact', sectionId: 'contact' }
  ]

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
    setIsMenuOpen(false)
  }

  return (
    <>
      {/* Clean Header with Menu Button */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--dusty-blue-50)] backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center justify-between h-16 px-6">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">Luxina</span>
            </div>
          </div>

          {/* Menu Button */}
          <button
            onClick={toggleMenu}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <Menu size={24} className="text-gray-700" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={toggleMenu}
        />
      )}

      {/* Mobile Top Menu */}
      <div className={`fixed top-0 left-0 right-0 bg-[var(--dusty-blue-50)] z-50 transform transition-transform duration-300 ease-in-out shadow-2xl ${
        isMenuOpen ? 'translate-y-0' : '-translate-y-full'
      }`}>
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">Luxina</span>
          </div>
          <button
            onClick={toggleMenu}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <X size={24} className="text-gray-700" />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="p-4 pb-8">
          <div className="space-y-2">
            {menuItems.map((item) => (
              <button 
                key={item.sectionId}
                onClick={() => scrollToSection(item.sectionId)}
                className="block w-full text-left px-4 py-4 text-lg font-medium text-gray-700 rounded-xl transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200"
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}

export default Header

