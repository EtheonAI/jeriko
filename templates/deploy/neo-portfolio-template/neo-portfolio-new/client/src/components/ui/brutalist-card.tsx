import * as React from "react";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

const brutalistCardVariants = cva(
  "bg-white border-4 border-black rounded-2xl transition-all duration-200",
  {
    variants: {
      shadow: {
        sm: "shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000]",
        md: "shadow-[6px_6px_0px_0px_#000000] hover:shadow-[8px_8px_0px_0px_#000000]",
        lg: "shadow-[8px_8px_0px_0px_#000000] hover:shadow-[12px_12px_0px_0px_#000000]",
        xl: "shadow-[12px_12px_0px_0px_#000000] hover:shadow-[16px_16px_0px_0px_#000000]"
      },
      hover: {
        none: "",
        lift: "hover:translate-x-[-1px] hover:translate-y-[-1px]",
        float: "hover:translate-x-[-2px] hover:translate-y-[-2px]"
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8"
      }
    },
    defaultVariants: {
      shadow: "md",
      hover: "lift",
      padding: "md"
    }
  }
);

const BrutalistCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    shadow?: "sm" | "md" | "lg" | "xl";
    hover?: "none" | "lift" | "float";
    padding?: "none" | "sm" | "md" | "lg";
  }
>(({ className, shadow, hover, padding, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(brutalistCardVariants({ shadow, hover, padding, className }))}
      {...props}
    >
      {children}
    </div>
  );
});

BrutalistCard.displayName = "BrutalistCard";

// Specialized card components
const SkillCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon: string;
    name: string;
    level: string;
    levelColor: string;
    description: string;
    stars: number;
  }
