import officeInterior from "@/assets/images/office/office-interior.webp";

const LocationsBanner = ({ imageUrl, locations }: { imageUrl: string; locations: Array<{ name: string; address: string }> }) => {
  return (
    <div 
      className="container mx-auto rounded-lg relative h-[600px] bg-cover bg-center"
      style={{ backgroundImage: `url(${imageUrl})` }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30 rounded-lg"></div>
      
      {/* Location cards container */}
      <div className="h-full p-6 md:p-8 lg:p-12 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full lg:sticky lg:top-24">
          {locations.map((location, index) => (
            <div
              key={index}
              className="bg-white/20 backdrop-blur-sm border border-white/30 p-6 rounded-lg hover:bg-white/25 transition-all duration-300"
            >
              <h3 className="text-white text-xl md:text-2xl font-medium mb-3">
                {location.name}
              </h3>
              <p className="text-white/90 text-sm md:text-base mb-6">
                {location.address}
              </p>
              <button className="flex items-center text-white hover:text-white/80 transition-colors duration-200 group">
                <span className="text-sm md:text-base font-medium mr-2">View more</span>
                <svg 
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function LocationsWithBanner() {
  const offices = [
    {
      name: "New York Office",
      address: "308 Broadway Street",
    },
    {
      name: "Los Angeles Office", 
      address: "342 Sunset Boulevard",
    },
    {
      name: "Chicago Office",
      address: "4102 Michigan Avenue",
    },
  ];

  return (
    <section id="locations" className="bg-gray-50 py-20">
      <div className="container mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-4xl text-gray-900 mb-8">
            Find the right office for you
          </h2>
        </div>
        
        <LocationsBanner 
          imageUrl={officeInterior}
          locations={offices}
        />
      </div>
    </section>
  );
}

