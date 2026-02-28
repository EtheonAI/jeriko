import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMapMarkerAlt } from "@fortawesome/free-solid-svg-icons";
import { faGithub, faLinkedin, faXTwitter } from "@fortawesome/free-brands-svg-icons";

const HeroSection = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleExternalPortfolio = () => {
    // This could link to an external portfolio or open a modal
    // For now, we'll scroll to the skills section to showcase abilities
    scrollToSection("skills");
  };
  return (
    <section className="relative min-h-screen bg-[#faf9f6] overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute w-32 h-32 bg-[#00bcd4] rounded-full border-4 border-black top-10 right-10 lg:z-auto -z-10"></div>
      <div className="absolute w-20 h-20 bg-[#2196f3] rounded-full border-4 border-black top-32 right-32 lg:z-auto -z-10"></div>
      <div className="absolute w-16 h-16 bg-[#a8f0dc] rounded-full border-4 border-black top-20 right-52 lg:z-auto -z-10"></div>

      <div className="container mx-auto px-6 py-12 lg:pt-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-screen">
          {/* Left side - Content */}
          <div className="space-y-8">
            {/* Location badge */}
            <div className="inline-flex items-center gap-2 bg-[#a8f0dc] border-4 border-black rounded-full px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000]">
              <FontAwesomeIcon icon={faMapMarkerAlt} className="w-5 h-5" />
              San Francisco
            </div>

            {/* Main heading */}
            <div className="space-y-4">
              <h1 className="text-6xl lg:text-8xl font-black leading-tight">
                <span className="gradient-text">Alex</span>
                <br />
                <span className="gradient-text">Morgan</span>
                <span className="text-black">|</span>
              </h1>

              <h2 className="text-2xl lg:text-3xl font-bold text-[#00bcd4]">
                Full-Stack Developer | React & Node.js
              </h2>
            </div>

            {/* Description */}
            <p className="text-lg lg:text-xl text-gray-700 max-w-2xl leading-relaxed">
              Passionate full-stack developer with expertise in modern web technologies. I create scalable, user-centric
              applications that solve real-world problems with clean code and innovative design.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <button
                onClick={() => scrollToSection("contact")}
                className="bg-[#00bcd4] text-white border-4 border-black rounded-2xl font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] px-8 py-4 text-lg w-full sm:w-auto"
              >
                Get In Touch
              </button>
              <button
                onClick={() => scrollToSection("projects")}
                className="bg-white text-[#2196f3] border-4 border-[#2196f3] rounded-2xl font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] px-8 py-4 text-lg w-full sm:w-auto"
              >
                View Projects
              </button>
              <button
                onClick={handleExternalPortfolio}
                className="bg-[#ff9800] text-white border-4 border-black rounded-2xl font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] px-8 py-4 text-lg w-full sm:w-auto"
              >
                Main Portfolio
              </button>
            </div>

            {/* Social Links */}
            <div className="flex gap-4">
              <a
                href="#"
                className="w-16 h-16 border-4 border-black rounded-2xl flex items-center justify-center text-2xl transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] bg-[#9c27b0]"
              >
                <FontAwesomeIcon icon={faGithub} className="w-8 h-8 text-white" />
              </a>
              <a
                href="#"
                className="w-16 h-16 border-4 border-black rounded-2xl flex items-center justify-center text-2xl transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] bg-[#00bcd4]"
              >
                <FontAwesomeIcon icon={faLinkedin} className="w-8 h-8 text-white" />
              </a>
              <a
                href="#"
                className="w-16 h-16 border-4 border-black rounded-2xl flex items-center justify-center text-2xl transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] bg-[#e91e63]"
              >
                <FontAwesomeIcon icon={faXTwitter} className="w-8 h-8 text-white" />
              </a>
            </div>
          </div>

          {/* Right side - KP Logo */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              {/* Decorative frame */}
              <div className="bg-white border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_#000000] transition-all duration-200 hover:shadow-[12px_12px_0px_0px_#000000] hover:translate-x-[-2px] hover:translate-y-[-2px] w-80 h-80 flex items-center justify-center">
                <span className="text-8xl font-black gradient-text">AM</span>
              </div>

              {/* Decorative circles around the frame */}
              <div className="absolute w-12 h-12 bg-[#2196f3] rounded-full border-4 border-black -top-6 -left-6 lg:z-auto -z-10"></div>
              <div className="absolute w-8 h-8 bg-[#00bcd4] rounded-full border-4 border-black -top-4 -right-4 lg:z-auto -z-10"></div>
              <div className="absolute w-10 h-10 bg-[#a8f0dc] rounded-full border-4 border-black -bottom-5 -left-5 lg:z-auto -z-10"></div>
              <div className="absolute w-6 h-6 bg-[#ff9800] rounded-full border-4 border-black -bottom-3 -right-3 lg:z-auto -z-10"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

