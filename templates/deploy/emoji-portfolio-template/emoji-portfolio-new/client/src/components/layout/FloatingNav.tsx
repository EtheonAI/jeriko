import { useState } from 'react'
import { motion } from 'framer-motion'
import { Home, FolderOpen, User, Mail } from 'lucide-react'

const FloatingNav = () => {
  const [activeSection, setActiveSection] = useState('home')

  const navItems = [
    { id: 'home', name: 'Home', icon: Home, href: '#home' },
    { id: 'about', name: 'About', icon: User, href: '#about' },
    { id: 'works', name: 'Works', icon: FolderOpen, href: '#projects' },
    { id: 'contact', name: 'Contact', icon: Mail, href: '#contact' }
  ]

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleNavClick = (item: typeof navItems[0]) => {
    setActiveSection(item.id)
    scrollToSection(item.href)
  }

  return (
    <motion.nav 
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200 px-2 py-2">
        <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`relative p-3 rounded-xl transition-all duration-200 ${
                activeSection === item.id
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-blue-500 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>
    </motion.nav>
  )
}

export default FloatingNav

