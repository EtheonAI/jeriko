// Import blog images
import blog1 from '@/assets/images/blog-1.webp';
import blog2 from '@/assets/images/blog-2.webp';
import blog3 from '@/assets/images/blog-3.webp';
import blog4 from '@/assets/images/blog-4.webp';
import blog5 from '@/assets/images/blog-5.webp';
import blog6 from '@/assets/images/blog-6.webp';

const Blog = () => {
  const blogPosts = [
    {
      id: 1,
      title: 'Design conferences in 2022',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Veritatis et quasi architecto beatae vitae dicta sunt, explicabo.',
      image: blog1,
      link: '#'
    },
    {
      id: 2,
      title: 'Best fonts every designer',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Sed ut perspiciatis, nam libero tempore, cum soluta nobis est eligendi.',
      image: blog2,
      link: '#'
    },
    {
      id: 3,
      title: 'Design digest #80',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Excepteur sint occaecat cupidatat no proident, quis nostrum exercitationem ullam corporis suscipit.',
      image: blog3,
      link: '#'
    },
    {
      id: 4,
      title: 'UI interactions of the week',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Enim ad minim veniam, consectetur adipiscing elit, quis nostrud exercitation ullamco laboris nisi.',
      image: blog4,
      link: '#'
    },
    {
      id: 5,
      title: 'The forgotten art of spacing',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Maxime placeat, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      image: blog5,
      link: '#'
    },
    {
      id: 6,
      title: 'Design digest #79',
      category: 'Design',
      date: '2022-02-23',
      dateDisplay: 'Fab 23, 2022',
      excerpt: 'Optio cumque nihil impedit uo minus quod maxime placeat, velit esse cillum.',
      image: blog6,
      link: '#'
    }
  ];

  return (
    <article className="blog">
      <header className="mb-8">
        <h2 className="h2 article-title">Blog</h2>
      </header>

      <section className="blog-posts">
        <ul className="blog-posts-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogPosts.map((post) => (
            <li key={post.id} className="blog-post-item">
              <a href={post.link} className="block group">
                <figure className="blog-banner-box relative overflow-hidden rounded-2xl mb-4">
                  <img
                    src={post.image}
                    alt={post.title}
                    loading="lazy"
                    className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </figure>

                <div className="blog-content">
                  <div className="blog-meta flex items-center gap-2 mb-3">
                    <p className="blog-category text-orange-yellow-crayola text-sm font-medium">
                      {post.category}
                    </p>
                    <span className="dot w-1 h-1 bg-light-gray rounded-full"></span>
                    <time dateTime={post.date} className="text-light-gray text-sm">
                      {post.dateDisplay}
                    </time>
                  </div>

                  <h3 className="h3 blog-item-title text-white mb-3 group-hover:text-orange-yellow-crayola transition-colors">
                    {post.title}
                  </h3>

                  <p className="blog-text text-light-gray text-sm">
                    {post.excerpt}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
};

export default Blog;

