import { motion } from 'framer-motion'

const Hero = () => {
  return (
    <section className="hero-section relative h-screen flex items-end justify-center overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('/images/hero.webp')`,
        }}
      ></div>

      {/* Content */}
      <div className="relative z-10 text-center text-white pb-4">
        <div className="flex flex-row items-center justify-between">
          <motion.p
            className="text-lg mb-4 font-light tracking-wide"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            We're getting married
          </motion.p>



          <motion.p
            className="text-xl font-light tracking-wide"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            Saturday, 15 June, 2025
          </motion.p>
        </div>
        <motion.h1
          className="text-9xl font-serif"
          style={{ fontSize: 'clamp(4rem, 15vw, 12rem)' }}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Emma & Karl
        </motion.h1>
      </div>
    </section>
  )
}

export default Hero

