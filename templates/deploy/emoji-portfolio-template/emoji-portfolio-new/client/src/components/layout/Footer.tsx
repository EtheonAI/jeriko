import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons'
import { faLinkedin, faFacebook, faXTwitter } from '@fortawesome/free-brands-svg-icons'

const Footer = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const menuLinks = [
    { name: 'Home', href: '#home' },
    { name: 'About', href: '#about' },
    { name: 'Works', href: '#projects' },
  ]

  const socialLinks = [
    { name: 'LinkedIn', icon: faLinkedin, href: 'https://www.linkedin.com/' },
    { name: 'Facebook', icon: faFacebook, href: 'https://www.facebook.com/' },
    { name: 'X', icon: faXTwitter, href: 'https://x.com/' }
  ]

  const exploreLinks = [
    { name: 'Blog', href: '#' },
    { name: 'Resources', href: '#' },
    { name: 'Contact', href: '#contact' }
  ]

  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Character and Intro */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <span className="text-3xl sm:text-4xl">👨‍💻</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2 text-lg sm:text-xl">Hi, I'm Alex.</h3>
              <p className="text-gray-600 text-sm sm:text-base">
                Full-stack developer crafting digital experiences
              </p>
            </div>
          </div>

          {/* Menu */}
          <div className="text-center md:text-left">
            <h4 className="font-semibold text-gray-900 mb-4 text-base sm:text-lg">Menu</h4>
            <ul className="space-y-2 sm:space-y-3">
              {menuLinks.map((link) => (
                <li key={link.name}>
                  <button
                    onClick={() => scrollToSection(link.href)}
                    className="text-gray-600 hover:text-blue-600 transition-colors duration-200 text-sm sm:text-base"
                  >
                    {link.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Follow */}
          <div className="text-center md:text-left">
            <h4 className="font-semibold text-gray-900 mb-4 text-base sm:text-lg">Follow</h4>
            <ul className="space-y-2 sm:space-y-3">
              {socialLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-gray-600 hover:text-blue-600 transition-colors duration-200 text-sm sm:text-base flex items-center justify-center md:justify-start gap-2"
                  >
                    <FontAwesomeIcon icon={link.icon} className="w-4 h-4" />
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Explore */}
          <div className="col-span-2 md:col-span-1 text-center md:text-left">
            <h4 className="font-semibold text-gray-900 mb-4 text-base sm:text-lg">Explore</h4>
            <ul className="space-y-2 sm:space-y-3">
              {exploreLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-gray-600 hover:text-blue-600 transition-colors duration-200 text-sm sm:text-base"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-100 mt-6 sm:mt-8 pt-6 sm:pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm sm:text-base text-center sm:text-left">
            © 2024, Alex Chen
          </p>
          
          <motion.button
            onClick={scrollToTop}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium items-center gap-2 transition-colors duration-200 flex"
          >
            Back to Top
            <FontAwesomeIcon icon={faArrowUp} className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </footer>
  )
}

export default Footer

