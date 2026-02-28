import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Github } from 'lucide-react';
import projectWebDev from '@/assets/project-web-dev.webp';
import projectMobileApp from '@/assets/project-mobile-app.webp';
import projectBranding from '@/assets/project-branding.webp';

const PortfolioSection = () => {
  const [filter, setFilter] = useState('all');

  const projects = [
    {
      id: 1,
      title: 'E-Commerce Platform UI/UX Overhaul',
      description: 'Comprehensive UI/UX design for a scalable e-commerce platform, focusing on intuitive navigation, seamless checkout flows and a cohesive design system.',
      image: projectWebDev,
      category: 'web',
      technologies: ['Figma', 'Adobe XD', 'Design System', 'User Testing', 'Prototyping'],
      liveUrl: '#',
      githubUrl: '#',
      results: {
        performance: '+40% faster loading',
        conversion: '+25% increase in sales',
        users: '10K+ active users'
      }
    },
    {
      id: 2,
      title: 'Health & Fitness App Experience Design',
      description: 'End-to-end UI/UX design for a mobile app that tracks workouts, nutrition and wellness metrics, integrating rich visuals and engaging micro-interactions.',
      image: projectMobileApp,
      category: 'mobile',
      technologies: ['Figma', 'Sketch', 'InVision', 'User Personas', 'Prototype Testing'],
      liveUrl: '#',
      githubUrl: '#',
      results: {
        downloads: '50K+ downloads',
        rating: '4.8/5 stars',
        retention: '80% user retention'
      }
    },
    {
      id: 3,
      title: 'Brand Identity System',
      description: 'Complete brand identity design for a tech startup, including logo design, color palette, typography, and comprehensive brand guidelines.',
      image: projectBranding,
      category: 'design',
      technologies: ['Figma', 'Illustrator', 'InDesign', 'Miro', 'Style Guide'],
      liveUrl: '#',
      githubUrl: '#',
      results: {
        recognition: '+200% brand recognition',
        engagement: '+150% social engagement',
        awards: '3 design awards'
      }
    },
  ];

  const categories = [
    { id: 'all', label: 'All Projects' },
    { id: 'web', label: 'Web Development' },
    { id: 'mobile', label: 'Mobile Apps' },
    { id: 'design', label: 'Design' },
  ];

  const filteredProjects = filter === 'all' 
    ? projects 
    : projects.filter(project => project.category === filter);

  return (
    <section id="portfolio" className="py-20">
      <div className="container mx-auto px-6">
        
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-serif font-bold mb-6">
            Featured <span className="text-accent-gradient">Projects</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            A showcase of my recent work, highlighting expertise across web, mobile, and brand experiences.
          </p>

          {/* Filter Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={filter === category.id ? 'accent' : 'minimal'}
                onClick={() => setFilter(category.id)}
                className="transition-spring"
              >
                {category.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid lg:grid-cols-1 gap-12">
          {filteredProjects.map((project, index) => (
            <Card 
              key={project.id} 
              className="overflow-hidden shadow-card hover:shadow-elegant transition-smooth animate-fade-in group"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              <div className="flex flex-col lg:flex-row">
                
                {/* Project Image */}
                <div className="lg:w-1/2 relative overflow-hidden">
                  <img
                    src={project.image}
                    alt={project.title}
                    className="w-full h-80 lg:h-full object-cover transition-smooth group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-20 transition-smooth" />
                </div>

                {/* Project Details */}
                <div className="lg:w-1/2 p-8 lg:p-12 flex flex-col h-full">
                  <div className="mb-4">
                    <Badge variant="outline" className="mb-4 bg-gradient-accent text-accent-foreground">
                      {categories.find(cat => cat.id === project.category)?.label}
                    </Badge>
                    <h3 className="text-2xl lg:text-3xl font-serif font-bold mb-4">
                      {project.title}
                    </h3>
                    <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
                      {project.description}
                    </p>
                  </div>

                  {/* Technologies */}
                  <div className="mb-6">
                    <h4 className="font-semibold mb-3">Technologies Used:</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.technologies.map((tech) => (
                        <Badge key={tech} variant="secondary">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Results */}
                  <div className="mb-8">
                    <h4 className="font-semibold mb-3">Key Results:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {Object.entries(project.results).map(([key, value]) => (
                        <div key={key} className="text-center p-3 bg-muted rounded-lg">
                          <div className="font-semibold text-accent">{value}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-4 mt-auto">
                    <Button variant="accent" className="flex-1">
                      <Eye className="h-4 w-4 mr-2" />
                      Live Demo
                    </Button>
                    <Button variant="minimal" className="flex-1">
                      <Github className="h-4 w-4 mr-2" />
                      View Code
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16 animate-fade-in">
          <p className="text-lg text-muted-foreground mb-6">
            Interested in working together on your next project?
          </p>
          <Button 
            variant="hero" 
            size="lg"
            onClick={() => document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Start a Conversation
          </Button>
        </div>
      </div>
    </section>
  );
};

export default PortfolioSection;

