import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { RainbowButton } from './magicui/rainbow-button';
import crmDashboard from '../assets/crm-dashboard.webp';

function Hero() {
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end']
  });
  
  // Transform for 3D rotation effect - starts inclined and becomes upright
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [15, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.9, 1]);

  return (
    <section ref={container} className="relative py-20 px-6 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-dark)] via-[var(--bg-dark-alt)] to-[var(--bg-dark)]"></div>
      
      <div className="relative container mx-auto text-center">
        {/* Main content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto mb-4"
        >
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-b from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent">
              Your Deals, Clients & Tasks
              <br />
              All in One Dashboard
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-[var(--text-secondary)] mb-8 max-w-3xl mx-auto leading-relaxed">
            Track performance, manage pipelines, and close deals faster with a CRM built for modern teams
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <RainbowButton size="lg">
              Get Started Free
            </RainbowButton>
          </div>
        </motion.div>
        
        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          style={{
            rotateX: rotateX,
            scale: scale,
            transformPerspective: 1000,
            transformStyle: 'preserve-3d'
          }}
          className="relative max-w-6xl mx-auto"
          >
            <img 
              src={crmDashboard} 
              alt="CRM Dashboard" 
              className="w-full rounded-lg shadow-2xl border border-[var(--bg-muted)]"
            />
          </motion.div>
      </div>
    </section>
  );
}

export default Hero;

