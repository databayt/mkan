import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Wrench, Clock, FileCheck, BadgeCheck } from "lucide-react";

const articles = [
  { icon: Wrench, title: "Defining your service", body: "Plumbing, cleaning, photography — be specific about scope and what's not included." },
  { icon: Clock, title: "Scheduling", body: "Set your weekly availability. Same-day bookings are optional." },
  { icon: FileCheck, title: "Quotes & invoicing", body: "Send quotes, accept payment via any of mkan's gateways, and issue receipts automatically." },
  { icon: BadgeCheck, title: "Verification", body: "Service hosts pass a background and license check before publishing." },
];

export default function ServiceHost() {
  return (
    <div className="py-10">
      <div className="space-y-6">
        <h4 className="">Service host help</h4>
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
