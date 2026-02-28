import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

const Services = () => {
  const services = [
    {
      id: 'discovery',
      title: 'Product Discovery'
    },
    {
      id: 'design',
      title: 'Product Design'
    },
    {
      id: 'leadership',
      title: 'Fractional Leadership'
    }
  ];

  return (
    <section className="px-6 pb-20" style={{ backgroundColor: 'var(--brand-dark)', color: 'white' }}>
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-medium text-white mb-12">
          What I can do for you
        </h2>
        <div className="space-y-6">
          {services.map((service, index) => (
            <motion.div
              key={service.id}
              className="bg-black rounded-2xl overflow-hidden hover:bg-gray-900 transition-colors cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="flex items-center justify-between px-6 py-4">
                <p className="text-xl md:text-2xl font-light text-white">
                  {service.title}
                </p>
                <ChevronRight className="w-8 h-8 text-white" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;

