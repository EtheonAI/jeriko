import Marquee from "react-fast-marquee"

const MarqueeSeparator = () => {
  const trustedCompanies = [
    "TechCorp Solutions",
    "Global Industries",
    "Innovation Partners",
    "Business Dynamics",
    "Enterprise Group",
    "Strategic Ventures",
    "Professional Services",
    "Corporate Solutions",
    "Development Partners",
    "Growth Enterprises",
    "Success Industries",
    "Premier Holdings",
    "Elite Consulting",
    "Advanced Systems",
    "Future Technologies"
  ]

  return (
    <section className="py-12 bg-[#150598] overflow-hidden">
      <div className="w-full">
        <div className="text-left mb-8 px-4 sm:px-8 lg:px-16">
          <p className="!text-white font-medium text-sm sm:text-base">Trusted by leading organizations</p>
        </div>
        
        <div className="overflow-hidden">
          <Marquee
            gradient={true}
            gradientColor="rgb(21, 5, 152)"
            gradientWidth={100}
            speed={50}
            pauseOnHover={true}
            className="py-4 overflow-hidden"
            style={{ overflow: 'hidden' }}
          >
            {trustedCompanies.map((company, index) => (
              <div
                key={index}
                className="mx-6 sm:mx-8 flex-shrink-0"
              >
                <span className="text-white font-bold whitespace-nowrap text-base sm:text-lg select-none">
                  {company}
                </span>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  )
}

export default MarqueeSeparator

