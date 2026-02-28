import { Mail, Phone, Calendar, MapPin } from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFacebook, faXTwitter, faInstagram, faGithub } from '@fortawesome/free-brands-svg-icons';
import avatarImg from '@/assets/images/my-avatar.webp';

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-info">
        <figure className="avatar-box mb-4">
          <img 
            src={avatarImg} 
            alt="Richard hanrick" 
            width="80" 
            className="rounded-2xl mx-auto"
          />
        </figure>

        <div className="info-content text-center mb-4">
          <h1 className="text-white text-xl font-semibold mb-2">Richard hanrick</h1>
          <p className="text-white-2 text-sm bg-onyx px-3 py-1 rounded-lg inline-block">
            Web developer
          </p>
        </div>
      </div>

      <div className="sidebar-info_more">
        <div className="separator"></div>

        <ul className="contacts-list space-y-4">
          <li className="contact-item flex items-center gap-3">
            <div className="icon-box">
              <Mail size={16} />
            </div>
            <div className="contact-info">
              <p className="contact-title text-light-gray-70 text-xs uppercase tracking-wide">Email</p>
              <a href="mailto:richard@example.com" className="contact-link text-white text-sm hover:text-orange-yellow-crayola">
                richard@example.com
              </a>
            </div>
          </li>

          <li className="contact-item flex items-center gap-3">
            <div className="icon-box">
              <Phone size={16} />
            </div>
            <div className="contact-info">
              <p className="contact-title text-light-gray-70 text-xs uppercase tracking-wide">Phone</p>
              <a href="tel:+12133522795" className="contact-link text-white text-sm hover:text-orange-yellow-crayola">
                +1 (213) 352-2795
              </a>
            </div>
          </li>

          <li className="contact-item flex items-center gap-3">
            <div className="icon-box">
              <Calendar size={16} />
            </div>
            <div className="contact-info">
              <p className="contact-title text-light-gray-70 text-xs uppercase tracking-wide">Birthday</p>
              <time dateTime="1982-06-23" className="text-white text-sm">June 23, 1982</time>
            </div>
          </li>

          <li className="contact-item flex items-center gap-3">
            <div className="icon-box">
              <MapPin size={16} />
            </div>
            <div className="contact-info">
              <p className="contact-title text-light-gray-70 text-xs uppercase tracking-wide">Location</p>
              <address className="text-white text-sm">Sacramento, California, USA</address>
            </div>
          </li>
        </ul>

        <div className="separator"></div>

        <ul className="social-list flex justify-center gap-4">
          <li className="social-item">
            <a href="#" className="social-link p-2 hover:bg-jet rounded-lg transition-colors">
              <FontAwesomeIcon 
                icon={faFacebook} 
                size="lg" 
                className="text-light-gray hover:text-orange-yellow-crayola" 
              />
            </a>
          </li>
          <li className="social-item">
            <a href="#" className="social-link p-2 hover:bg-jet rounded-lg transition-colors">
              <FontAwesomeIcon 
                icon={faXTwitter} 
                size="lg" 
                className="text-light-gray hover:text-orange-yellow-crayola" 
              />
            </a>
          </li>
          <li className="social-item">
            <a href="#" className="social-link p-2 hover:bg-jet rounded-lg transition-colors">
              <FontAwesomeIcon 
                icon={faInstagram} 
                size="lg" 
                className="text-light-gray hover:text-orange-yellow-crayola" 
              />
            </a>
          </li>
          <li className="social-item">
            <a href="#" className="social-link p-2 hover:bg-jet rounded-lg transition-colors">
              <FontAwesomeIcon 
                icon={faGithub} 
                size="lg" 
                className="text-light-gray hover:text-orange-yellow-crayola" 
              />
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;

