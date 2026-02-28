import { useState } from 'react';
import { Eye, ChevronDown } from 'lucide-react';

// Import project images
import project1 from '@/assets/images/project-1.webp';
import project2 from '@/assets/images/project-2.webp';
import project3 from '@/assets/images/project-3.webp';
import project4 from '@/assets/images/project-4.webp';
import project5 from '@/assets/images/project-5.webp';
import project6 from '@/assets/images/project-6.webp';
import project7 from '@/assets/images/project-7.webp';
import project8 from '@/assets/images/project-8.webp';
import project9 from '@/assets/images/project-9.webp';

const Portfolio = () => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const projects = [
    {
      id: 1,
      title: 'Finance',
      category: 'web development',
      image: project1,
      link: '#'
    },
    {
      id: 2,
      title: 'Orizon',
      category: 'web development',
      image: project2,
      link: '#'
    },
    {
      id: 3,
      title: 'Fundo',
      category: 'web design',
      image: project3,
      link: '#'
    },
    {
      id: 4,
      title: 'Brawlhalla',
      category: 'applications',
      image: project4,
      link: '#'
    },
    {
      id: 5,
      title: 'DSM.',
      category: 'web design',
      image: project5,
      link: '#'
    },
    {
      id: 6,
      title: 'MetaSpark',
      category: 'web design',
      image: project6,
      link: '#'
    },
    {
      id: 7,
      title: 'Summary',
      category: 'web development',
      image: project7,
      link: '#'
    },
    {
      id: 8,
      title: 'Task Manager',
      category: 'applications',
      image: project8,
      link: '#'
    },
    {
      id: 9,
      title: 'Arrival',
      category: 'web development',
      image: project9,
      link: '#'
    }
  ];

  const filterCategories = [
    { id: 'all', label: 'All' },
    { id: 'web design', label: 'Web design' },
    { id: 'applications', label: 'Applications' },
    { id: 'web development', label: 'Web development' }
  ];

  const filteredProjects = activeFilter === 'all' 
    ? projects 
    : projects.filter(project => project.category === activeFilter);

  const handleFilterChange = (category: string) => {
    setActiveFilter(category);
    setIsSelectOpen(false);
  };

  const getActiveFilterLabel = () => {
    const activeCategory = filterCategories.find(cat => cat.id === activeFilter);
    return activeCategory ? activeCategory.label : 'Select category';
  };

  return (
    <article className="portfolio">
      <header className="mb-8">
        <h2 className="h2 article-title">Portfolio</h2>
      </header>

      <section className="projects">
        {/* Filter buttons for desktop */}
        <ul className="filter-list hidden md:flex gap-2 mb-6">
          {filterCategories.map((category) => (
            <li key={category.id} className="filter-item">
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  activeFilter === category.id
                    ? 'bg-gradient-to-r from-orange-yellow-crayola to-vegas-gold'
                    : 'text-light-gray hover:text-white hover:bg-jet'
                }`}
                onClick={() => handleFilterChange(category.id)}
              >
                {category.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Filter select for mobile */}
        <div className="filter-select-box md:hidden mb-6 relative">
          <button
            className="filter-select w-full flex items-center justify-between p-3 bg-jet rounded-lg text-light-gray"
            onClick={() => setIsSelectOpen(!isSelectOpen)}
          >
            <div className="select-value">{getActiveFilterLabel()}</div>
            <div className="select-icon">
              <ChevronDown 
                size={16} 
                className={`transform transition-transform ${isSelectOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {isSelectOpen && (
            <ul className="select-list absolute top-full left-0 right-0 mt-1 bg-eerie-black-2 border border-jet rounded-lg overflow-hidden z-10">
              {filterCategories.map((category) => (
                <li key={category.id} className="select-item">
                  <button
                    className="w-full text-left p-3 text-light-gray hover:text-white hover:bg-jet transition-colors"
                    onClick={() => handleFilterChange(category.id)}
                  >
                    {category.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Projects grid */}
        <ul className="project-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <li
              key={project.id}
              className="project-item opacity-100 transform scale-100 transition-all duration-300"
            >
              <a href={project.link} className="block group">
                <figure className="project-img relative overflow-hidden rounded-2xl mb-4">
                  <div className="project-item-icon-box absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                    <Eye size={24} className="text-orange-yellow-crayola" />
                  </div>

                  <img
                    src={project.image}
                    alt={project.title}
                    loading="lazy"
                    className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </figure>

                <h3 className="project-title text-white font-medium mb-1">{project.title}</h3>
                <p className="project-category text-light-gray text-sm capitalize">{project.category}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
};

export default Portfolio;

