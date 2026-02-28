import React from 'react';
import { Star } from 'lucide-react';
const testimonial1 = '/testimonial-1.webp';
const testimonial2 = '/testimonial-2.webp';
const testimonial3 = '/testimonial-3.webp';

const TestimonialsSection = () => {
  const testimonials = [
    {
      id: 1,
      text: "Alex transformed our digital presence and increased our revenue by 200% in just four months. Outstanding work!",
      author: "Michael Rodriguez",
      position: "E-commerce Store Owner",
      image: testimonial1,
      rating: 5
    },
    {
      id: 2,
      text: "Working with Alex was a game-changer. The content strategy delivered results beyond our expectations.",
      author: "Sarah Chen",
      position: "SaaS Marketing Director",
      image: testimonial2,
      rating: 5
    },
    {
      id: 3,
      text: "Professional, creative, and results-driven. Alex helped us achieve our growth goals faster than we thought possible.",
      author: "David Thompson",
      position: "Restaurant Owner",
      image: testimonial3,
      rating: 5
    }
  ];

  const mainTestimonial = testimonials[0];

  return (
    <section id="testimonials" className="dark-section py-20">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h3 className="section-subtitle text-accent-orange mb-4">TESTIMONIALS</h3>
        </div>

        {/* Main Testimonial */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Client Image */}
            <div className="order-2 lg:order-1" id="testimonial-image-container">
              <div className="aspect-square max-w-md mx-auto bg-gray-700 rounded-2xl overflow-hidden">
                <img 
                  src={mainTestimonial.image} 
                  alt={mainTestimonial.author}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Testimonial Content */}
            <div className="order-1 lg:order-2">
              <h2 className="section-title text-white mb-8 leading-tight" 
                  style={{
                    fontSize: 'clamp(1.5rem, 8vw, min(8vh, 12vw))',
                    lineHeight: '1.1'
                  }}>
                {mainTestimonial.text}
              </h2>
              
              {/* Client Info */}
              <div className="flex items-center space-x-4">
                <div>
                  <div className="font-semibold text-white text-lg">
                    {mainTestimonial.author}
                  </div>
                  <div className="text-gray-300">
                    {mainTestimonial.position}
                  </div>
                </div>
              </div>

              {/* Rating */}
              <div className="flex items-center space-x-1 mt-6">
                {[...Array(mainTestimonial.rating)].map((_, index) => (
                  <Star key={index} className="w-5 h-5 text-accent-yellow fill-current" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Testimonials (Optional) */}
        {testimonials.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16 max-w-4xl mx-auto">
            {testimonials.slice(1).map((testimonial) => (
              <div key={testimonial.id} className="dark-card p-8 rounded-2xl">
                <div className="flex items-center space-x-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, index) => (
                    <Star key={index} className="w-4 h-4 text-accent-yellow fill-current" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-700 rounded-full overflow-hidden">
                    <img 
                      src={testimonial.image} 
                      alt={testimonial.author}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      {testimonial.author}
                    </div>
                    <div className="text-gray-300 text-sm">
                      {testimonial.position}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default TestimonialsSection;

