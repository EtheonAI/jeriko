const MessageBlock = () => {
  return (
    <section className="py-20 bg-charcoal text-cream">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm uppercase tracking-wide mb-6 opacity-80">
            Wedding Gifts
          </p>

          <h2 className="text-4xl md:text-5xl font-serif mb-8">
            Your presence is enough
          </h2>

          <div className="text-lg leading-relaxed mb-8 opacity-90">
            <p className="mb-6">
              Truly. We're just happy to celebrate with you. If you still want to give something, we'd love a contribution to our honeymoon.
            </p>
            
            <div className="flex items-center justify-center space-x-4">
              <p><strong>Swish:</strong> 123 456 78 90</p>
              <span className="text-pink-300">♥</span>
              <p><strong>Message:</strong> "Honeymoon"</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MessageBlock

