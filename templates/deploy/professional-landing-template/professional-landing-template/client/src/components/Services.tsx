const Services = () => {
  const services = [
    {
      number: '01',
      title: 'Corporate Law',
      description: 'Comprehensive legal support for businesses of all sizes, including entity formation, governance, mergers and acquisitions, and regulatory compliance to help your business thrive.'
    },
    {
      number: '02',
      title: 'Intellectual Property',
      description: 'Protect your innovations and creative works with our IP services, including trademark registration, patent applications, copyright protection, and enforcement strategies.'
    },
    {
      number: '03',
      title: 'Employment Law',
      description: 'Navigate workplace legal matters with confidence, from employment contracts and policy development to dispute resolution and compliance with labor regulations.'
    },
    {
      number: '04',
      title: 'Real Estate Law',
      description: 'Expert guidance for all your property needs, including transactions, leasing agreements, zoning issues, and commercial real estate development projects.'
    },
    {
      number: '05',
      title: 'Contract Law',
      description: 'Ensure your agreements are legally sound with our contract drafting, review, and negotiation services for all types of business and personal contracts.'
    },
    {
      number: '06',
      title: 'Litigation Support',
      description: 'Strong representation in legal disputes with strategic litigation planning, settlement negotiations, and courtroom advocacy to protect your interests.'
    }
  ]

  return (
    <section id="services" className="bg-white">
      <div className="w-full  px-8 lg:px-16 py-8 pb-16 pt-28">
        {/* Section Header */}
        <div className="mb-8 fade-in">
          <p className="!text-[#150598] !font-medium mb-4">
            Explore All Practice Areas
          </p>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-medium leading-tight text-gray-900">
          Our Practice Areas
          </h2>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
          {services.map((service, index) => (
            <div 
              key={index}
              className="group py-4 pr-4 md:py-8 md:pr-8 border-r border-gray-300 transition-colors duration-300 fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Number */}
              <div className="text-[#150598] font-medium text-sm mb-6">
                {service.number}
              </div>

              {/* Title */}
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 leading-tight">
                {service.title}
              </h3>
              
              {/* Description */}
              <p className="text-gray-600 leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Services