>(({ icon, name, level, levelColor, description, stars, className, ...props }, ref) => {
  return (
    <BrutalistCard ref={ref} shadow="md" hover="lift" className={className} {...props}>
      <div className="flex items-center gap-4 mb-4">
        <div className="text-3xl">{icon}</div>
        <div>
          <h3 className="text-xl font-bold">{name}</h3>
          <span className={`inline-block px-3 py-1 rounded-full text-white text-sm font-bold ${levelColor}`}>
            ⭐ {level}
          </span>
        </div>
      </div>

      <p className="text-gray-700 mb-4">{description}</p>

      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-gray-600">{level} Level</span>
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <svg
              key={i}
              className={`w-4 h-4 ${i < stars ? "text-yellow-400 fill-current" : "text-gray-300"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
      </div>
    </BrutalistCard>
  );
});

SkillCard.displayName = "SkillCard";

const ProjectCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    title: string;
    description: string;
    technologies?: string[];
    bgColor: string;
    textColor: string;
    projectId?: string;
    onExternalClick?: () => void;
    onGithubClick?: () => void;
  }
>(
  (
    {
      title,
      description,
      technologies = [],
      bgColor,
      textColor,
      projectId,
      onExternalClick,
      onGithubClick,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <BrutalistCard
        ref={ref}
        shadow="lg"
        hover="float"
        padding="none"
        className={cn("overflow-hidden", className)}
        {...props}
      >
        <div className="grid lg:grid-cols-2 gap-0">
          {/* Project Image */}
          <div className={`${bgColor} p-8 flex items-center justify-center min-h-[400px] relative`}>
            {projectId && (
              <div className="absolute top-6 left-6">
                <div className="w-16 h-16 bg-black border-4 border-white rounded-full flex items-center justify-center">
                  <span className="text-white font-black text-xl">{projectId}</span>
                </div>
              </div>
            )}

            {/* Mock project interface */}
            <div className="bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-white/30 rounded"></div>
                <div className="h-4 bg-white/20 rounded w-3/4"></div>
                <div className="h-4 bg-white/25 rounded w-1/2"></div>
              </div>
              <div className="mt-6 text-center">
                <div className={`inline-block px-4 py-2 bg-white/20 rounded-lg ${textColor} font-bold`}>
                  {title}
                </div>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="p-8 flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-3xl font-black">{title}</h3>
              <div className="flex gap-2">
                {onExternalClick && (
                  <button
                    onClick={onExternalClick}
                    className="w-10 h-10 bg-[#00bcd4] border-2 border-black rounded-lg flex items-center justify-center hover:shadow-[4px_4px_0px_0px_#000000] transition-all"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                )}
                {onGithubClick && (
                  <button
                    onClick={onGithubClick}
                    className="w-10 h-10 bg-[#333] border-2 border-black rounded-lg flex items-center justify-center hover:shadow-[4px_4px_0px_0px_#000000] transition-all"
                  >
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <p className="text-gray-700 mb-6 leading-relaxed">{description}</p>

            <div className="flex flex-wrap gap-2">
              {technologies.map((tech, techIndex) => (
                <span
                  key={techIndex}
                  className="px-3 py-1 bg-[#a8f0dc] border-2 border-black rounded-full text-sm font-bold"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </BrutalistCard>
    );
  }
);

ProjectCard.displayName = "ProjectCard";

const FeatureCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon: string;
    title: string;
    description: string;
  }
>(({ icon, title, description, className, ...props }, ref) => {
  return (
    <BrutalistCard ref={ref} shadow="lg" hover="float" className={cn("text-center", className)} {...props}>
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
      <div className="w-12 h-1 bg-[#00bcd4] mx-auto mt-4"></div>
    </BrutalistCard>
  );
});

FeatureCard.displayName = "FeatureCard";

const SimpleProjectCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    title: string;
    description: string;
    technologies?: string[];
  }
>(({ title, description, technologies = [], className, ...props }, ref) => {
  return (
    <BrutalistCard ref={ref} shadow="lg" hover="float" className={className} {...props}>
      <h4 className="text-2xl font-black mb-4 gradient-text">{title}</h4>
      <p className="text-gray-700 mb-6 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-2">
        {technologies.map((tech, techIndex) => (
          <span
            key={techIndex}
            className="px-3 py-1 bg-[#e3f2fd] border-2 border-[#2196f3] rounded-full text-sm font-bold text-[#2196f3]"
          >
            {tech}
          </span>
        ))}
      </div>
    </BrutalistCard>
  );
});

SimpleProjectCard.displayName = "SimpleProjectCard";

const StatCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon: React.ReactNode;
    number: string;
    label: string;
    bgColor?: string;
  }
>(({ icon, number, label, bgColor = "bg-[#a8f0dc]", className, ...props }, ref) => {
  return (
    <BrutalistCard
      ref={ref}
      shadow="md"
      hover="lift"
      className={cn(`${bgColor} text-center`, className)}
      {...props}
    >
      <div className="flex justify-center mb-4">{icon}</div>
      <div className="text-3xl font-black text-black mb-2">{number}</div>
      <div className="text-sm font-bold text-gray-700">{label}</div>
    </BrutalistCard>
  );
});

StatCard.displayName = "StatCard";

const ExperienceCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    title: string;
    company: string;
    period: string;
    location: string;
    description: string;
    achievements?: string[];
    technologies?: string[];
  }
>(({ title, company, period, location, description, achievements = [], technologies = [], className, ...props }, ref) => {
  return (
    <BrutalistCard ref={ref} shadow="lg" hover="float" padding="lg" className={className} {...props}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-4">
        <div>
          <h3 className="text-2xl font-black mb-2">{title}</h3>
          <h4 className="text-xl font-bold text-[#00bcd4] mb-2">{company}</h4>
        </div>

        <div className="flex flex-col lg:items-end gap-2">
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="font-medium">{period}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">{location}</span>
          </div>
        </div>
      </div>

      <p className="text-gray-700 mb-6 leading-relaxed">{description}</p>

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="space-y-2 mb-6">
          <h5 className="font-bold text-gray-800 mb-3">Key Achievements:</h5>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {achievements.map((achievement, achIndex) => (
              <div key={achIndex} className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#00bcd4] rounded-full"></div>
                <span className="text-sm text-gray-700">{achievement}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technologies */}
      {technologies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {technologies.map((tech, techIndex) => (
            <span
              key={techIndex}
              className="px-3 py-1 bg-[#e3f2fd] border-2 border-[#2196f3] rounded-full text-sm font-bold text-[#2196f3]"
            >
              {tech}
            </span>
          ))}
        </div>
      )}
    </BrutalistCard>
  );
});

ExperienceCard.displayName = "ExperienceCard";

const EmojiCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    emoji: string;
    bgColor?: string;
    size?: string;
    emojiSize?: string;
  }
>(({ emoji, bgColor = "bg-[#2196f3]", size = "w-32 h-32", emojiSize = "text-6xl", className, ...props }, ref) => {
  return (
    <BrutalistCard
      ref={ref}
      shadow="lg"
      hover="float"
      padding="none"
      className={cn(`${bgColor} ${size} flex items-center justify-center`, className)}
      {...props}
    >
      <span className={emojiSize}>{emoji}</span>
    </BrutalistCard>
  );
});

EmojiCard.displayName = "EmojiCard";

export {
  BrutalistCard,
  SkillCard,
  ProjectCard,
  FeatureCard,
  SimpleProjectCard,
  StatCard,
  ExperienceCard,
  EmojiCard,
  brutalistCardVariants,
};

