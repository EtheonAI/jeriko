const Footer = () => {
  return (
    <footer className="bg-charcoal text-cream py-12">
      <div className="container mx-auto px-6">
        <div className="text-center">
          <p className="text-sm opacity-80 mb-4">
            Thank you for celebrating with us
          </p>
          <div className="flex items-center justify-center space-x-2 text-xs opacity-60">
            <span>Made with</span>
            <span className="text-pink-300">♥</span>
            <span>for our special day</span>
          </div>
          <p className="text-xs opacity-60 mt-4">
            © 2024 Wedding Website
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer

