import React from 'react';
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from 'react-vertical-timeline-component';
import 'react-vertical-timeline-component/style.min.css';

import { experiences, type ExperienceItem } from '@/constants/experienceData';

const ExperienceCard: React.FC<ExperienceItem> = (experience) => {
  return (
    <VerticalTimelineElement
      contentStyle={{ 
        background: 'hsl(var(--timeline-bg))',
        color: 'hsl(var(--timeline-foreground))',
        border: '1px solid hsl(var(--timeline-border))'
      }}
      contentArrowStyle={{ borderRight: '7px solid hsl(var(--timeline-bg))' }}
      date={experience.date}
      dateClassName="text-timeline-date"
      iconStyle={{ 
        background: 'hsl(var(--timeline-icon-bg))',
        border: '3px solid hsl(var(--timeline-icon-border))'
      }}
      icon={
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
          <img
            src={experience.icon}
            alt={experience.companyName}
            className="h-[60%] w-[60%] object-contain"
          />
        </div>
      }
    >
      <h3 className="text-xl font-bold text-timeline-foreground">{experience.title}</h3>
      <p className="text-timeline-foreground/80 text-base font-semibold" style={{ margin: 0 }}>
        {experience.companyName}
      </p>

      <ul className="ml-5 mt-4 list-disc space-y-2">
        {experience.points.map((point, idx) => (
          <li
            key={`exp-point-${idx}`}
            className="text-sm tracking-wide text-timeline-foreground/90"
          >
            {point}
          </li>
        ))}
      </ul>
    </VerticalTimelineElement>
  );
};

/**
 * Main timeline component – can be dropped anywhere.
 */
const ExperienceTimeline: React.FC = () => {
  return (
    <section className="py-20 bg-gradient-subtle" id="experience">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-serif font-bold mb-6">
            Professional <span className="text-accent-gradient">Timeline</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            My journey through the design industry, from education to senior roles, 
            showcasing growth, learning, and impact across different organizations.
          </p>
        </div>

        <style>
          {`
            .vertical-timeline::before {
              background: hsl(var(--timeline-line)) !important;
            }
          `}
        </style>

        <VerticalTimeline>
          {experiences.map((exp, index) => (
            <ExperienceCard key={index} {...exp} />
          ))}
        </VerticalTimeline>
      </div>
    </section>
  );
};

export default ExperienceTimeline;

