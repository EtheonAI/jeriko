const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-dark-900 text-white py-12 mt-16 sm:mt-20 md:mt-24">
      <div className="container px-6 lg:px-8 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <h3 className="font-brockmann text-3xl font-medium text-atlas-500">
                Atlas
              </h3>
            </div>
            <p className="text-gray-300 mb-4 max-w-md">
              Advanced robotic arms engineered for precision assembly tasks,
              delivering unmatched accuracy and efficiency in manufacturing
              environments.
            </p>
            <p className="text-atlas-500 font-semibold">Made to Last</p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="#hero"
                  className="text-gray-300 hover:text-atlas-500 transition-colors"
                >
                  Home
                </a>
              </li>
              <li>
                <a
                  href="#precision-assembly"
                  className="text-gray-300 hover:text-atlas-500 transition-colors"
                >
                  About
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="text-gray-300 hover:text-atlas-500 transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#details"
                  className="text-gray-300 hover:text-atlas-500 transition-colors"
                >
                  Specs
                </a>
              </li>
              <li>
                <a
                  href="#testimonials"
                  className="text-gray-300 hover:text-atlas-500 transition-colors"
                >
                  Testimonials
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-gray-300">
              <li>support@atlasrobotics.com</li>
              <li>+1 (555) 123-4567</li>
              <li>Manufacturing Excellence</li>
              <li>Precision Assembly</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 pt-6 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm mb-4 md:mb-0">
            © {currentYear} Atlas Robotics. All rights reserved.
          </p>
          <div className="flex space-x-6">
            <a
              href="#"
              className="text-gray-400 hover:text-atlas-500 text-sm transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-gray-400 hover:text-atlas-500 text-sm transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="#"
              className="text-gray-400 hover:text-atlas-500 text-sm transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

