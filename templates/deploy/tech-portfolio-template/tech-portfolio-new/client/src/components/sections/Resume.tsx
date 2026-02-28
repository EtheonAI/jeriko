import { BookOpen, Briefcase } from 'lucide-react';
import { Progress } from '../ui/progress';

const Resume = () => {
  const education = [
    {
      title: 'University school of the arts',
      period: '2007 — 2008',
      description: 'Nemo enims ipsam voluptatem, blanditiis praesentium voluptum delenit atque corrupti, quos dolores et quas molestias exceptur.'
    },
    {
      title: 'New york academy of art',
      period: '2006 — 2007',
      description: 'Ratione voluptatem sequi nesciunt, facere quisquams facere menda ossimus, omnis voluptas assumenda est omnis..'
    },
    {
      title: 'High school of art and design',
      period: '2002 — 2004',
      description: 'Duis aute irure dolor in reprehenderit in voluptate, quila voluptas mag odit aut fugit, sed consequuntur magni dolores eos.'
    }
  ];

  const experience = [
    {
      title: 'Creative director',
      period: '2015 — Present',
      description: 'Nemo enim ipsam voluptatem blanditiis praesentium voluptum delenit atque corrupti, quos dolores et qvuas molestias exceptur.'
    },
    {
      title: 'Art director',
      period: '2013 — 2015',
      description: 'Nemo enims ipsam voluptatem, blanditiis praesentium voluptum delenit atque corrupti, quos dolores et quas molestias exceptur.'
    },
    {
      title: 'Web designer',
      period: '2010 — 2013',
      description: 'Nemo enims ipsam voluptatem, blanditiis praesentium voluptum delenit atque corrupti, quos dolores et quas molestias exceptur.'
    }
  ];

  const skills = [
    { name: 'Web design', percentage: 80 },
    { name: 'Graphic design', percentage: 70 },
    { name: 'Branding', percentage: 90 },
    { name: 'WordPress', percentage: 50 }
  ];

  return (
    <article className="resume">
      <header className="mb-8">
        <h2 className="h2 article-title">Resume</h2>
      </header>

      {/* Education Section */}
      <section className="timeline mb-8">
        <div className="title-wrapper flex items-center gap-4 mb-6">
          <div className="icon-box">
            <BookOpen size={16} />
          </div>
          <h3 className="h3">Education</h3>
        </div>

        <ol className="timeline-list space-y-6">
          {education.map((item, index) => (
            <li key={index} className="timeline-item relative pl-8 border-l-2 border-jet">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-orange-yellow-crayola rounded-full"></div>
              
              <h4 className="h4 timeline-item-title mb-2 text-white">{item.title}</h4>
              <span className="text-vegas-gold text-sm mb-3 block">{item.period}</span>
              <p className="timeline-text text-light-gray">{item.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Experience Section */}
      <section className="timeline mb-8">
        <div className="title-wrapper flex items-center gap-4 mb-6">
          <div className="icon-box">
            <Briefcase size={16} />
          </div>
          <h3 className="h3">Experience</h3>
        </div>

        <ol className="timeline-list space-y-6">
          {experience.map((item, index) => (
            <li key={index} className="timeline-item relative pl-8 border-l-2 border-jet">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-orange-yellow-crayola rounded-full"></div>
              
              <h4 className="h4 timeline-item-title mb-2 text-white">{item.title}</h4>
              <span className="text-vegas-gold text-sm mb-3 block">{item.period}</span>
              <p className="timeline-text text-light-gray">{item.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Skills Section */}
      <section className="skill">
        <h3 className="h3 skills-title mb-6">My skills</h3>

        <ul className="skills-list content-card bg-gradient-to-br from-jet to-onyx rounded-2xl border border-jet p-6 space-y-6">
          {skills.map((skill, index) => (
            <li key={index} className="skills-item">
              <div className="title-wrapper flex justify-between items-center mb-2">
                <h5 className="h5 text-white">{skill.name}</h5>
                <span className="text-light-gray text-sm font-medium">{skill.percentage}%</span>
              </div>

              <Progress 
                value={skill.percentage} 
                className="h-2 bg-jet border-0"
              />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
};

export default Resume;

