import { MapPin } from "lucide-react";

const Location = () => {
  return (
    <section id="location" className=" rounded-xl p-8 mb-8 border border-gold/30">
      <div className="text-center max-w-4xl mx-auto">
        <h3 className="font-heading text-2xl font-bold mb-4 text-foreground">
          Wedding Location
        </h3>
        <div className="flex items-start gap-3 justify-center mb-6">
          <MapPin size={20} className="text-gold mt-1 flex-shrink-0" />
          <div className="text-muted-foreground">
            <p className="font-medium">Napa Valley Resort</p>
            <p>1234 Vineyard Drive</p>
            <p>Napa Valley, CA 94558</p>
          </div>
        </div>
        <p className="text-muted-foreground mb-6">
          A stunning vineyard setting with breathtaking views for our perfect day.
        </p>
        
        {/* Embedded Map */}
        <div className="w-full max-w-3xl mx-auto">
          <div className="relative overflow-hidden rounded-lg border border-gold/20">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3048.394775!2d-122.2869873!3d38.2975381!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80857e6a20dddc0b%3A0x4e8b9f1e8c8b8b8b!2sNapa%20Valley%2C%20CA!5e0!3m2!1sen!2sus!4v1642000000000!5m2!1sen!2sus"
              width="100%"
              height="300"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full"
              title="Wedding Venue Location - Napa Valley Resort"
            ></iframe>
          </div>
          <p className="text-xs text-muted-foreground mt-2 opacity-70">
            Click and drag to explore the area around our venue
          </p>
        </div>
      </div>
    </section>
  );
};

export default Location;

