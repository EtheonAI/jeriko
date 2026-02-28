import { Quote } from 'lucide-react'

const Testimonials = () => {

  const testimonials = [
    {
      name: 'Alexandra Mitchell',
      role: 'CEO',
      company: 'TechStart Solutions',
      image: '/placeholder-person.webp',
      rating: 5,
      quote: 'The legal team provided exceptional guidance during our company merger. Their attention to detail and strategic approach made a complex process smooth and successful. Highly professional service.'
    },
    {
      name: 'Michael Chen',
      role: 'Business Owner',
      company: 'Innovative Designs LLC',
      image: '/placeholder-person.webp',
      rating: 5,
      quote: 'Outstanding intellectual property services that protected our brand and innovations. The team was responsive, knowledgeable, and delivered results that exceeded our expectations.'
    },
    {
      name: 'Jennifer Rodriguez',
      role: 'Property Developer',
      company: 'Urban Development Group',
      image: '/placeholder-person.webp',
      rating: 5,
      quote: 'Their real estate expertise was invaluable for our commercial development project. Professional, thorough, and always available to address our concerns. Excellent legal representation.'
    },
    {
      name: 'Robert Thompson',
      role: 'HR Director',
      company: 'Global Manufacturing Inc',
      image: '/placeholder-person.webp',
      rating: 5,
      quote: 'The employment law guidance helped us navigate complex workplace issues with confidence. Clear communication and practical solutions that protected our company interests.'
    }
  ]


  return (
    <section id="testimonials" className="bg-white">
      <div className="w-full  px-8 lg:px-16 py-16">
        {/* Section Header */}
        <div className="mb-8 fade-in">
        <p className="!text-[#150598] !font-medium mb-4">
          What Our Clients Say
          </p>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-medium leading-tight text-gray-900">
            Testimonials
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-8 auto-rows-fr">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="border border-gray-200 p-6 transition-all duration-300 hover:shadow-lg fade-in flex flex-col justify-between"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Quote Icon */}
              <div>
                <Quote className="w-6 h-6 text-[#150598] transform rotate-180" />
              </div>

              {/* Quote Text */}
              <blockquote className="text-gray-700 text-sm md:text-base leading-relaxed flex-1 my-4">
                {testimonial.quote}
              </blockquote>

              {/* Client Info */}
              <div className="flex items-center mt-auto">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full object-cover mr-4"
                  />
                  <div>
                    <h4 className="font-semibold text-gray-900 text-lg">
                      {testimonial.name}
                    </h4>
                    <p className="text-[#8B2635] text-sm font-medium">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials

