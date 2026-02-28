import { Marquee } from './magicui/marquee';

function TrustedBrands() {
  const brands = [
    { name: 'Logoipsum', logo: 'L' },
    { name: 'HOGO', logo: 'H' },
    { name: 'Dealvia', logo: 'D' },
    { name: 'Acme', logo: 'A' },
    { name: 'TechFlow', logo: 'T' },
    { name: 'Innovate', logo: 'I' },
    { name: 'Quantum', logo: 'Q' },
  ];

  return (
    <section className="py-16 px-6 bg-gray-900">
      <div className="container mx-auto text-center">
        <h2 className="text-sm font-semibold text-gray-400 tracking-wider uppercase mb-12">
          TRUSTED BY LEADING BRANDS
        </h2>
        
        <div className="w-full overflow-hidden">
          <Marquee className="py-6" pauseOnHover>
            {brands.map((brand, index) => (
              <div 
                key={index}
                className="flex items-center mx-12 px-4"
              >
                <div className="flex items-center space-x-3 text-gray-400 hover:text-white transition-colors duration-200">
                  <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg border border-gray-700">
                    {brand.logo}
                  </div>
                  <span className="text-xl font-semibold">{brand.name}</span>
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

export default TrustedBrands;

