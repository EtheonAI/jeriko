import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Clock, ArrowRight, BookOpen } from 'lucide-react';

interface Article {
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  publishDate: string;
  content: string;
  featured?: boolean;
}

const BlogSection = () => {
  const featuredPost = {
    title: 'Designing Accessible Interfaces: Best Practices for 2024',
    excerpt: 'Explore key principles and practical tips for crafting inclusive, accessible digital products that delight every user.',
    category: 'Design',
    readTime: '7 min read',
    publishDate: 'December 15, 2024',
    featured: true,
    content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Mauris viverra veniam sit amet lacus cursus de congue. Cras sit amet nibh libero, in gravida nulla. Nulla vel metus scelerisque ante sollicitudin. Cras purus odio, vestibulum in vulputate at, tempus viverra turpis.

    Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

    Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

    Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.`
  };

  const posts = [
    {
      title: 'The Art of Micro-Interactions in Modern Web Design',
      excerpt: 'How subtle animations and feedback can dramatically improve user experience and engagement.',
      category: 'Design',
      readTime: '5 min read',
      publishDate: 'December 10, 2024',
      content: `Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est.

      Mauris placerat eleifend leo. Quisque sit amet est et sapien ullamcorper pharetra. Vestibulum erat wisi, condimentum sed, commodo vitae, ornare sit amet, wisi. Aenean fermentum, elit eget tincidunt condimentum, eros ipsum rutrum orci.

      Sagittis tempus lacus enim ac dui. Donec non enim in turpis pulvinar facilisis. Ut felis. Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat. Aliquam erat volutpat.

      Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus. Phasellus ultrices nulla quis nibh. Quisque a lectus. Donec consectetuer ligula vulputate sem tristique cursus.`
    },
    {
      title: 'Creating Cohesive Design Systems',
      excerpt: 'Techniques for building scalable design systems that empower teams and ensure brand consistency.',
      category: 'Design',
      readTime: '6 min read',
      publishDate: 'December 5, 2024',
      content: `Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Etiam porta sem malesuada magna mollis euismod. Donec sed odio dui. Nullam quis risus eget urna mollis ornare vel eu leo.

      Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec ullamcorper nulla non metus auctor fringilla. Vestibulum id ligula porta felis euismod semper. Morbi leo risus, porta ac consectetur ac, vestibulum at eros.

      Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor. Maecenas sed diam eget risus varius blandit sit amet non magna.

      Nullam id dolor id nibh ultricies vehicula ut id elit. Sed posuere consectetur est at lobortis. Aenean lacinia bibendum nulla sed consectetur. Cras mattis consectetur purus sit amet fermentum.`
    },
    {
      title: 'Mobile-First Design: Beyond Responsive',
      excerpt: 'Why mobile-first thinking is essential for modern web applications and how to implement it effectively.',
      category: 'Design',
      readTime: '7 min read',
      publishDate: 'November 28, 2024',
      content: `Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Cras justo odio, dapibus ac facilisis in, egestas eget quam. Vestibulum id ligula porta felis euismod semper. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.

      Duis mollis, est non commodo luctus, nisi erat porttitor ligula, eget lacinia odio sem nec elit. Sed posuere consectetur est at lobortis. Maecenas faucibus mollis interdum. Morbi leo risus, porta ac consectetur ac, vestibulum at eros.

      Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Donec id elit non mi porta gravida at eget metus. Cras mattis consectetur purus sit amet fermentum.

      Etiam porta sem malesuada magna mollis euismod. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.`
    },
    {
      title: 'Performance Optimization Strategies',
      excerpt: 'Proven techniques to improve your web application performance and user experience.',
      category: 'Performance',
      readTime: '9 min read',
      publishDate: 'November 20, 2024',
      content: `Suspendisse potenti. Cras in mi at felis aliquet congue. Ut a est eget ligula molestie gravida. Curabitur massa. Donec eleifend, libero at sagittis mollis, tellus est malesuada tellus, at luctus turpis elit sit amet quam.

      Vivamus pretium ornare est. Ut hendrerit tincidunt lorem. Sed vitae turpis a pede ullamcorper luctus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.

      Ut non enim eleifend felis pretium feugiat. Vivamus quis mi. Phasellus a est. Phasellus magna. In hac habitasse platea dictumst. Curabitur at lacus ac velit ornare lobortis.

      Curabitur a felis in nunc fringilla tristique. Morbi mattis ullamcorper velit. Phasellus gravida semper nisi. Nullam vel sem. Pellentesque libero tortor, tincidunt et, tincidunt eget, semper nec, quam.`
    },
  ];

  const [filter, setFilter] = useState('All');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categories = ['All', 'Development', 'Design', 'Performance', 'Career'];
  
  const openArticle = (article: Article) => {
    setSelectedArticle(article);
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedArticle(null);
  };

  const filteredPosts = filter === 'All'
    ? posts
    : posts.filter(post => post.category === filter);

  return (
    <section id="blog" className="py-20 bg-gradient-subtle">
      <div className="container mx-auto px-6">
        
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-serif font-bold mb-6">
            My <span className="text-accent-gradient">Blog</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Sharing knowledge, experiences, and insights from the world of development 
            and design. Let's learn and grow together.
          </p>
        </div>

        {/* Featured Post */}
        <Card className="mb-12 overflow-hidden shadow-elegant hover:shadow-glow transition-smooth animate-slide-up cursor-pointer" onClick={() => openArticle(featuredPost)}>
          <div className="p-8 lg:p-12">
            <div className="flex items-center gap-4 mb-4">
              <Badge variant="outline" className="bg-gradient-accent text-accent-foreground">
                Featured
              </Badge>
              <Badge variant="secondary">
                {featuredPost.category}
              </Badge>
            </div>
            
            <h3 className="text-3xl lg:text-4xl font-serif font-bold mb-4 text-gradient">
              {featuredPost.title}
            </h3>
            
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              {featuredPost.excerpt}
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-auto">
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {featuredPost.publishDate}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {featuredPost.readTime}
                </div>
              </div>
              
              <Button variant="accent" className="group self-start sm:self-auto">
                Read Article
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map((categoryName) => (
            <Button
              key={categoryName}
              variant={filter === categoryName ? 'accent' : 'minimal'}
              onClick={() => setFilter(categoryName)}
              className="transition-spring"
            >
              {categoryName}
            </Button>
          ))}
        </div>

        {/* Recent Posts Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {filteredPosts.map((post, index) => (
            <Card 
              key={index} 
              className="p-6 shadow-card hover:shadow-elegant transition-smooth animate-fade-in group cursor-pointer flex flex-col h-full"
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => openArticle(post)}
            >
              <div className="mb-4">
                <Badge variant="secondary" className="mb-3">
                  {post.category}
                </Badge>
                <h4 className="text-xl font-serif font-semibold mb-3 group-hover:text-accent transition-smooth">
                  {post.title}
                </h4>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  {post.excerpt}
                </p>
              </div>
              
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {post.publishDate}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {post.readTime}
                  </div>
                </div>
                
                <ArrowRight className="h-4 w-4 text-accent opacity-0 group-hover:opacity-100 transition-smooth" />
              </div>
            </Card>
          ))}
        </div>

        {/* Coming Soon */}
        <Card className="p-8 lg:p-12 text-center shadow-card bg-gradient-primary text-primary-foreground animate-fade-in">
          <div className="max-w-2xl mx-auto">
            <BookOpen className="h-12 w-12 mx-auto mb-6 opacity-80" />
            <h3 className="text-2xl lg:text-3xl font-serif font-bold mb-4">
              Coming Soon
            </h3>
            <p className="text-lg opacity-90">
              More articles on design, development, and creative workflows are on the way. 
              Stay tuned for fresh insights and practical tips!
            </p>
          </div>
        </Card>

        {/* Article Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-serif font-bold mb-4">
                {selectedArticle?.title}
              </DialogTitle>
            </DialogHeader>
            
            {selectedArticle && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <Badge variant="secondary">{selectedArticle.category}</Badge>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {selectedArticle.publishDate}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {selectedArticle.readTime}
                  </div>
                </div>
                
                <div className="prose prose-lg max-w-none">
                  {selectedArticle.content.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="mb-4 text-foreground leading-relaxed">
                      {paragraph.trim()}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
};

export default BlogSection;

