import HeroSection from '../components/about-page/HeroSection';
import ScheduleSection from '../components/about-page/ScheduleSection';
import ExperienceSection from '../components/about-page/ExperienceSection';
import MarqueeSeparator from '../components/about-page/MarqueeSeparator';
import FAQSection from '../components/about-page/FAQSection';

interface AboutContentProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function AboutContent({ theme }: AboutContentProps) {
  return (
    <div className="space-y-0">
      <HeroSection theme={theme} />
      <ScheduleSection theme={theme} />
      <ExperienceSection theme={theme} />
      <MarqueeSeparator theme={theme} />
      <FAQSection theme={theme} />
    </div>
  );
}

export default AboutContent;

