import { motion } from 'framer-motion'

const TechStackSection = () => {
  const techStack = {
    frontend: [
      { 
        name: "React", 
        description: "For building fast, interactive UIs",
        icon: "⚛️",
        color: "bg-blue-100 text-blue-600"
      },
      { 
        name: "Next.js", 
        description: "React framework with routing & SSR",
        icon: "▲",
        color: "bg-gray-100 text-gray-800"
      },
      { 
        name: "TypeScript", 
        description: "Typed JavaScript for safer code",
        icon: "TS",
        color: "bg-blue-100 text-blue-600"
      }
    ],
    backend: [
      { 
        name: "Node.js", 
        description: "JavaScript runtime for servers",
        icon: "🟢",
        color: "bg-blue-100 text-blue-600"
      },
      { 
        name: "Express", 
        description: "Minimal framework for APIs",
        icon: "🚀",
        color: "bg-gray-100 text-gray-800"
      },
      { 
        name: "MongoDB", 
        description: "Flexible NoSQL database system",
        icon: "🍃",
        color: "bg-blue-100 text-blue-600"
      }
    ],
    tools: [
      { 
        name: "Git & GitHub", 
        description: "Version control and collaboration",
        icon: "🐙",
        color: "bg-gray-100 text-gray-800"
      },
      { 
        name: "Docker", 
        description: "Containers for isolated environments",
        icon: "🐳",
        color: "bg-blue-100 text-blue-600"
      }
    ],
    design: [
      { 
        name: "Figma", 
        description: "UI design and collaboration tool",
        icon: "🎨",
        color: "bg-blue-100 text-blue-800"
      },
      { 
        name: "Notion", 
        description: "Planning and docs in one place",
        icon: "📝",
        color: "bg-gray-100 text-gray-800"
      }
    ]
  }

  const categories = [
    { key: 'frontend', title: 'Frontend', items: techStack.frontend },
    { key: 'backend', title: 'Backend', items: techStack.backend },
    { key: 'tools', title: 'Tools & DevOps', items: techStack.tools },
    { key: 'design', title: 'Design & Workflow', items: techStack.design }
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.6
      }
    }
  }

  const cardVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  }

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {/* Section Header */}
          <motion.div variants={itemVariants} className="text-center mb-16">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              TECH STACK
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              What I Use
            </h2>
          </motion.div>

          {/* Tech Categories */}
          <div className="grid md:grid-cols-2 gap-8">
            {categories.map((category) => (
              <motion.div
                key={category.key}
                variants={itemVariants}
                className="space-y-4"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  {category.title}
                </h3>
                <div className="space-y-3">
                  {category.items.map((tech, techIndex) => (
                    <motion.div
                      key={techIndex}
                      variants={cardVariants}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-lg ${tech.color} flex items-center justify-center text-lg font-bold`}>
                          {tech.icon}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">
                            {tech.name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {tech.description}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom Decoration */}
          <motion.div 
            variants={itemVariants}
            className="flex justify-center mt-16"
          >
            <div className="flex gap-4">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
              <div className="w-3 h-3 bg-blue-700 rounded-full"></div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

export default TechStackSection

