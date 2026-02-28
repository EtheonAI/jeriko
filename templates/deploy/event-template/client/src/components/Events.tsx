import EventCard from "./EventCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Event {
  title: string;
  description: string;
  time: string;
  location: string;
  type: string;
  featured?: boolean;
}

interface DayData {
  date: string;
  events: Event[];
}

const Schedule = () => {
  const eventsByDay: Record<string, DayData> = {
    "friday": {
      date: "Friday, June 15th",
      events: [
        {
          title: "Welcome Reception",
          description: "Join us for cocktails, appetizers, and mingling as we kick off our wedding weekend celebration.",
          time: "6:00 PM - 9:00 PM",
          location: "Vineyard Terrace",
          type: "reception",
          featured: true
        },
        {
          title: "Rehearsal Dinner",
          description: "An intimate dinner for the wedding party and close family members.",
          time: "7:00 PM - 10:00 PM",
          location: "Private Dining Room",
          type: "dinner"
        }
      ]
    },
    "saturday": {
      date: "Saturday, June 16th",
      events: [
        {
          title: "Wedding Ceremony",
          description: "Join us as we exchange vows surrounded by the beautiful Napa Valley landscape.",
          time: "4:00 PM - 5:00 PM",
          location: "Garden Pavilion",
          type: "ceremony",
          featured: true
        },
        {
          title: "Cocktail Hour",
          description: "Celebrate with signature cocktails and live music while we take photos.",
          time: "5:00 PM - 6:30 PM",
          location: "Rose Garden",
          type: "cocktails"
        },
        {
          title: "Wedding Reception",
          description: "Dinner, dancing, and celebration under the stars. Let's party!",
          time: "6:30 PM - 12:00 AM",
          location: "Grand Ballroom",
          type: "reception",
          featured: true
        }
      ]
    },
    "sunday": {
      date: "Sunday, June 17th",
      events: [
        {
          title: "Farewell Brunch",
          description: "A relaxed brunch to say goodbye and share memories from the weekend.",
          time: "10:00 AM - 1:00 PM",
          location: "Sunroom Cafe",
          type: "brunch"
        },
        {
          title: "Wine Tasting",
          description: "Optional wine tasting for those who want to explore the local vineyards.",
          time: "2:00 PM - 5:00 PM",
          location: "Valley Vista Winery",
          type: "activity"
        }
      ]
    }
  };

  return (
    <section id="events" className="py-20">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6">
            Wedding <span className="text-pink-400">Schedule</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            A weekend full of love, laughter, and unforgettable moments. Here's what we have planned for our celebration.
          </p>
        </div>

        <Tabs defaultValue="friday" className="w-full max-w-6xl mx-auto">
          <div className="flex justify-center mb-8">
            <TabsList className="grid grid-cols-3 w-fit h-auto p-1">
              <TabsTrigger value="friday" className="font-heading text-lg py-3 px-6">Friday</TabsTrigger>
              <TabsTrigger value="saturday" className="font-heading text-lg py-3 px-6">Saturday</TabsTrigger>
              <TabsTrigger value="sunday" className="font-heading text-lg py-3 px-6">Sunday</TabsTrigger>
            </TabsList>
          </div>

          {Object.entries(eventsByDay).map(([day, dayData]) => (
            <TabsContent key={day} value={day} className="space-y-8">
              <div className="text-center mb-8">
                <h3 className="font-heading text-2xl font-semibold text-pink-400 mb-2">{dayData.date}</h3>
              </div>
              
              <div className="space-y-0">
                {dayData.events.map((event, index) => (
                  <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                    <EventCard {...event} />
                    {index < dayData.events.length - 1 && (
                      <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-30" />
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
};

export default Schedule;

