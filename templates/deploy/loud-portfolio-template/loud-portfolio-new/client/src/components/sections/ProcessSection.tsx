import React from 'react';
import { Check } from 'lucide-react';

const ProcessSection = () => {
  const processSteps = [
    {
      id: 1,
      number: "1.",
      title: "DISCOVERY & CONSULTATION",
      description: "I start by understanding your business goals, target audience, and current challenges to create a tailored marketing strategy.",
      color: "green",
      bgColor: "bg-accent-green/20",
      textColor: "text-accent-green",
      borderColor: "border-accent-green/30"
    },
    {
      id: 2,
      number: "2.",
      title: "STRATEGY DEVELOPMENT",
      description: "Based on research and analysis, I develop a comprehensive marketing plan with clear objectives, timelines, and measurable outcomes.",
      color: "purple",
      bgColor: "bg-accent-purple/20",
      textColor: "text-accent-purple",
      borderColor: "border-accent-purple/30"
    },
    {
      id: 3,
      number: "3.",
      title: "IMPLEMENTATION & EXECUTION",
      description: "I execute the marketing campaigns across chosen channels while maintaining constant communication and providing regular updates.",
      color: "blue",
      bgColor: "bg-accent-blue/20",
      textColor: "text-accent-blue",
      borderColor: "border-accent-blue/30"
    },
    {
      id: 4,
      number: "4.",
      title: "OPTIMIZATION & REPORTING",
      description: "I continuously monitor performance, optimize campaigns for better results, and provide detailed reports on progress and ROI.",
      color: "yellow",
      bgColor: "bg-accent-yellow/20",
      textColor: "text-accent-yellow",
      borderColor: "border-accent-yellow/30"
    }
  ];

  return (
    <section className="dark-section py-20">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h3 className="section-subtitle text-accent-orange mb-4">HOW I WORK</h3>
          <h2 className="section-title text-white max-w-4xl mx-auto">
            MY WORKING METHOD
          </h2>
        </div>

        {/* Process Steps */}
        <div className="max-w-5xl mx-auto space-y-6">
          {processSteps.map((step) => (
            <div
              key={step.id}
              className="process-card dark-card flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-12"
            >
              {/* Step Number */}
              <div className="flex-shrink-0">
                <div className="process-number text-accent-orange">{step.number}</div>
              </div>

              {/* Content */}
              <div className="flex-grow">
                <h3 className="card-title mb-4 leading-tight text-white">
                  {step.title}
                </h3>
                <p className="text-lg leading-relaxed text-gray-300">
                  {step.description}
                </p>
              </div>

              {/* Check Icon */}
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-accent-purple rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;

