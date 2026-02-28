const HeroSection = () => {
  return (
    <section className="relative min-h-screen bg-[#F2F2F2] overflow-hidden">
      <div className="container mx-auto px-6 py-8 lg:py-12">
        {/* Studio Name - Large and Prominent */}
        <div className="text-center mb-8 lg:mb-12">
          <h1 className="text-7xl lg:text-9xl font-black leading-none">
            <span className="gradient-text">PixelPlay Kids</span>
          </h1>
          <p className="text-xl lg:text-2xl font-bold text-[#4D2D8C] mt-4">
            Where Every Game is an Adventure!
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left side - Content */}
          <div className="space-y-8 order-2 lg:order-1">
            {/* Description */}
            <p className="text-lg lg:text-xl text-gray-700 leading-relaxed text-center lg:text-left">
              Ready to jump into amazing worlds? At PixelPlay Kids, we create magical gaming experiences 
              that spark imagination, build friendships, and make learning super fun! Join over 2 million 
              young adventurers already playing our games!
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
              <button className="bg-[#FF714B] text-white border-4 border-black font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] px-8 py-4 text-lg">
                Play Now - It's Free!
              </button>
              <button className="bg-[#4D2D8C] text-white border-4 border-black font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] px-8 py-4 text-lg">
                Watch Trailers
              </button>
            </div>

            {/* App Store Links */}
            <div className="flex gap-4 justify-center lg:justify-start">
              <img 
                src="/app-store.svg" 
                alt="Download on App Store" 
                className="h-14 transition-all duration-200 hover:scale-105 cursor-pointer"
              />
              <img 
                src="/google-store.svg" 
                alt="Get it on Google Play" 
                className="h-14 transition-all duration-200 hover:scale-105 cursor-pointer"
              />
            </div>
          </div>
          
          {/* Right side - Large Game Image */}
          <div className="flex justify-center order-1 lg:order-2">
            <div className="relative">
              {/* Large Pixel-style frame */}
              <div className="bg-white border-6 border-black shadow-[12px_12px_0px_0px_#000000] transition-all duration-200 hover:shadow-[16px_16px_0px_0px_#000000] hover:translate-x-[-3px] hover:translate-y-[-3px] w-96 h-96 lg:w-[500px] lg:h-[500px] flex items-center justify-center overflow-hidden">
                <img 
                  src="/pet_paradise_island_banner.webp" 
                  alt="Pet Paradise Island - A magical tropical adventure with children and animals" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

