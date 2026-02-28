import { motion } from 'framer-motion';
import placeholderPerson from '../assets/placeholder-person.webp';

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  title: string;
  avatar: string;
}

const Testimonials = () => {
  const testimonials: Testimonial[] = [
    {
      id: 1,
      quote: "NAME brings clarity, structure, and real impact. He cuts through the noise, makes things actionable, and drives results that actually matter. With him, design isn't just about making things look good—it's smart, user-focused, and strategic.",
      name: "Alex Chen",
      title: "Product Lead – TechVision",
      avatar: placeholderPerson
    },
    {
      id: 2,
      quote: "NAME always tries to get us the most value out of the available time and budget. The result is always on point! He quickly understands the challenges we are facing, and the designed solutions take the bigger picture and possible next steps into account. Since working with NAME, support questions around our interface were cut in half, and time and costs for validating new product ideas lowered. Our collaboration over the last two years has been very uncomplicated, trusting, pleasant, and productive. I definitely recommend working with NAME!",
      name: "Luisa Bunzel",
      title: "Co-Founder & CPO – Monday.Rocks",
      avatar: placeholderPerson
    },
    {
      id: 3,
      quote: "We worked with NAME from the first experiment all the way to the launch of our first MVP. He is conceptual and strategical strong but can also switch to hands-on design. This created flexibility and allowed us to move forward quickly. NAME works fast, understands quickly, and is fun to work with. He created processes and structures that really helped clarify what to build next and made it possible to build up the initial design and development team quickly. Highly recommended!",
      name: "Tim Krengel",
      title: "Co-Founder – Cloom, Investor",
      avatar: placeholderPerson
    },
    {
      id: 4,
      quote: "NAME joined us, when I as a founder was still trying to self-teach myself design and creating screens for the first version of our product. He brought exactly the level of drive, structure, and experience I was missing. He helped us understand the value and impact of good design.",
      name: "Marcus Weber",
      title: "Co-Founder – Flowstate",
      avatar: placeholderPerson
    }
  ];

  return (
    <section className="pt-32 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-normal mb-12">What clients say about me</h2>
        <div className="columns-1 md:columns-2 gap-8 space-y-8">
          {testimonials.map((testimonial) => (
            <motion.div
              key={testimonial.id}
              className="bg-brand-light/20 text-white p-8 rounded-xl break-inside-avoid mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: testimonial.id * 0.1 }}
              viewport={{ once: true }}
            >
              <blockquote className="text-lg mb-6 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>
              <div className="flex items-center">
                <img 
                  src={testimonial.avatar} 
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full mr-4"
                />
                <div>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-teal-200 text-sm">{testimonial.title}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;

