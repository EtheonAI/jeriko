import { motion } from 'framer-motion';
import { Marquee } from './magicui/marquee';

function Testimonials() {
  const testimonials = [
    {
      name: "Alex Rodriguez",
      company: "StreamForge",
      quote: "Task automation made easy! Teamflow simplified our processes. Smooth project coordination, increased productivity. Highly recommend!",
      avatar: "AR"
    },
    {
      name: "Ethan Harris",
      company: "FluxBoard",
      quote: "Teamflow is a creative hub! Simplifies collaboration, enhances creativity. A dream for any design team.",
      avatar: "EH"
    },
    {
      name: "Ava Reynolds",
      company: "Datara",
      quote: "Managing teams made delightful! Teamflow is the backbone of our HR operations. Efficient, user-friendly, and a lifesaver!",
      avatar: "AR"
    },
    {
      name: "Ryan Garcia",
      company: "Gridly",
      quote: "Teamflow transformed how we collaborate. Effortless project management, seamless communication. A game-changer for our team!",
      avatar: "RG"
    },
    {
      name: "John D.",
      company: "Vectra",
      quote: "Impressive security features! Data encryption, regular updates - it ensures our sensitive information is always protected. Seamless integration made the transition smooth.",
      avatar: "JD"
    },
    {
      name: "Harper Nelson",
      company: "OrbitDesk",
      quote: "Revolutionized our organization! From HR to project workflows, it's an all-in-one solution that saved us time and enhanced our decision-making.",
      avatar: "HN"
    },
    {
      name: "Ethan Harris",
      company: "Elevio",
      quote: "Navigating remote work made easy! Teamflow connects our team seamlessly. Task management, communication - all in one place!",
      avatar: "EH"
    },
    {
      name: "Sophie King",
      company: "Skylix",
      quote: "Incredible tool! Teamflow streamlined our workflows. Increased efficiency, improved communication. A must-have for any tech team!",
      avatar: "SK"
    },
    {
      name: "Alice M.",
      company: "Shapora",
      quote: "Financial tasks simplified! Teamflow streamlined our finance processes. Effortless, secure, and user-friendly. A financial team's best friend!",
      avatar: "AM"
    }
  ];

  // Split testimonials into 3 columns
  const column1 = [testimonials[0], testimonials[3], testimonials[6]]; // Alex, Ryan, Ethan
  const column2 = [testimonials[1], testimonials[4], testimonials[7]]; // Ethan, John, Sophie  
  const column3 = [testimonials[2], testimonials[5], testimonials[8]]; // Ava, Harper, Alice

  const TestimonialCard = ({ testimonial, size = "normal" }: { testimonial: typeof testimonials[0], size?: "normal" | "medium" | "large" }) => (
    <div className={`bg-gray-800/80 border border-gray-700/50 rounded-lg p-6 mb-4 backdrop-blur-sm hover:border-[#7C5DFA]/30 transition-all duration-300 ${
      size === "large" ? "min-h-[280px]" : size === "medium" ? "min-h-[240px]" : "min-h-[200px]"
    }`}>
      <p className="text-gray-300 leading-relaxed mb-6 text-sm">
        "{testimonial.quote}"
      </p>
      
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-[#7C5DFA] to-[#6B46C1] rounded-full flex items-center justify-center text-white font-bold text-sm">
          {testimonial.avatar}
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm">
            {testimonial.name}
          </h4>
          <p className="text-gray-400 text-xs">
            {testimonial.company}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="py-20 px-6 bg-gray-900 relative overflow-hidden">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="text-sm font-semibold text-[#7C5DFA] tracking-wider uppercase mb-4">
            TESTIMONIALS
          </h3>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            What Our Users Say
          </h2>
        </motion.div>
        
        {/* Desktop Layout */}
        <div className="hidden md:flex justify-center items-start gap-6 h-[700px] overflow-hidden max-w-5xl mx-auto">
          {/* First Column - Moving Up */}
          <div className="w-80">
            <Marquee vertical pauseOnHover className="h-full">
              <TestimonialCard testimonial={column1[0]} size="medium" />
              <TestimonialCard testimonial={column1[1]} size="large" />
              <TestimonialCard testimonial={column1[2]} size="normal" />
            </Marquee>
          </div>
          
          {/* Second Column - Moving Down */}
          <div className="w-80">
            <Marquee vertical reverse pauseOnHover className="h-full">
              <TestimonialCard testimonial={column2[0]} size="large" />
              <TestimonialCard testimonial={column2[1]} size="medium" />
              <TestimonialCard testimonial={column2[2]} size="normal" />
            </Marquee>
          </div>
          
          {/* Third Column - Moving Up */}
          <div className="w-80">
            <Marquee vertical pauseOnHover className="h-full">
              <TestimonialCard testimonial={column3[0]} size="normal" />
              <TestimonialCard testimonial={column3[1]} size="medium" />
              <TestimonialCard testimonial={column3[2]} size="large" />
            </Marquee>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden">
          <Marquee pauseOnHover className="h-[400px]">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="mr-4">
                <TestimonialCard testimonial={testimonial} size="normal" />
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

export default Testimonials;

