import { Instagram, Youtube, Twitter } from 'lucide-react';

const FooterSection = () => {
  return (
    <section className="py-20 bg-[#F2F2F2] relative overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-5xl lg:text-6xl font-black mb-6">
            <span className="gradient-text">Questions?</span>
            <br />
            <span className="gradient-text">We're Here to Help!</span>
          </h2>
          
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Get support, learn more about our games, and join our community
          </p>
        </div>

        {/* Contact and Support Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* For Kids */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] p-6 text-center">
            <div className="text-4xl mb-4">👶</div>
            <h3 className="text-xl font-black mb-3">For Kids</h3>
            <p className="text-gray-600 mb-4">Check out our Help Heroes Guide with fun tutorials and tips!</p>
            <button className="bg-[#FF714B] text-white border-4 border-black font-bold px-6 py-3 hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
              Help Heroes Guide
            </button>
          </div>

          {/* For Parents */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] p-6 text-center">
            <div className="text-4xl mb-4">👨‍👩‍👧‍👦</div>
            <h3 className="text-xl font-black mb-3">For Parents</h3>
            <p className="text-gray-600 mb-4">Visit our Parent Resource Center for safety guides and account management.</p>
            <button className="bg-[#C71E64] text-white border-4 border-black font-bold px-6 py-3 hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
              Parent Resources
            </button>
          </div>

          {/* Social Links */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] p-6 text-center">
            <div className="text-4xl mb-4">📱</div>
            <h3 className="text-xl font-black mb-3">Follow Us</h3>
            <p className="text-gray-600 mb-4">Latest game updates and fun activities</p>
            <div className="flex gap-3 justify-center">
              <a href="#" className="w-12 h-12 bg-[#C71E64] border-4 border-black flex items-center justify-center text-white hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
                <Instagram className="w-6 h-6" />
              </a>
              <a href="#" className="w-12 h-12 bg-[#FF714B] border-4 border-black flex items-center justify-center text-white hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
                <Youtube className="w-6 h-6" />
              </a>
              <a href="#" className="w-12 h-12 bg-[#4D2D8C] border-4 border-black flex items-center justify-center text-white hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
                <Twitter className="w-6 h-6" />
              </a>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-[#FF714B] to-[#C71E64] border-4 border-black shadow-[8px_8px_0px_0px_#000000] max-w-4xl mx-auto p-8 text-white">
            <h3 className="text-4xl font-black mb-4">PixelPlay Kids</h3>
            <p className="text-xl mb-6 opacity-90">
              Where Learning Meets Adventure!
            </p>
            <div className="text-lg font-bold mb-6">
              Safe. Fun. Educational. Unforgettable.
            </div>
            <button className="bg-white text-[#FF714B] border-4 border-black font-bold px-8 py-4 hover:shadow-[4px_4px_0px_0px_#000000] transition-all text-lg">
              Start Your Adventure Now!
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FooterSection;

