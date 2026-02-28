import { motion } from 'framer-motion'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ProjectsSection = () => {
  const [currentProject, setCurrentProject] = useState(0)

  const projects = [
    {
      id: 1,
      title: "EcoTracker",
      description: "A sustainability tracking app that helps companies monitor and reduce their carbon footprint.",
      testimonial: {
        text: "This platform transformed how we approach sustainability. Clean interface, powerful analytics.",
        author: "Sarah M.",
        role: "Sustainability Director"
      },
      image: "/placeholder-mountain.webp",
      tags: ["React", "Node.js", "Analytics"]
    },
    {
      id: 2,
      title: "TaskFlow",
      description: "Modern project management tool with real-time collaboration and intelligent automation.",
      testimonial: {
        text: "Finally, a project management tool that doesn't get in our way. Intuitive and powerful.",
        author: "Mike T.",
        role: "Product Manager"
      },
      image: "/placeholder-mountain.webp",
      tags: ["TypeScript", "WebSocket", "MongoDB"]
    },
    {
      id: 3,
      title: "ArtSpace",
      description: "Digital gallery platform for artists to showcase and sell their work online.",
      testimonial: {
        text: "Beautiful, fast, and easy to use. My art has never looked better online.",
        author: "Emma L.",
        role: "Digital Artist"
      },
      image: "/placeholder-mountain.webp",
      tags: ["Next.js", "Stripe", "AWS"]
    }
  ]

  const nextProject = () => {
    setCurrentProject((prev) => (prev + 1) % projects.length)
  }

  const prevProject = () => {
    setCurrentProject((prev) => (prev - 1 + projects.length) % projects.length)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
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

  const project = projects[currentProject]

  return (
    <section id="projects" className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="bg-gray-50 rounded-3xl shadow-xl p-8 sm:p-12 lg:p-16"
        >
          {/* Section Header */}
          <motion.div variants={itemVariants} className="text-center mb-16">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              PROJECTS
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
              Latest Projects
            </h2>
          </motion.div>

          {/* Project Showcase */}
          <motion.div variants={itemVariants} className="relative">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Project Info */}
              <div className="space-y-6">
                {/* Testimonial */}
                <div className="bg-blue-50 p-6 rounded-xl">
                  <blockquote className="text-lg text-gray-700 mb-4">
                    "{project.testimonial.text}"
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-300 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {project.testimonial.author.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{project.testimonial.author}</p>
                      <p className="text-sm text-gray-500">{project.testimonial.role}</p>
                    </div>
                  </div>
                </div>

                {/* Project Details */}
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{project.title}</h3>
                  <p className="text-gray-600 mb-4">{project.description}</p>
                  
                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {project.tags.map((tag, index) => (
                      <span 
                        key={index}
                        className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Button className="gap-2">
                    Read More
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Project Image */}
              <div className="relative">
                <img 
                  src={project.image} 
                  alt={project.title}
                  className="w-full h-80 object-cover rounded-xl shadow-lg"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl"></div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={prevProject}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>

              {/* Dots */}
              <div className="flex gap-2">
                {projects.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentProject(index)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentProject ? 'bg-blue-400' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={nextProject}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

export default ProjectsSection

