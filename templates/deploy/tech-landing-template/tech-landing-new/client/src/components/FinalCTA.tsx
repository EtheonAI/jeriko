import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

function FinalCTA() {
  return (
    <section className="py-20 px-6">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-[#6B46C1] rounded-2xl p-12 md:p-16 text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Get Started Today
          </h2>
          
          <div className="max-w-2xl mx-auto mb-8">
            <p className="text-xl text-orange-100">
              Transform the way you manage deals, clients, and tasks.
            </p>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl inline-flex items-center space-x-2"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>
          <p className="text-orange-100 mt-4">No credit card required.</p>
        </motion.div>
      </div>
    </section>
  );
}

export default FinalCTA;

