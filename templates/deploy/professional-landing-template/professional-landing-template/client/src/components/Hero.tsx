const Hero = () => {
  const stats = [
    { value: '15+', label: 'Years of Experience' },
    { value: '1500+', label: 'Happy Clients' },
    { value: '500+', label: 'Successful Cases' }
  ]

  return (
    <section id="home">
      <div className="w-full min-h-screen lg:h-screen">
        <div className="grid lg:grid-cols-2 lg:h-full">
          {/* Content */}
          <div className="fade-in flex flex-col justify-between px-4 sm:px-6 md:px-8 lg:px-16 py-8 lg:py-0">
            {/* Top section - Hero content */}
            <div className="pt-0 sm:pt-24 md:pt-28 lg:pt-32">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium leading-tight mb-4">
                Expert <span className="text-[#150598]">Legal Counsel</span> for Your Business Needs
              </h1>
              
              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed">
                We provide comprehensive legal services tailored to your unique requirements. Our experienced 
                team delivers strategic solutions to help you navigate complex legal challenges with confidence 
                and achieve your business objectives.
              </p>

              <div>
                <button 
                  onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-[#150598] text-white px-6 sm:px-8 py-3 font-medium hover:bg-[#0F0472] transition-colors text-sm sm:text-base"
                >
                  See Services
                </button>
              </div>
            </div>

            {/* Bottom section - Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mt-8 lg:mt-0 mb-8 lg:mb-12">
              {stats.map((stat, index) => (
                <div key={index} className={`text-center sm:text-left py-4 ${
                  index < stats.length - 1 ? 'sm:border-r border-gray-300 sm:pr-4 lg:pr-8 border-b sm:border-b-0 pb-4 sm:pb-4' : ''
                }`}>
                  <div className="text-2xl sm:text-3xl md:text-4xl mb-1 text-[#150598] font-medium">{stat.value}</div>
                  <div className="text-gray-600 text-xs sm:text-sm leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Image */}
          <div className="fade-in lg:order-2 order-first lg:order-none h-64 sm:h-80 lg:h-full">
            <div className="w-full h-full">
              {/* Law books image */}
              <img 
                src="/books.webp" 
                alt="Law Books" 
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero

