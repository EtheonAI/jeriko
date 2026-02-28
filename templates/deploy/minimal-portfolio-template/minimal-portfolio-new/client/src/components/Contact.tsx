import { motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const Contact = () => {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto overflow-hidden">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-full"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal text-gray-700 mb-8 md:mb-12 leading-tight">
              Working together
            </h2>
            
            <div className="space-y-6 md:space-y-8 text-base md:text-lg text-gray-600 leading-relaxed max-w-full">
              <p className="break-words">
                I follow a <strong className="text-gray-800">pragmatic approach</strong> where we combine your 
                knowledge of your customer, product, and industry with 
                my design expertise. I work with quick check-ins instead 
                of big presentations.
              </p>
              
              <p className="break-words">
                Making things tangible fast creates clarity and sparks 
                discussion, helping us identify risks and uncover 
                potential.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="flex justify-center lg:justify-end mt-8 lg:mt-0"
          >
            <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-[32rem] lg:h-[32rem] flex items-center justify-center max-w-full">
              <DotLottieReact 
                src="/Circle.lottie"
                loop
                autoplay
                className="w-full h-full"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Contact;

