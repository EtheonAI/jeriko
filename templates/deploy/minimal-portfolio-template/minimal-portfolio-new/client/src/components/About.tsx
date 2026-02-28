import { motion } from 'framer-motion';
import placeholderPerson from '../assets/placeholder-person.webp';

const About = () => {
  return (
    <section className="pt-32 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-normal mb-6">About me</h2>
            <div className="text-lg space-y-4">
              <p>
                I'm Alex Chen, a passionate UI/UX Designer with <strong style={{ color: 'var(--brand-accent)' }}>8+ years of experience</strong> creating 
                digital experiences that bridge the gap between user needs and business goals. I've worked with 
                startups, agencies, and Fortune 500 companies to design everything from mobile apps to enterprise software.
              </p>
              <p>
                My approach combines <strong style={{ color: 'var(--brand-accent)' }}>user research, visual design, and prototyping</strong> to create solutions 
                that are not only beautiful but also functional and accessible. I believe great design should be invisible 
                to users while solving their problems effortlessly.
              </p>
              <p>
                I specialize in design systems, user research, interaction design, and usability testing. My work has 
                helped increase user engagement by 40% and improved conversion rates for numerous digital products.
              </p>
              <p>
                Currently based in San Francisco, I work remotely with teams worldwide, bringing a global perspective 
                to every project I take on.
              </p>
            </div>
          </motion.div>
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <img 
              src={placeholderPerson} 
              alt="Alex Chen - UI/UX Designer"
              className="rounded-2xl shadow-2xl max-w-sm w-full"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;

