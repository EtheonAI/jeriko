import { motion } from 'framer-motion';

function Home() {
  return (
    <section id="home" className="bg-gradient-to-br from-blue-700 to-blue-400 min-h-screen flex items-center relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 right-0 w-full h-full">
        <div className="absolute top-20 right-20 w-40 h-40 rounded-full bg-white/10"></div>
        <div className="absolute bottom-40 left-20 w-60 h-60 rounded-full bg-white/5"></div>
      </div>
      
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col lg:flex-row items-center">
          {/* Left Content */}
          <motion.div 
            className="w-full lg:w-1/2 lg:pr-16 mb-12 lg:mb-0"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Budget with confidence.
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-lg">
              Take control of your finances with our smart budgeting tools. Track expenses, set savings goals, and receive personalized insights to help you make the most of your money.</p>
            
            <div className="flex justify-left space-x-4 mb-8">
              <img 
                src="/assets/appstore-button.webp"
                alt="Download on App Store" 
                className="h-12 cursor-pointer hover:opacity-80 transition-opacity"
              />
              <img 
                src="/assets/playstore-button.webp"
                alt="Download on Google Play" 
                className="h-12 cursor-pointer hover:opacity-80 transition-opacity"
              />
            </div>

            <div className="space-y-4">
              <p className="text-sm text-white font-medium">As featured in</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <img src="/assets/logoipsum1.webp" alt="Logo 1" className="h-6 opacity-60" />
                <img src="/assets/logoipsum2.webp" alt="Logo 2" className="h-6 opacity-60" />
                <img src="/assets/logoipsum3.webp" alt="Logo 3" className="h-6 opacity-60" />
                <img src="/assets/logoipsum4.webp" alt="Logo 4" className="h-6 opacity-60" />
                <img src="/assets/logoipsum5.webp" alt="Logo 5" className="h-6 opacity-60" />
                <img src="/assets/logoipsum6.webp" alt="Logo 6" className="h-6 opacity-60" />
              </div>
            </div>
          </motion.div>

          {/* Right Content - Single Phone Mockup */}
          <motion.div 
            className="w-full lg:w-1/2"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="relative mx-auto flex justify-center">
              {/* Single Phone Display */}
              <div className="relative z-10" style={{ maxWidth: '500px' }}>
                <img 
                  src="/assets/mobile.webp" 
                  alt="Mobile App" 
                  className="w-full h-auto max-w-sm mx-auto drop-shadow-2xl"
                  style={{ 
                    filter: 'drop-shadow(0 25px 50px rgba(0, 0, 0, 0.25))',
                    mixBlendMode: 'multiply',
                    background: 'transparent'
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default Home;

