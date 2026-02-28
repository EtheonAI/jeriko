import { Clock, MapPin, Star } from "lucide-react";

interface EventCardProps {
  title: string;
  description: string;
  time: string;
  location: string;
  type: string;
  featured?: boolean;
}

const EventCard = ({ title, description, time, location, type, featured }: EventCardProps) => {
  return (
    <div className="group relative  rounded-xl p-8 border border-border hover:border-gold/30 transition-all duration-300 hover:shadow-card">
      {/* Featured Badge */}
      {featured && (
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1 px-3 py-1 bg-gold/10 border border-gold/30 rounded-full">
            <Star size={12} className="text-gold fill-gold" />
            <span className="text-xs font-medium text-gold">Featured</span>
          </div>
        </div>
      )}

      {/* Event Content */}
      <div className="space-y-4">
        <div>
          <h4 className="font-heading text-2xl font-bold mb-2 text-foreground group-hover:text-pink-400 transition-colors">
            {title}
          </h4>
          <p className="text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-2 rounded-full bg-gold/10 border border-gold/30">
              <Clock size={16} className="text-gold" />
            </div>
            <span className="text-foreground font-medium">{time}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="p-2 rounded-full bg-gold/10 border border-gold/30">
              <MapPin size={16} className="text-gold" />
            </div>
            <span className="text-foreground font-medium">{location}</span>
          </div>
        </div>

        {/* Event Type Tag */}
        <div className="pt-2">
          <span className="inline-block px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-full capitalize">
            {type}
          </span>
        </div>
      </div>
    </div>
  );
};

export default EventCard;

