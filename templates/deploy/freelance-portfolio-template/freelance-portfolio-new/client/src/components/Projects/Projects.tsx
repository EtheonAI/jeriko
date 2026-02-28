import React from 'react'

const Projects = () => {
  const projects = [
    {
      id: 1,
      name: 'Driplo',
      category: 'Brand Refresh',
      image: '/kTzATMLLTFjv.webp'
    },
    {
      id: 2,
      name: 'Nestrow',
      category: 'Brand Strategy',
      image: '/17MZakDnNRkb.webp'
    },
    {
      id: 3,
      name: 'Solaro',
      category: 'Packaging Design',
      image: '/57hf5nugr2Rl.webp'
    },
    {
      id: 4,
      name: 'Velina',
      category: 'Logo Design',
      image: '/SKOYyGuxUSDd.webp'
    }
  ]

  return (
    <section id="projects" className="py-12 sm:py-16 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto w-full h-full px-4 sm:px-6 lg:px-8">       
        <div className="flex items-center justify-between mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight max-w-4xl">
            Here's how we turn
            <br className="hidden sm:block" />
            vision into thoughtful
            <br className="hidden sm:block" />
            design and strategy
          </h2>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative overflow-hidden rounded-2xl aspect-[4/3] bg-gray-100 cursor-pointer"
            >
              <img
                src={project.image}
                alt={project.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {project.name}
                  </h3>
                  <p className="text-gray-600">
                    {project.category}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Projects

