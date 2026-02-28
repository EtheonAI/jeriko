import { Button } from "@/components/ui/button";

const RSVP = () => {
  return (
    <section id="rsvp" className="py-20 ">
      <div className="container mx-auto px-6">
        <div className=" rounded-xl p-8 border border-gold/30 max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h3 className="font-heading text-2xl font-bold mb-4 text-foreground">
              Please RSVP by May 15th
            </h3>
            <p className="text-muted-foreground mb-6">
              We can't wait to celebrate with you! Please let us know if you'll be joining us for our special weekend.
            </p>
            <Button variant="outline" className="px-8 py-3 border-gold text-gold hover:bg-gold hover:text-white">
              RSVP Now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RSVP;

