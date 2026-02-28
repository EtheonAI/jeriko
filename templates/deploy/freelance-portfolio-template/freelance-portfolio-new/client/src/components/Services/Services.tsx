import React, { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const Services = () => {
  const [expandedService, setExpandedService] = useState(0)

  const services = [
    {
      id: 0,
      number: '01',
      title: 'Web Development',
      description: 'We build modern, responsive websites and web applications using cutting-edge technologies. From simple landing pages to complex e-commerce platforms, we deliver solutions that perform.',
      tags: ['React', 'Next.js', 'Node.js', 'TypeScript'],
      images: ['/kTzATMLLTFjv.webp', '/17MZakDnNRkb.webp', '/SKOYyGuxUSDd.webp']
    },
    {
      id: 1,
      number: '02',
      title: 'Mobile Development',
      description: 'We create native and cross-platform mobile applications that provide seamless user experiences. Our apps are built for performance, scalability, and user engagement.',
      tags: ['React Native', 'Flutter', 'iOS', 'Android'],
      images: []
    },
    {
      id: 2,
      number: '03',
      title: 'UI/UX Design',
      description: 'We design intuitive and beautiful user interfaces that enhance user experience. From wireframes to high-fidelity prototypes, we create designs that users love.',
      tags: ['User Research', 'Prototyping', 'Design Systems', 'Usability Testing'],
      images: []
    },
    {
      id: 3,
      number: '04',
      title: 'Brand Identity',
      description: 'We develop comprehensive brand identities that tell your story and connect with your audience. From logos to brand guidelines, we create cohesive visual systems.',
      tags: ['Logo Design', 'Brand Strategy', 'Visual Identity', 'Brand Guidelines'],
      images: []
    },
    {
      id: 4,
      number: '05',
      title: 'Digital Marketing',
      description: 'We create data-driven digital marketing strategies that drive growth and engagement. From SEO to social media, we help you reach your target audience effectively.',
      tags: ['SEO', 'Social Media', 'Content Strategy', 'Analytics'],
      images: []
    },
    {
      id: 5,
      number: '06',
      title: 'Consulting & Strategy',
      description: 'We provide strategic guidance to help you make informed technology decisions. From architecture planning to digital transformation, we guide your success.',
      tags: ['Technology Strategy', 'Digital Transformation', 'Architecture Planning', 'Process Optimization'],
      images: []
    }
  ]

  const toggleService = (serviceId: number) => {
    setExpandedService(expandedService === serviceId ? -1 : serviceId)
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section id="services" className="py-12 sm:py-16 lg:py-20 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto w-full h-full px-4 sm:px-6 lg:px-8">       
      {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-block px-4 py-2 bg-gray-800 rounded-full text-sm text-gray-300 mb-6">
            Services
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Our Services
          </h2>
          <p className="text-lg sm:text-xl text-gray-300 max-w-4xl mx-auto mb-8 px-4">
            We offer comprehensive digital solutions that transform your business with innovative technology, stunning design, and strategic thinking
          </p>
          <Button 
            onClick={() => scrollToSection('contact')}
            className="bg-white text-gray-900 hover:bg-gray-100 px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg"
            size="lg"
          >
            Get Started Today
          </Button>
        </div>

        {/* Services Accordion */}
        <div className="space-y-4">
          {services.map((service) => (
            <div 
              key={service.id}
              className="border-b border-gray-700 last:border-b-0"
            >
              <button
                onClick={() => toggleService(service.id)}
                className="w-full flex items-center justify-between py-6 sm:py-8 text-left hover:bg-gray-800/50 transition-all duration-300 rounded-lg px-4 sm:px-6 group hover:scale-[1.02] hover:shadow-xl"
              >
                <div className="flex items-center space-x-3 sm:space-x-6 min-w-0 flex-1">
                  <span className="text-lg sm:text-2xl text-gray-500 font-light group-hover:text-amber-400 transition-colors duration-300 group-hover:animate-bounce-subtle flex-shrink-0">
                    {service.number}
                  </span>
                  <h3 className="text-lg sm:text-2xl lg:text-3xl font-bold group-hover:text-white transition-colors duration-300 truncate">
                    {service.title}
                  </h3>
                </div>
                <div className="text-gray-400 group-hover:text-amber-400 transition-all duration-300 flex-shrink-0 ml-2">
                  {expandedService === service.id ? (
                    <Minus size={20} className="sm:w-6 sm:h-6 transform group-hover:rotate-180 transition-transform duration-300" />
                  ) : (
                    <Plus size={20} className="sm:w-6 sm:h-6 transform group-hover:rotate-90 transition-transform duration-300" />
                  )}
                </div>
              </button>

              {expandedService === service.id && (
                <div className="px-4 sm:px-6 pb-6 sm:pb-8">
                  <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-start">
                    <div>
                      <p className="text-base sm:text-lg text-gray-300 mb-4 sm:mb-6 leading-relaxed">
                        {service.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {service.tags.map((tag, index) => (
                          <span 
                            key={index}
                            className="px-2 sm:px-3 py-1 bg-gray-800 rounded-full text-xs sm:text-sm text-gray-300 border border-gray-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    {service.images.length > 0 && (
                      <div className="flex gap-2 sm:gap-4 mt-4 lg:mt-0">
                        {service.images.map((image, index) => (
                          <div 
                            key={index}
                            className="flex-1 aspect-square rounded-lg overflow-hidden"
                          >
                            <img
                              src={image}
                              alt={`${service.title} example ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Services

