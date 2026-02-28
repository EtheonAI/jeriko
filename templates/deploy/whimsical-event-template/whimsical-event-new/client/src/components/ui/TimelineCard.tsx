import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMusic, 
  faUtensils, 
  faPalette, 
  faGamepad, 
  faFlask, 
  faTheaterMasks, 
  faMapMarkerAlt, 
  faClock,
  faStar,
  type IconDefinition
} from '@fortawesome/free-solid-svg-icons';

interface TimelineCardProps {
  time: string;
  title: string;
  description: string;
  type: string;
  location: string;
  duration: string;
  icon?: IconDefinition;
  dontMiss?: boolean;
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

const TimelineCard = ({ 
  time, 
  title, 
  description, 
  type, 
  location, 
  duration,
  icon,
  dontMiss = false,
  theme
}: TimelineCardProps) => {
  // Type icons mapping
  const typeIcons: Record<string, IconDefinition> = {
    workshop: faPalette,
    show: faMusic,
    ride: faGamepad,
    game: faGamepad,
    demo: faFlask,
    ceremony: faTheaterMasks,
    food: faUtensils,
    music: faMusic
  };

  // Type labels mapping
  const typeLabels: Record<string, string> = {
    workshop: 'WORKSHOP',
    show: 'MUSIC SHOW',
    ride: 'RIDE',
    game: 'GAME',
    demo: 'DEMO',
    ceremony: 'CEREMONY',
    food: 'FOOD EXPERIENCE',
    music: 'MUSIC SHOW'
  };

  const displayIcon = icon || typeIcons[type] || faTheaterMasks;
  const displayType = typeLabels[type] || type?.toUpperCase() || 'EVENT';

  return (
    <div className={`
      relative
      ${theme.text.replace('text-', 'border-')} border-2 
      rounded-3xl 
      bg-white 
      shadow-lg hover:shadow-xl 
      transition-all duration-300 
      hover:scale-[1.02] 
      transform 
      overflow-hidden
      mb-6
    `}>
      {/* DON'T MISS Badge */}
      {dontMiss && (
        <div className={`
          absolute top-4 right-4 z-10
          ${theme.bg} 
          text-white 
          px-4 py-2 
          rounded-full 
          text-sm font-bold
          flex items-center gap-2
        `}>
          <FontAwesomeIcon icon={faStar} className="text-yellow-300" />
          DON'T MISS
        </div>
      )}

      {/* Time and Title Section */}
      <div className="p-6 pb-4">
        <div className={`text-lg font-bold ${theme.text} mb-2`}>
          {time}
        </div>
        <h3 className={`
          text-2xl 
          font-['Ranchers'] 
          font-bold 
          ${theme.text} 
          leading-tight
          uppercase
          mb-3
        `}>
          {title}
        </h3>
        
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          {description}
        </p>
      </div>

      {/* Metadata Footer */}
      <div className={`
        ${theme.bg} 
        text-white 
        grid grid-cols-3 
        py-4 px-6
      `}>
        {/* Type */}
        <div className="flex items-center justify-center gap-2">
          <FontAwesomeIcon icon={displayIcon} className="text-lg" />
          <span className="text-sm font-bold uppercase">
            {displayType}
          </span>
        </div>

        {/* Location */}
        <div className="flex items-center justify-center gap-2">
          <FontAwesomeIcon icon={faMapMarkerAlt} className="text-lg" />
          <span className="text-sm font-bold uppercase">
            {location || 'VENUE'}
          </span>
        </div>

        {/* Duration */}
        <div className="flex items-center justify-center gap-2">
          <FontAwesomeIcon icon={faClock} className="text-lg" />
          <span className="text-sm font-bold uppercase">
            {duration || '1 HOUR'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TimelineCard;

