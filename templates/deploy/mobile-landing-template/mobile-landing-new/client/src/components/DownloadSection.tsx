import { motion } from 'framer-motion';

function DownloadSection() {
  return (
    <section className="bg-blue-500 py-16 relative overflow-hidden">
      {/* Background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -bottom-20 w-64 h-64 rounded-full bg-blue-400/30"></div>
        <div className="absolute left-40 top-10 w-40 h-40 rounded-full bg-blue-400/20"></div>
      </div>

      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mb-6"
          >
            <div className="bg-white w-20 h-20 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <img 
                src="/assets/logo.webp"
                alt="Zenith Logo" 
                className="w-12 h-12"
              />
            </div>
          </motion.div>
          
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Download Zenith
            </h2>
            <p className="text-white/90 text-lg mb-8">
              Manage your asset more conveniently.
            </p>
            
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.a 
                href="#" 
                className="inline-flex items-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img 
                  src="/assets/playstore-button.webp"
                  alt="Download on Google Play" 
                  className="h-12 w-auto cursor-pointer"
                />
              </motion.a>
              <motion.a 
                href="#" 
                className="inline-flex items-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img 
                  src="/assets/appstore-button.webp"
                  alt="Download on App Store" 
                  className="h-12 w-auto cursor-pointer"
                />
              </motion.a>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

export default DownloadSection;

