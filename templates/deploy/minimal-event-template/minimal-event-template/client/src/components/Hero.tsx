import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";

function Hero() {
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end start']
  });
  
  const yBackground = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const yText = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const yButtons = useTransform(scrollYProgress, [0, 1], [0, -300]);

  return (
    <div ref={container} className="relative min-h-screen w-full overflow-hidden">
      <motion.div 
        style={{ y: yBackground }}
        className="absolute inset-0 w-full h-[120%] bg-[url('/image/event.webp')] bg-cover bg-no-repeat"
      />
      <div className="absolute inset-0 h-full w-full bg-gray-900/60" />
      <div className="grid min-h-screen px-8">
        <div className="container relative z-10 my-auto mx-auto grid place-items-center text-center">
          <motion.div style={{ y: yText }}>
            <h3 className="mb-2 text-2xl font-medium text-white">
              29-31 August @ New York
            </h3>
            <h1 className="text-5xl lg:text-6xl font-bold text-white lg:max-w-3xl">
              AI Conference 2023: Unlocking the Future
            </h1>
            <p className="mt-1 mb-12 text-lg text-white w-full md:max-w-full lg:max-w-2xl">
              Join us for the most anticipated event of the year - the AI
              Conference 2023!
            </p>
          </motion.div>
          <motion.div style={{ y: yButtons }} className="flex items-center gap-4">
            <Button 
              variant="secondary" 
              size="lg"
              className="bg-white text-gray-900 hover:bg-gray-100"
            >
              Get started
            </Button>
            <Button 
              size="icon"
              className="rounded-full bg-white p-6 h-14 w-14 hover:bg-gray-100"
            >
              <Play className="h-4 w-4 text-gray-900 fill-gray-900" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default Hero;

