import React, { useRef, useMemo } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const PortfolioSection = () => {
  const container = useRef(null)
  
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start end', 'end start']
  })
  
  // Transform values - hooks must be at top level
  const leftColumnY = useTransform(scrollYProgress, [0, 1], [-10, -200])
  const middleColumnY = useTransform(scrollYProgress, [0, 1], [0, -400])
  const rightColumnY = useTransform(scrollYProgress, [0, 1], [-10, -200])

  const portfolioProjects = useMemo(() => [
    { 
      id: 1, 
      src: '/V5OUKkpWed6Z.webp',
      alt: 'E-commerce Platform Interface',
      title: 'NextGen Commerce',
      category: 'Web Development',
      description: 'Modern e-commerce platform with seamless user experience and advanced analytics'
    },
    { 
      id: 2, 
      src: '/IMCxwaCN7BB6.webp',
      alt: 'Mobile Banking Application',
      title: 'FinTech Mobile App',
      category: 'Mobile Development',
      description: 'Secure banking app with intuitive design and cutting-edge security features'
    },
    { 
      id: 3, 
      src: '/57hf5nugr2Rl.webp',
      alt: 'SaaS Dashboard Design',
      title: 'CloudSync Dashboard',
      category: 'UI/UX Design',
      description: 'Comprehensive dashboard for data visualization and team collaboration'
    },
    { 
      id: 4, 
      src: '/UDuON5X6QCKh.webp',
      alt: 'Brand Identity System',
      title: 'TechStart Branding',
      category: 'Brand Design',
      description: 'Complete brand identity system for innovative technology startup'
    },
    { 
      id: 5, 
      src: '/4T76wXssCDf4.webp',
      alt: 'Learning Management System',
      title: 'EduPlatform LMS',
      category: 'EdTech Solution',
      description: 'Interactive learning platform with gamification and progress tracking'
    },
    { 
      id: 6, 
      src: '/cl6aJjv0hxZW.webp',
      alt: 'Healthcare Portal Design',
      title: 'MedConnect Portal',
      category: 'Healthcare Tech',
      description: 'Patient portal connecting healthcare providers with seamless communication'
    }
  ], [])

  const ProjectCard = React.memo(({ project, index, columnIndex }: { project: typeof portfolioProjects[0], index: number, columnIndex: number }) => (
    <div 
      key={project.id}
      className="group relative overflow-hidden rounded-2xl aspect-[4/5] cursor-pointer hover-lift"
      style={{ 
        animationDelay: `${(columnIndex * 2 + index) * 0.1}s`,
        willChange: 'transform' // Optimize for animations
      }}
    >
      <img
        src={project.src}
        alt={project.alt}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Project Info Overlay - Simplified for better performance */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
        <span className="inline-block text-xs text-amber-400 font-medium bg-amber-400/20 px-3 py-1 rounded-full mb-3">
          {project.category}
        </span>
        <h3 className="text-xl font-bold mb-2">
          {project.title}
        </h3>
        <p className="text-sm text-gray-200 leading-relaxed">
          {project.description}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-gray-300">View Project</span>
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>
    </div>
  ))

  return (
    <section ref={container} id="portfolio" className="pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Mobile: Single Image */}
        <div className="block lg:hidden">
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <ProjectCard 
                key={portfolioProjects[0].id} 
                project={portfolioProjects[0]} 
                index={0} 
                columnIndex={0} 
              />
            </div>
          </div>
        </div>

        {/* Desktop: Portfolio Columns */}
        <div className="hidden lg:flex flex-row gap-6">
          {/* First Column */}
          <motion.div 
            className="flex-1 flex flex-col gap-6" 
            style={{ y: leftColumnY, willChange: 'transform' }}
          >
            {portfolioProjects.slice(0, 2).map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} columnIndex={0} />
            ))}
          </motion.div>

          {/* Second Column (Middle) - with top padding */}
          <motion.div 
            className="flex-1 flex flex-col gap-6 pt-0 lg:pt-16" 
            style={{ y: middleColumnY, willChange: 'transform' }}
          >
            {portfolioProjects.slice(2, 4).map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} columnIndex={1} />
            ))}
          </motion.div>

          {/* Third Column */}
          <motion.div 
            className="flex-1 flex flex-col gap-6" 
            style={{ y: rightColumnY, willChange: 'transform' }}
          >
            {portfolioProjects.slice(4, 6).map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} columnIndex={2} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default PortfolioSection

