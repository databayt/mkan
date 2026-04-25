import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Briefcase, Receipt, Users2, ShieldAlert } from "lucide-react";

const articles = [
  { icon: Briefcase, title: "Setting up a travel admin account", body: "Manage trips for your team. One central wallet, individual receipts." },
  { icon: Users2, title: "Inviting employees", body: "Send invites by email. Each employee books on their own; you approve or pre-approve." },
  { icon: Receipt, title: "Expense reports & receipts", body: "Export PDFs by month or by employee. Each booking includes a tax-friendly invoice." },
  { icon: ShieldAlert, title: "Travel insurance", body: "Optional layer covers cancellation, baggage, and medical for business trips." },
];

export default function TravelAdmin() {
  return (
    <div className="py-10">
      <div className="space-y-6">
        <h4 className="">Travel admin help</h4>
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
