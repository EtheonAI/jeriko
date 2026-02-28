import { useRef } from 'react'
import { useMultipleScrollAnimations } from '@/hooks/useScrollAnimation'
import childrenMealsImage from '../assets/images/children-meals.webp'
import foodBankWarehouseImage from '../assets/images/food-bank-warehouse.webp'
import volunteersWarehouseImage from '../assets/images/volunteers-warehouse.webp'

interface BlogCardProps {
  image: string
  title: string
  date: string
  borderColor: string
}

const BlogCard = ({ image, title, date, borderColor }: BlogCardProps) => {
  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 border-t-4 ${borderColor}`}>
      <div className="h-48 overflow-hidden">
        <img 
          src={image} 
          alt={title} 
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="p-6">
        <div className="text-sm text-gray-500 mb-3">{date}</div>
        <h3 className="text-xl font-bold text-gray-800 mb-4 leading-tight hover:text-amber-700 transition-colors cursor-pointer">
          {title}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-amber-600 font-semibold hover:text-amber-700 cursor-pointer">
            Read More →
          </span>
          <div className="flex items-center space-x-2 text-gray-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">5 min read</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const BlogSection = () => {
  const storiesRef = useRef(null)
  const inspiringRef = useRef(null)

  // Setup multiple scroll-triggered animations with staggered delays
  useMultipleScrollAnimations([
    {
      ref: storiesRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 1000
    },
    {
      ref: inspiringRef,
      config: {
        type: 'underline',
        color: '#f59e0b', // amber-500 color
        animationDuration: 1000
      },
      delay: 1700
    }
  ])

  const blogPosts = [
    {
      image: childrenMealsImage,
      title: "How One Family Found Hope Through Our Emergency Food Program",
      date: "December 15, 2024",
      borderColor: "border-t-blue-500"
    },
    {
      image: foodBankWarehouseImage,
      title: "Local School Partnership Ensures No Child Goes Hungry",
      date: "December 12, 2024", 
      borderColor: "border-t-red-500"
    },
    {
      image: volunteersWarehouseImage,
      title: "Community Comes Together for Record-Breaking Food Drive",
      date: "December 8, 2024",
      borderColor: "border-t-green-500"
    }
  ]

  return (
    <section id="blog" className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-800 mb-4">
            <span ref={storiesRef}>Stories from the Food Drive</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Read <span ref={inspiringRef}>inspiring stories</span> of hope, community, and the impact we're making together
          </p>
        </div>

        {/* Blog Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {blogPosts.map((post, index) => (
            <BlogCard key={index} {...post} />
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center">
          <button className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            View All Stories
          </button>
        </div>
      </div>
    </section>
  )
}

export default BlogSection

