import { Button } from '@/components/ui/button'
import { ExternalLink, Menu, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState } from 'react'

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  
  const navigationLinks = [
    { name: 'Home', href: '#home' },
    { name: 'About', href: '#about' },
    { name: 'Programs', href: '#programs' },
    { name: 'Volunteers', href: '#volunteers' },
    { name: 'Blog', href: '#blog' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-amber-900/95 backdrop-blur-sm border-b border-amber-800">
      <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <span className="text-amber-900 font-bold text-lg">🍞</span>
          </div>
          <span className="text-amber-100 font-bold text-xl">FoodShare</span>
        </div>

        {/* Desktop Navigation Menu */}
        <div className="hidden md:flex items-center space-x-8">
          {navigationLinks.map((link, index) => (
            <a 
              key={index}
              href={link.href} 
              className="text-amber-100 hover:text-amber-200 transition-colors font-medium"
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* CTA Button */}
        <Button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2">
          Donate Food
          <ExternalLink className="w-4 h-4" />
        </Button>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <DropdownMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <DropdownMenuTrigger className="text-amber-100 hover:text-amber-200 transition-colors focus:outline-none">
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              className="bg-amber-900 border-amber-800 shadow-lg w-48 mr-6"
              align="end"
            >
              {navigationLinks.map((link, index) => (
                <DropdownMenuItem 
                  key={index} 
                  className="focus:bg-amber-800"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <a 
                    href={link.href} 
                    className="text-amber-100 hover:text-amber-200 transition-colors w-full block py-2"
                  >
                    {link.name}
                  </a>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="focus:bg-amber-800">
                <Button 
                  className="bg-orange-500 hover:bg-orange-600 text-white w-full rounded-full font-semibold flex items-center justify-center gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Donate Food
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  )
}

export default Header

