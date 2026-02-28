import { motion } from "framer-motion";
import serviceOne from "@/assets/images/services/service-one.webp";
import serviceTwo from "@/assets/images/services/service-two.webp";
import serviceThree from "@/assets/images/services/service-three.webp";

export function Services() {
  const services = [
    {
      title: "Consulting Services",
      image: serviceOne,
    },
    { title: "Strategic Planning", image: serviceTwo },
    {
      title: "Implementation Support",
      image: serviceThree,
    },
  ];

  return (
    <section id="services" className="bg-gray-50 py-20">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          <h2 className="text-4xl text-gray-900 mb-8">
            We deliver exceptional professional services
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {services.map((service, index) => (
            <motion.div
              key={index}
              className="relative group cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
            >
              <div 
                className="relative h-[400px] md:h-[500px] lg:h-[600px] rounded-lg bg-cover bg-center overflow-hidden"
                style={{ backgroundImage: `url(${service.image})` }}
              >
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-all duration-300"></div>
                
                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
                  <h3 className="text-white text-2xl md:text-3xl lg:text-4xl font-semibold mb-4">
                    {service.title}
                  </h3>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

