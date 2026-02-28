import { Heart, Users2 } from "lucide-react";
import placeholderImage from "@/assets/placeholder.webp";

interface WeddingPartyMember {
  name: string;
  role: string;
  relationship: string;
  bio: string;
  image: string;
}

const WeddingParty = () => {
  const weddingParty: WeddingPartyMember[] = [
    {
      name: "Emma Johnson",
      role: "Maid of Honor",
      relationship: "Sister of the Bride",
      bio: "Sarah's younger sister and best friend who will be by her side on the big day.",
      image: placeholderImage
    },
    {
      name: "James Wilson",
      role: "Best Man",
      relationship: "College Roommate",
      bio: "Michael's best friend since college and the one who introduced him to Sarah.",
      image: placeholderImage
    },
    {
      name: "Lisa Chen",
      role: "Bridesmaid",
      relationship: "Best Friend",
      bio: "Sarah's closest friend from work who has been there through everything.",
      image: placeholderImage
    },
    {
      name: "David Martinez",
      role: "Groomsman",
      relationship: "Brother of the Groom",
      bio: "Michael's older brother who has always been his role model and mentor.",
      image: placeholderImage
    }
  ];

  return (
    <section id="wedding-party" className="py-20 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6">
            The <span className="text-pink-400">People</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Meet the special people who will be standing with us as we say "I do" - our closest family and friends who have been part of our journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {weddingParty.map((person, index) => (
            <div 
              key={index} 
              className="group relative  rounded-xl p-6 border border-border hover:border-gold/30 transition-all duration-300 hover:scale-105 hover:shadow-card animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Person Image */}
              <div className="relative mb-6">
                <img
                  src={person.image}
                  alt={person.name}
                  className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-gold/30 group-hover:border-gold transition-colors"
                />
                <div className="absolute inset-0 w-24 h-24 rounded-full mx-auto bg-gradient-to-r from-gold/20 to-gold-light/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>

              {/* Person Info */}
              <div className="text-center">
                <h3 className="font-heading text-xl font-bold mb-2 text-foreground group-hover:text-pink-400 transition-colors">
                  {person.name}
                </h3>
                <p className="text-gold font-medium mb-1">
                  {person.role}
                </p>
                <p className="text-muted-foreground text-sm mb-4">
                  {person.relationship}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  {person.bio}
                </p>

                {/* Heart Icon */}
                <div className="flex justify-center">
                  <div className="p-2 rounded-full border border-gold/30 bg-gold/10">
                    <Heart size={16} className="text-gold" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gold/10 border border-gold/30 rounded-lg">
            <Users2 className="text-gold" size={20} />
            <span className="text-gold font-medium">Our Complete Wedding Party</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WeddingParty;

