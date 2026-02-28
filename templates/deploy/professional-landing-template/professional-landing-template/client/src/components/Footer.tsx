import { Phone, Mail, MapPin, Scale } from 'lucide-react'

const Footer = () => {
  const navigationLinks = [
    { name: 'About', href: '#about' },
    { name: 'Services', href: '#services' },
    { name: 'Contact', href: '#contact' }
  ]

  const contactInfo = [
    { icon: Phone, text: '(555) 123-4567', type: 'tel' },
    { icon: Mail, text: 'contact@legaltemplate.com', type: 'email' },
    { icon: MapPin, text: '123 Business Ave, Suite 100, City, State 12345', type: 'address' }
  ]

  return (
    <footer id="contact" className="bg-gray-900 text-white" style={{ color: 'white' }}>
      <div className="w-full px-8 lg:px-16 py-16">
        <div className="w-full">
          <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-12 mb-12">
            {/* Brand & Description */}
            <div>
              <div className="flex items-center mb-4">
                <Scale className="w-8 h-8 !text-white mr-3" style={{ color: 'white' }} />
                <h3 className="text-2xl font-bold !text-white" style={{ color: 'white' }}>LEGAL TEMPLATE</h3>
              </div>
              <p className="!text-white mb-4 leading-relaxed" style={{ color: 'white' }}>
                Professional. Reliable. Results-Driven.
              </p>
              <p className="!text-white text-sm leading-relaxed" style={{ color: 'white' }}>
                Comprehensive legal services designed to meet your unique needs with 
                personalized attention and strategic expertise you can trust.
              </p>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="text-lg !font-semibold mb-6 !text-white" style={{ color: 'white' }}>Pages</h4>
              <ul className="space-y-3">
                {navigationLinks.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.href}
                      className="!text-white hover:!text-gray-300 transition-colors duration-200"
                      style={{ color: 'white' }}
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact Info */}
            <div>
              <h4 className="text-lg !font-semibold mb-6 !text-white" style={{ color: 'white' }}>Contact Us</h4>
              <div className="space-y-4">
                {contactInfo.map((info, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <info.icon className="w-5 h-5 !text-white mt-1" style={{ color: 'white' }} />
                    <div>
                      {info.type === 'tel' ? (
                        <a href={`tel:${info.text}`} className="!text-white hover:!text-gray-300 transition-colors" style={{ color: 'white' }}>
                          {info.text}
                        </a>
                      ) : info.type === 'email' ? (
                        <a href={`mailto:${info.text}`} className="!text-white hover:!text-gray-300 transition-colors" style={{ color: 'white' }}>
                          {info.text}
                        </a>
                      ) : (
                        <span className="!text-white" style={{ color: 'white' }}>{info.text}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="w-full px-8 lg:px-16">
          <div className="py-6 text-center">
            <div className="!text-white text-sm" style={{ color: 'white' }}>
              © 2025 Legal Template. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer

