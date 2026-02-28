// Import service icons
import iconDesign from '@/assets/images/icon-design.svg';
import iconDev from '@/assets/images/icon-dev.svg';
import iconApp from '@/assets/images/icon-app.svg';
import iconPhoto from '@/assets/images/icon-photo.svg';

// Import client logos
import logo1 from '@/assets/images/logo-1-color.webp';
import logo2 from '@/assets/images/logo-2-color.webp';
import logo3 from '@/assets/images/logo-3-color.webp';
import logo4 from '@/assets/images/logo-4-color.webp';
import logo5 from '@/assets/images/logo-5-color.webp';
import logo6 from '@/assets/images/logo-6-color.webp';

const About = () => {
  const services = [
    {
      icon: iconDesign,
      title: 'Web design',
      description: 'The most modern and high-quality design made at a professional level.'
    },
    {
      icon: iconDev,
      title: 'Web development',
      description: 'High-quality development of sites at the professional level.'
    },
    {
      icon: iconApp,
      title: 'Mobile apps',
      description: 'Professional development of applications for iOS and Android.'
    },
    {
      icon: iconPhoto,
      title: 'Photography',
      description: 'I make high-quality photos of any category at a professional level.'
    }
  ];

  const clients = [
    { logo: logo1, alt: 'client logo' },
    { logo: logo2, alt: 'client logo' },
    { logo: logo3, alt: 'client logo' },
    { logo: logo4, alt: 'client logo' },
    { logo: logo5, alt: 'client logo' },
    { logo: logo6, alt: 'client logo' }
  ];

  return (
    <article className="about active">
      <header className="mb-8">
        <h2 className="h2 article-title">About me</h2>
      </header>

      <section className="about-text mb-8">
        <p className="text-light-gray mb-4">
          I'm Creative Director and UI/UX Designer from Sydney, Australia, working in web development and print media.
          I enjoy turning complex problems into simple, beautiful and intuitive designs.
        </p>

        <p className="text-light-gray">
          My job is to build your website so that it is functional and user-friendly but at the same time attractive.
          Moreover, I add personal touch to your product and make sure that is eye-catching and easy to use. My aim is to bring
          across your message and identity in the most creative way. I created web design for many famous brand companies.
        </p>
      </section>

      {/* Services Section */}
      <section className="service mb-8">
        <h3 className="h3 service-title mb-6">What i'm doing</h3>

        <ul className="service-list grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service, index) => (
            <li key={index} className="service-item flex gap-4 p-6 bg-gradient-to-br from-jet to-onyx rounded-2xl border border-jet">
              <div className="service-icon-box flex-shrink-0">
                <img src={service.icon} alt={`${service.title} icon`} width="40" />
              </div>

              <div className="service-content-box">
                <h4 className="h4 service-item-title mb-2 text-white">{service.title}</h4>
                <p className="service-item-text text-light-gray text-sm">{service.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Clients Section */}
      <section className="clients">
        <h3 className="h3 clients-title mb-6">Clients</h3>

        <div className="clients-container overflow-hidden">
          <ul className="clients-list flex gap-4 overflow-x-auto pb-4 scroll-smooth">
            {clients.map((client, index) => (
              <li key={index} className="clients-item flex-shrink-0">
                <a href="#" className="block p-4 hover:bg-jet rounded-lg transition-colors">
                  <img 
                    src={client.logo} 
                    alt={client.alt} 
                    className="h-12 w-auto object-contain filter grayscale hover:grayscale-0 transition-all"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  );
};

export default About;

