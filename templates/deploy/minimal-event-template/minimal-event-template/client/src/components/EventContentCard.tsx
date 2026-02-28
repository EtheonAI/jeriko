import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";

interface EventContentCardProps {
  title: string;
  des: string;
  name: string;
  position: string;
  panel: string;
  img: string;
}

export function EventContentCard({
  title,
  des,
  name,
  position,
  panel,
  img,
}: EventContentCardProps) {
  return (
    <Card className="border-0 shadow-none bg-transparent lg:flex lg:flex-row mb-10 lg:items-end">
      <CardHeader className="p-0 flex-shrink-0 h-[32rem] max-w-[28rem]">
        <img
          src={img}
          alt="event speaker"
          className="h-full w-full object-cover rounded-lg"
        />
      </CardHeader>
      <CardContent className="col-span-full lg:col-span-3 pt-6 lg:pt-0 lg:pl-8">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          {panel}
        </h3>
        <h2 className="mb-4 text-3xl font-medium text-gray-900">
          {title}
        </h2>
        <p className="mb-12 md:w-8/12 font-medium text-gray-500">
          {des}
        </p>
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src="/logos/spotify-logo.webp" alt="spotify" />
          </Avatar>
          <div>
            <h4 className="mb-0.5 text-base font-semibold text-gray-900">
              {name}
            </h4>
            <p className="text-sm font-normal text-gray-500">
              {position}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EventContentCard;

