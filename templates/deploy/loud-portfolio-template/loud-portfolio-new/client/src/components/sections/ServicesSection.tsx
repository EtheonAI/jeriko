import React from 'react';
import { ArrowUpRight, Search, FileText, Share2, Mail, Users, BarChart3 } from 'lucide-react';
import FadeIn from '../animations/FadeIn';
import SlideUp from '../animations/SlideUp';

const iconMap: Record<string, React.ComponentType<any>> = {
  Search,
  FileText,
  Share2,
  Mail,
  Users,
  BarChart3
};

const ServicesSection = () => {
  const services = [
    {
      id: 1,
      title: "Search Engine Optimization",
      description: "I'll boost your website's visibility and attract organic traffic with SEO strategies tailored to your business goals.",
      color: "orange",
      bgColor: "bg-accent-orange",
      textColor: "text-white",
      icon: "Search"
    },
    {
      id: 2,
      title: "Content Marketing",
      description: "Create compelling content that engages your audience and drives qualified leads through strategic storytelling.",
      color: "purple",
      bgColor: "bg-accent-purple",
      textColor: "text-white",
      icon: "FileText"
    },
    {
      id: 3,
      title: "Social Media Marketing",
      description: "Build your brand presence and engage with customers across all major social media platforms.",
      color: "red",
      bgColor: "bg-accent-red",
      textColor: "text-white",
      icon: "Share2"
    },
    {
      id: 4,
      title: "Email Marketing",
      description: "Design and execute email campaigns that nurture leads and convert prospects into loyal customers.",
      color: "yellow",
      bgColor: "bg-accent-yellow",
      textColor: "text-white",
      icon: "Mail"
    },
    {
      id: 5,
      title: "Marketing Strategy",
      description: "Develop comprehensive marketing strategies that align with your business objectives and drive growth.",
      color: "teal",
      bgColor: "bg-accent-teal",
      textColor: "text-white",
      icon: "Users"
    },
    {
      id: 6,
      title: "Analytics & Reporting",
      description: "Track performance and provide detailed insights to optimize your marketing campaigns for better ROI.",
      color: "blue",
      bgColor: "bg-primary-navy",
      textColor: "text-white",
      icon: "BarChart3"
    }
  ];

  return (
    <section id="services" className="dark-section py-20">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <FadeIn>
          <div className="text-center mb-16">
            <h2 className="section-title text-white max-w-4xl mx-auto">
              SERVICES DESIGNED TO DRIVE REAL RESULTS
            </h2>
          </div>
        </FadeIn>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {services.map((service, index) => {
            const IconComponent = iconMap[service.icon];
            
            return (
              <SlideUp key={service.id} delay={index * 150}>
                <div
                  className={`service-card ${service.bgColor} ${service.textColor} p-8 rounded-2xl relative overflow-hidden group cursor-pointer w-full h-80 flex flex-col`}
                >
                  {/* Icon */}
                  <div className="mb-6">
                    <IconComponent className="w-12 h-12" />
                  </div>

                  {/* Content */}
                  <h3 className="card-title mb-4 leading-tight">
                    {service.title}
                  </h3>
                  <p className={`text-sm leading-relaxed mb-6 text-white/90 flex-grow`}>
                    {service.description}
                  </p>

                  {/* Arrow Icon */}
                  <div className="flex justify-end mt-auto">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/20 text-white group-hover:scale-110 transition-transform duration-300`}>
                      <ArrowUpRight className="w-6 h-6" />
                    </div>
                  </div>

                  {/* Decorative triangle */}
                  <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[60px] border-l-transparent border-b-[60px] border-b-white/10"></div>
                </div>
              </SlideUp>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;

