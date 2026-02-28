import { motion } from "framer-motion";
import { scrollToElement } from "@/utils/scrollUtils";
import heroImage from "@/assets/images/hero/hero-image.webp";

export function Hero() {
  return (
    <section className="bg-white py-20">
      <div className="container mx-auto px-6">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 mb-8 gap-2"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <p className="text-gray-600 text-lg mb-4">Welcome to Our Company</p>
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Professional Services
              <br />
              for Your Business
            </h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 lg:items-end justify-end">
            <button className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium text-base transition-colors lg:w-fit">
              Get Started
            </button>
            <button 
              className="bg-gray-400 hover:bg-gray-500 text-white px-6 py-2 rounded-lg font-medium text-base transition-colors lg:w-fit"
              onClick={() => scrollToElement('services')}
            >
              View services
            </button>
          </div>
        </motion.div>

        <motion.div
          className="order-1 lg:order-2"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <img
            src={heroImage}
            alt="Professional team working together"
            className="w-full h-[400px] lg:h-[1000px] object-cover rounded-lg grayscale"
          />
        </motion.div>
      </div>
    </section>
  );
}

