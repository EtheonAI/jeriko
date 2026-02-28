import { motion } from "framer-motion";
import { Marquee } from "@/components/magicui/marquee";
import clientOne from "@/assets/images/testimonials/client-one.webp";
import clientTwo from "@/assets/images/testimonials/client-two.webp";
import clientThree from "@/assets/images/testimonials/client-three.webp";

export function Testimonials() {
    const testimonials = [
      {
        quote:
          "The team at Our Company delivered exceptional results that exceeded our expectations. Their professional approach and attention to detail made the entire process smooth and stress-free. Highly recommend their services!",
        author: "Jessica T.",
        image: clientOne,
      },
      {
        quote:
          "Our Company transformed our business operations! Their strategic expertise and dedicated support team made the implementation seamless. We couldn't be happier with the outcomes.",
        author: "Michael R.",
        image: clientTwo,
      },
      {
        quote:
          "Outstanding service from start to finish! The professionals at Our Company go above and beyond to ensure client success. Our entire organization trusts their expertise!",
        author: "Samantha L.",
        image: clientThree,
      },
    ];
  
    // Testimonial Card Component
    const TestimonialCard = ({ testimonial }: { testimonial: typeof testimonials[0] }) => (
      <div className="bg-gray-50 p-8 rounded-lg mx-4 w-96 flex-shrink-0 min-h-64 flex flex-col">
        <div className="flex-grow">
          <h3 className="text-lg text-gray-900 leading-relaxed">
            "{testimonial.quote}"
          </h3>
        </div>
        <div className="flex items-center mt-6 pt-6">
          <img
            src={testimonial.image}
            alt={testimonial.author}
            className="w-12 h-12 rounded-full object-cover mr-4"
          />
          <div>
            <p className="font-semibold text-gray-900">
              {testimonial.author}
            </p>
          </div>
        </div>
      </div>
    );
  
    return (
      <section className="bg-white py-20">
        <div className="container mx-auto px-6">
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl text-gray-900 mb-4">
              Real experiences & stories from our clients
            </h2>
          </motion.div>
  
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Marquee
              pauseOnHover={true}
              className="[--duration:30s]"
            >
              {testimonials.map((testimonial, index) => (
                <TestimonialCard key={index} testimonial={testimonial} />
              ))}
            </Marquee>
          </motion.div>
        </div>
      </section>
    );
  }

