import React from 'react'

const Testimonials = () => {
  const testimonials = [
    {
      id: 1,
      quote: "The team delivered an exceptional e-commerce platform that exceeded our expectations. Their attention to user experience and technical excellence has driven our sales up by 300%. Absolutely incredible work!",
      author: "Sarah Mitchell",
      position: "CEO, NextGen Commerce",
      image: '/UDuON5X6QCKh.webp',
      featured: true
    },
    {
      id: 2,
      quote: "Our mobile banking app has revolutionized how our customers interact with our services. The intuitive design and robust security features have earned us industry recognition and customer loyalty.",
      author: "Marcus Chen",
      position: "CTO, FinTech Solutions",
      image: '/cgqXlJeeiAfV.webp',
      featured: false
    },
    {
      id: 3,
      quote: "The dashboard they created for our SaaS platform is both beautiful and functional. Our team productivity has increased significantly, and our clients love the new interface.",
      author: "Jennifer Walsh",
      position: "Product Manager, CloudSync",
      image: '/YzHe9qvUhb31.webp',
      featured: false
    },
    {
      id: 4,
      quote: "The complete brand identity they developed perfectly captures our startup's vision. From logo to website, everything works together seamlessly to tell our story.",
      author: "David Rodriguez",
      position: "Founder, TechStart",
      image: '/UDuON5X6QCKh.webp',
      featured: false
    },
    {
      id: 5,
      quote: "Our learning management system has transformed education delivery. The gamification features and progress tracking have increased student engagement by 250%.",
      author: "Dr. Amanda Foster",
      position: "Director, EduPlatform",
      image: '/cgqXlJeeiAfV.webp',
      featured: false
    },
    {
      id: 6,
      quote: "The healthcare portal has streamlined our patient communication and improved care delivery. Both doctors and patients love the intuitive interface and seamless functionality.",
      author: "Roberto Silva",
      position: "Administrator, MedConnect",
      image: '/YzHe9qvUhb31.webp',
      featured: true
    }
  ]

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full h-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-block px-4 py-2 bg-white rounded-full text-sm text-gray-600 mb-6 shadow-sm">
            Testimonial
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            What our clients
            <br />
            are saying
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-4xl mx-auto px-4">
            Don't just take our word for it. Here's what clients have to say about their digital transformation projects
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {testimonials.map((testimonial, index) => (
            <div 
              key={testimonial.id}
              className={`bg-white rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-2xl transition-all duration-500 hover:scale-105 hover:-translate-y-2 animate-fade-in-up group relative overflow-hidden min-h-[280px] flex flex-col ${
                testimonial.featured ? 'lg:col-span-2 lg:row-span-1' : ''
              }`}
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              {/* Quote icon decoration */}
              <div className="absolute top-4 sm:top-6 right-4 sm:right-6 text-3xl sm:text-5xl text-gray-100 group-hover:text-gray-200 transition-colors duration-300 font-serif leading-none">
                "
              </div>
              
              {/* Star rating */}
              <div className="flex gap-1 mb-4 sm:mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {[...Array(5)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-2 h-2 sm:w-3 sm:h-3 bg-amber-400 rounded-full transform scale-0 group-hover:scale-100 transition-transform duration-300"
                    style={{ transitionDelay: `${i * 0.1}s` }}
                  ></div>
                ))}
              </div>

              {/* Quote content */}
              <div className="flex-1 flex flex-col justify-between relative z-10">
                <blockquote className="text-gray-700 mb-6 sm:mb-8 group-hover:text-gray-800 transition-colors duration-300 leading-relaxed text-sm sm:text-base flex-1">
                  "{testimonial.quote}"
                </blockquote>
                
                {/* Author section - always at bottom */}
                <div className="flex items-center mt-auto pt-4 border-t border-gray-100 group-hover:border-gray-200 transition-colors duration-300">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden mr-3 sm:mr-4 ring-2 ring-transparent group-hover:ring-amber-400/30 transition-all duration-300 flex-shrink-0">
                    <img
                      src={testimonial.image}
                      alt={testimonial.author}
                      className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <div className="transform group-hover:translate-x-1 transition-transform duration-300 min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-300 text-sm sm:text-base truncate">
                      {testimonial.author}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300 truncate">
                      {testimonial.position}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 via-purple-50/0 to-amber-50/0 group-hover:from-blue-50/20 group-hover:via-purple-50/10 group-hover:to-amber-50/20 rounded-2xl transition-all duration-500 pointer-events-none"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials

