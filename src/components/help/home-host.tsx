import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home, Wallet, Calendar, Star } from "lucide-react";

const articles = [
  {
    icon: Home,
    title: "Listing your space",
    body: "Create a listing in 17 steps — describe the place, add photos, set the price.",
  },
  {
    icon: Calendar,
    title: "Managing your calendar",
    body: "Block dates, accept bookings, sync availability across listings.",
  },
  {
    icon: Wallet,
    title: "Getting paid",
    body: "Stripe, Bankak, Cashi, mobile money, bank transfer, or cash at check-in.",
  },
  {
    icon: Star,
    title: "Reviews & superhost",
    body: "Earn the superhost badge by maintaining a 4.8+ rating and 90%+ response rate.",
  },
];

export default function HomeHost() {
  return (
    <div className="py-10">
      <div className="space-y-6">
        <h4 className="">Home host help</h4>
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
              <Button
                variant="ghost"
                className="w-full justify-between text-start h-12 hover:bg-gray-50 border-0"
              >
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
