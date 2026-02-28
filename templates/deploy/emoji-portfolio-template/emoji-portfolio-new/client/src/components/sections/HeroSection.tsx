import { motion } from 'framer-motion'
import Marquee from "react-fast-marquee"

const HeroSection = () => {
  const achievements = [
    { text: '15+ Live Apps', bgColor: 'bg-secondary', textColor: 'text-secondary-foreground', icon: '📱' },
    { text: '35+ Websites', bgColor: 'bg-accent', textColor: 'text-accent-foreground', icon: '💻' },
    { text: 'Full Stack Dev', bgColor: 'bg-primary/10', textColor: 'text-primary', icon: '🦄' },
    { text: 'UX Focused', bgColor: 'bg-muted', textColor: 'text-muted-foreground', icon: '🎨' },
    { text: 'Mobile First', bgColor: 'bg-secondary', textColor: 'text-secondary-foreground', icon: '📱' },
    { text: 'Cloud Native', bgColor: 'bg-primary/10', textColor: 'text-primary', icon: '☁️' },
    { text: 'React Expert', bgColor: 'bg-accent', textColor: 'text-accent-foreground', icon: '⚛️' },
    { text: 'Node.js Pro', bgColor: 'bg-muted', textColor: 'text-muted-foreground', icon: '🟢' },
    { text: 'TypeScript', bgColor: 'bg-secondary', textColor: 'text-secondary-foreground', icon: '🔷' },
    { text: 'API Design', bgColor: 'bg-accent', textColor: 'text-accent-foreground', icon: '🔌' },
    { text: 'Database Pro', bgColor: 'bg-primary/10', textColor: 'text-primary', icon: '🗄️' },
    { text: 'DevOps Ready', bgColor: 'bg-muted', textColor: 'text-muted-foreground', icon: '🐳' },
    { text: 'Testing Guru', bgColor: 'bg-secondary', textColor: 'text-secondary-foreground', icon: '🧪' },
    { text: 'Performance', bgColor: 'bg-accent', textColor: 'text-accent-foreground', icon: '⚡' },
    { text: 'Security First', bgColor: 'bg-primary/10', textColor: 'text-primary', icon: '🔒' },
    { text: 'Team Lead', bgColor: 'bg-muted', textColor: 'text-muted-foreground', icon: '👥' }
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  }

  const badgeVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 260,
        damping: 20
      }
    }
  }

  return (
    <section id="home" className="min-h-screen flex items-center justify-center bg-background">
      <div className="mx-auto text-center w-full">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Character Avatar */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-blue-100 flex items-center justify-center shadow-xl ring-4 ring-primary/20">
                <span className="text-8xl">👨‍💻</span>
              </div>
              <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <span className="text-primary-foreground text-lg">👋</span>
              </div>
            </div>
          </motion.div>

          {/* Main Heading */}
          <motion.div variants={itemVariants} className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-5xl sm:text-6xl lg:text-8xl font-black text-foreground leading-tight">
              Hi, I'm Alex Chen.
            </h1>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              Full-stack developer crafting digital experiences
            </p>
          </motion.div>

          {/* Achievement Badges */}
          <motion.div 
            variants={containerVariants}
            className="flex flex-wrap justify-center overflow-hidden"
          >
            <Marquee direction='left' className='py-2 w-full max-w-full' speed={30}>
            {achievements.slice(0, Math.ceil(achievements.length / 2)).map((achievement, index) => (
              <motion.div
                key={index}
                variants={badgeVariants}
                className={`${achievement.bgColor} ${achievement.textColor} mx-3 px-6 sm:px-8 py-3 sm:py-4 rounded-3xl text-base sm:text-lg font-bold flex items-center gap-3 transition-all duration-300 border border-white/30 hover:scale-105 flex-shrink-0`}
              >
                <span className="text-lg sm:text-xl">{achievement.icon}</span>
                  <span className="whitespace-nowrap">{achievement.text}</span>
                </motion.div>
              ))}
            </Marquee>
            <Marquee direction='right' className='py-2 w-full max-w-full' speed={30}>
            {achievements.slice(Math.ceil(achievements.length / 2)).map((achievement, index) => (
              <motion.div
                key={index}
                variants={badgeVariants}
                className={`${achievement.bgColor} ${achievement.textColor} mx-3 px-6 sm:px-8 py-3 sm:py-4 rounded-3xl text-base sm:text-lg font-bold flex items-center gap-3 transition-all duration-300 border border-white/30 hover:scale-105 flex-shrink-0`}
              >
                <span className="text-lg sm:text-xl">{achievement.icon}</span>
                  <span className="whitespace-nowrap">{achievement.text}</span>
                </motion.div>
              ))}
            </Marquee>
          </motion.div>

        </motion.div>
      </div>
    </section>
  )
}

export default HeroSection

