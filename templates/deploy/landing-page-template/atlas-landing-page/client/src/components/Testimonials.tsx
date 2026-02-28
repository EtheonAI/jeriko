import { useRef } from "react";

const testimonials = [
  {
    content:
      "Atlas robotic arms transformed our assembly line, handling precision tasks with consistent quality. 30% increase in output within three months.",
    author: "Sarah Chen",
    role: "VP of Operations, Axion Manufacturing",
    gradient: "bg-red-gradient-1",
  },
  {
    content:
      "Implementing Atlas in our fulfillment centers reduced workplace injuries by 40% while improving order accuracy. The learning capabilities are remarkable.",
    author: "Michael Rodriguez",
    role: "Director of Logistics, GlobalShip",
    gradient: "bg-red-gradient-2",
  },
  {
    content:
      "The Atlas assembly system adapted to our lab protocols faster than any robotic solution we've used. Perfect precision for delicate sample handling.",
    author: "Dr. Amara Patel",
    role: "Lead Scientist, BioAdvance Research",
    gradient: "bg-red-gradient-3",
  },
  {
    content:
      "As a mid-size manufacturer, we never thought precision robotic arms would be accessible. Atlas changed that with affordable automation solutions.",
    author: "Jason Lee",
    role: "CEO, Innovative Solutions Inc.",
    gradient: "bg-red-dark-1",
  },
];

interface TestimonialCardProps {
  content: string;
  author: string;
  role: string;
  gradient: string;
}

const TestimonialCard = ({
  content,
  author,
  role,
  gradient,
}: TestimonialCardProps) => {
  return (
    <div
      className={`${gradient} rounded-lg p-8 h-full flex flex-col justify-between text-white transform transition-transform duration-300 hover:-translate-y-2 relative overflow-hidden`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-white z-10"></div>

      <div className="relative z-0">
        <p className="text-xl mb-8 font-medium leading-relaxed pr-20">{`"${content}"`}</p>
        <div>
          <h4 className="font-semibold text-xl">{author}</h4>
          <p className="text-white/80">{role}</p>
        </div>
      </div>
    </div>
  );
};

const Testimonials = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section
      className="py-12 bg-white relative"
      id="testimonials"
      ref={sectionRef}
    >
      <div className="container px-6 lg:px-8 mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="atlas-chip">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-atlas-500 text-white mr-2">
              04
            </span>
            <span>Testimonials</span>
          </div>
        </div>

        <h2 className="text-5xl font-display font-bold mb-12 text-left">
          What others say
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={index}
              content={testimonial.content}
              author={testimonial.author}
              role={testimonial.role}
              gradient={testimonial.gradient}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;

