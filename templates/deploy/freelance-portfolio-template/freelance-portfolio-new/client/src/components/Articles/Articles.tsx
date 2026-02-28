import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const Articles = () => {
  const articles = [
    {
      id: 1,
      title: 'Creating Timeless Interior Designs',
      category: 'Design Philosophy',
      date: 'Feb 12, 2025',
      image: '/V5OUKkpWed6Z.webp',
      featured: true,
      color: 'bg-amber-100'
    },
    {
      id: 2,
      title: 'Color Psychology in Interior Design',
      category: 'Color Theory',
      featured: false,
      color: 'bg-purple-100'
    },
    {
      id: 3,
      title: 'Maximizing Small Living Spaces',
      category: 'Space Planning',
      featured: false,
      color: 'bg-blue-100'
    },
    {
      id: 4,
      title: 'Sustainable Design Materials Guide',
      category: 'Sustainability',
      featured: false,
      color: 'bg-pink-100'
    },
    {
      id: 5,
      title: 'Lighting Design Fundamentals',
      category: 'Lighting',
      featured: false,
      color: 'bg-indigo-100'
    }
  ]

  return (
    <section id="articles" className="py-12 sm:py-16 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto w-full h-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 sm:mb-16">
          <div>
            <div className="inline-block px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600 mb-6">
              Articles
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Design insights and
              <br className="hidden sm:block" />
              interior styling
              <br className="hidden sm:block" />
              inspiration
            </h2>
          </div>
          <Button 
            variant="outline"
            className="hidden lg:flex items-center gap-2 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
          >
            All Articles
            <ArrowUpRight size={16} />
          </Button>
        </div>

        {/* Articles Grid */}
        <div className="space-y-6 sm:space-y-8">
          {/* Featured Article */}
          <div className="w-full">
            {articles
              .filter(article => article.featured)
              .map(article => (
                <div 
                  key={article.id}
                  className="group relative overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-[16/9] md:aspect-[2/1] bg-gray-100 cursor-pointer"
                >
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 text-white">
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <span className="text-xs sm:text-sm bg-white/20 backdrop-blur-sm px-2 sm:px-3 py-1 rounded-full">
                        {article.category}
                      </span>
                      <span className="text-xs sm:text-sm opacity-80">
                        {article.date}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold">
                      {article.title}
                    </h3>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Regular Articles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {articles
              .filter(article => !article.featured)
              .map((article, index) => (
                <div 
                  key={article.id}
                  className={`group relative overflow-hidden rounded-2xl aspect-square ${article.color} cursor-pointer p-4 sm:p-6 flex flex-col justify-between hover:shadow-2xl transition-all duration-500 hover:scale-110 hover:rotate-2 hover-lift animate-fade-in-up`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-end">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-300 group-hover:bg-white/30 group-hover:scale-110">
                      <ArrowUpRight 
                        size={16} 
                        className="sm:w-[18px] sm:h-[18px] text-gray-700 group-hover:text-gray-900 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" 
                      />
                    </div>
                  </div>
                  <div className="transform transition-all duration-300 group-hover:-translate-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2 leading-tight group-hover:text-gray-800 transition-colors duration-300">
                      {article.title}
                    </h3>
                    <span className="text-xs sm:text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300 font-medium">
                      {article.category}
                    </span>
                  </div>
                  
                  {/* Decorative elements */}
                  <div className="absolute -top-4 sm:-top-6 -right-4 sm:-right-6 w-12 h-12 sm:w-16 sm:h-16 bg-white/10 rounded-full transform transition-all duration-500 group-hover:scale-150 group-hover:bg-white/20"></div>
                  <div className="absolute -bottom-3 sm:-bottom-4 -left-3 sm:-left-4 w-10 h-10 sm:w-12 sm:h-12 bg-gray-900/5 rounded-full transform transition-all duration-700 group-hover:scale-125 group-hover:bg-gray-900/10"></div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Mobile All Articles Button */}
        <div className="lg:hidden mt-8 text-center">
          <Button 
            variant="outline"
            className="border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
          >
            All Articles
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Articles

