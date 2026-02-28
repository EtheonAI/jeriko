import { Star } from "lucide-react";
import { ProjectCard, SimpleProjectCard } from "./ui/brutalist-card";

const ProjectsSection = () => {
  const projects = [
    {
      id: "01",
      title: "TaskFlow Pro",
      description:
        "Modern project management application with real-time collaboration, team chat, and advanced task tracking features for remote teams.",
      technologies: ["React", "Node.js", "MongoDB", "Socket.io", "JWT"],
      bgColor: "bg-gradient-to-br from-purple-500 to-blue-600",
      textColor: "text-white",
    },
    {
      id: "02",
      title: "EcoTracker",
      description:
        "Environmental impact tracking application helping users monitor their carbon footprint and discover sustainable lifestyle choices.",
      technologies: ["Vue.js", "Express.js", "PostgreSQL", "Chart.js", "Stripe"],
      bgColor: "bg-gradient-to-br from-cyan-400 to-blue-500",
      textColor: "text-white",
    },
  ];

  const additionalProjects = [
    {
      title: "RecipeShare",
      description:
        "Social recipe sharing platform where food enthusiasts can discover, save, and share their favorite recipes with a vibrant community.",
      technologies: ["React.js", "Node.js", "Express.js", "MongoDB"],
    },
    {
      title: "FitnessTracker",
      description:
        "Comprehensive fitness tracking application with workout logging, progress visualization, and personalized fitness recommendations.",
      technologies: ["React Native", "Node.js", "MySQL", "Chart.js"],
    },
  ];

  return (
    <section id="projects" className="py-20 bg-[#faf9f6] relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute w-32 h-32 bg-[#e91e63] rounded-full border-4 border-black top-20 right-10 lg:z-auto -z-10"></div>
      <div className="absolute w-20 h-20 bg-[#00bcd4] rounded-full border-4 border-black bottom-20 left-10 lg:z-auto -z-10"></div>

      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white border-4 border-black rounded-full px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000] mb-8">
            <Star className="w-5 h-5 text-yellow-500" />
            Featured Work
            <span className="text-xl">⚡</span>
          </div>

          <h2 className="text-5xl lg:text-7xl font-black mb-6">
            <span className="gradient-text">Creative Projects</span>
          </h2>

          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Innovative solutions crafted with passion and precision
          </p>
        </div>

        {/* Featured Projects */}
        <div className="space-y-12 mb-20">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              title={project.title}
              description={project.description}
              technologies={project.technologies}
              bgColor={project.bgColor}
              textColor={project.textColor}
              projectId={project.id}
              onExternalClick={() => console.log("External link clicked")}
              onGithubClick={() => console.log("GitHub link clicked")}
            />
          ))}
        </div>

        {/* Additional Projects */}
        <div>
          <h3 className="text-3xl font-black mb-8 text-center">
            <span className="gradient-text">More Creative Work</span>
          </h3>

          <div className="grid md:grid-cols-2 gap-8">
            {additionalProjects.map((project, index) => (
              <SimpleProjectCard
                key={index}
                title={project.title}
                description={project.description}
                technologies={project.technologies}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;

