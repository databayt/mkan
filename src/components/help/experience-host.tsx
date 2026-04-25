import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, Users, Camera, ShieldCheck } from "lucide-react";

const articles = [
  { icon: MapPin, title: "Designing an experience", body: "Pick a venue and a clear theme guests can picture from a photo." },
  { icon: Users, title: "Group sizes", body: "Most experiences run with 4-12 guests. Smaller groups feel personal; larger groups need more structure." },
  { icon: Camera, title: "Photo guidelines", body: "Bright, in-focus photos taken at the venue beat staged shots. Show the actual activity." },
  { icon: ShieldCheck, title: "Safety & insurance", body: "We provide host protection up to $1M. Make sure you have local permits where required." },
];

export default function ExperienceHost() {
  return (
    <div className="py-10">
      <div className="space-y-6">
        <h4 className="">Experience host help</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a) => (
            <Card key={a.title} className="border border-gray-300 rounded-md">
              <CardHeader className="px-4 flex flex-row items-center gap-3">
                <a.icon className="size-5 text-gray-700" />
                <h5 className="m-0">{a.title}</h5>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-sm leading-relaxed font-normal">{a.body}</p>
              </CardContent>
              <div className="border-t border-gray-200" />
              <Button variant="ghost" className="w-full justify-between text-start h-12 hover:bg-gray-50 border-0">
                <span className="font-semibold text-sm text-gray-900">Learn more</span>
                <ChevronRight className="w-4 h-4 text-gray-900 rtl:rotate-180" />
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
