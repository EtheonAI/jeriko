import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AboutCardProps {
  title: string;
  description: string;
  subTitle: string;
}

export function AboutCard({ title, description, subTitle }: AboutCardProps) {
  return (
    <Card className="border-0 shadow-none">
      <CardContent 
        className="h-[453px] p-5 flex flex-col justify-center items-center rounded-2xl relative bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/image/placeholder.webp')"
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-60 rounded-2xl"></div>
        
        <div className="relative z-10 flex flex-col justify-center items-center h-full">
          <h3 className="mb-4 text-center text-base font-semibold text-white">
            {subTitle}
          </h3>
          <h2 className="text-center text-3xl font-bold text-white">
            {title}
          </h2>
          <p className="mt-2 mb-10 text-base w-full lg:w-8/12 text-center font-normal text-white">
            {description}
          </p>
          <Button variant="secondary" size="sm">
            view details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AboutCard;

