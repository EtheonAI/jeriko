import { motion } from 'framer-motion';

function StatsSection() {
  return (
    <motion.div 
      className="container mt-16 mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 mb-16"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center">
        <h2 className="text-4xl font-bold text-blue-500">20M+</h2>
        <p className="text-blue-500/80">Downloads</p>
      </div>
      
      <div className="text-center">
        <h2 className="text-4xl font-bold text-blue-500">270K</h2>
        <p className="text-blue-500/80">Reviews</p>
      </div>
      
      <div className="text-center">
        <h2 className="text-4xl font-bold text-blue-500">4.7</h2>
        <p className="text-blue-500/80">Ratings</p>
      </div>
      
      <div className="text-center">
        <h2 className="text-4xl font-bold text-blue-500">Editors'</h2>
        <p className="text-blue-500/80">Choice</p>
        <p className="text-sm text-blue-500/70">Google Play</p>
      </div>
    </motion.div>
  );
}

export default StatsSection;

