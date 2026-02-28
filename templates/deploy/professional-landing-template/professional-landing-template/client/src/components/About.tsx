import { CheckCircle, Shield, Users, Target } from 'lucide-react'

const About = () => {
  const benefits = [
    {
      icon: Target,
      title: 'Strategic Legal Planning',
      description: 'Comprehensive legal strategies designed to address your specific business objectives and challenges.'
    },
    {
      icon: Users,
      title: 'Client-Focused Approach',
      description: 'Personalized service with clear communication, ensuring you understand every aspect of your legal matters.'
    },
    {
      icon: Shield,
      title: 'Experienced Representation',
      description: 'Skilled attorneys with extensive experience across multiple practice areas and industries.'
    },
    {
      icon: CheckCircle,
      title: 'Results-Driven Service',
      description: 'Committed to achieving favorable outcomes through meticulous preparation and strategic execution.'
    }
  ]

  return (
    <section id="about">
      <div className="w-full min-h-screen lg:h-screen">
        <div className="grid lg:grid-cols-2 lg:h-full">
          {/* Content */}
          <div className="fade-in flex items-center px-4 sm:px-6 md:px-8 lg:px-16 py-8 lg:py-0">
            <div>
              <p className="!text-[#150598] !font-medium mb-4">
                About Us
              </p>

              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium leading-tight text-gray-900 mb-4 sm:mb-6">
                Professional Legal Services Built on{' '}
                <span className="text-[#150598]">Trust & Excellence</span>
              </h2>

              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed">
                Our firm combines decades of legal expertise with a client-centered approach to deliver 
                exceptional results. We understand the complexities of modern legal challenges and are 
                dedicated to protecting your interests while providing clear, strategic guidance. From 
                corporate matters to individual legal needs, our experienced team is committed to achieving 
                the best possible outcomes for every client.
              </p>

              <div>
                <button 
                  onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-[#150598] text-white px-6 sm:px-8 py-3 font-medium hover:bg-[#0F0472] transition-colors text-sm sm:text-base"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="fade-in lg:order-2 flex flex-col justify-center py-8 lg:py-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:h-full border border-gray-300">
              {benefits.map((benefit, index) => (
                <div key={index} className={`group flex flex-col justify-center p-4 sm:p-6 lg:p-8 border-gray-300 ${
                  // Mobile: bottom border for all except last
                  index < benefits.length - 1 ? 'border-b sm:border-b-0' : ''
                } ${
                  // Desktop: right border for left column items
                  index % 2 === 0 ? 'md:border-r' : ''
                } ${
                  // Desktop: horizontal border between rows (only on first item of top row)
                  index < 2 ? 'md:border-b' : ''
                }`}>
                  <div className="text-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center transition-colors mx-auto mb-3 sm:mb-4">
                      <benefit.icon className="w-6 h-6 sm:w-8 sm:h-8 text-[#150598]" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-base sm:text-lg">{benefit.title}</h4>
                    <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default About

