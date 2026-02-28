const Footer = () => {
  return (
    <footer id="locations" className="bg-amber-900 text-amber-100">
      <div className="container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <span className="text-amber-900 font-bold text-lg">🍞</span>
              </div>
              <span className="text-amber-100 font-bold text-xl">FoodShare</span>
            </div>
            <p className="text-amber-200 mb-6 max-w-md">
              Fighting hunger in our community through food drives, volunteer programs, 
              and direct assistance to families in need. Together, we can create a hunger-free community.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center hover:bg-amber-700 transition-colors">
                <span className="text-amber-100">📘</span>
              </a>
              <a href="#" className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center hover:bg-amber-700 transition-colors">
                <span className="text-amber-100">🐦</span>
              </a>
              <a href="#" className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center hover:bg-amber-700 transition-colors">
                <span className="text-amber-100">📷</span>
              </a>
              <a href="#" className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center hover:bg-amber-700 transition-colors">
                <span className="text-amber-100">💼</span>
              </a>
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-bold text-lg mb-4">Get In Touch</h3>
            <ul className="space-y-2 text-amber-200">
              <li className="flex items-center space-x-2">
                <span>📍</span>
                <span>123 Community St, Your City, ST 12345</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>📞</span>
                <span>(555) 123-4567</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>✉️</span>
                <span>info@foodshare.org</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>🕒</span>
                <span>Mon-Fri: 9AM-5PM</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-amber-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-amber-200 text-sm">
            © 2024 FoodShare. All rights reserved. Fighting hunger, one meal at a time.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="text-amber-200 hover:text-white text-sm transition-colors">Privacy Policy</a>
            <a href="#" className="text-amber-200 hover:text-white text-sm transition-colors">Terms of Service</a>
            <a href="#" className="text-amber-200 hover:text-white text-sm transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer

