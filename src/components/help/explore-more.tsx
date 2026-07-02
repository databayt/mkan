"use client";
import { cdn } from "@/lib/cdn";

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function ExploreMore() {
  const dict = useDictionary();
  const t = dict?.help?.exploreMore;

  return (
         <div className="bg-neutral-900 text-white -mx-22 px-22 py-10">
      <div className="max-w-7xl mx-auto">
                 <h3 className="">{t?.title ?? "Explore more"}</h3>

        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
                     {/* Left side - Cards */}
           <div className="lg:col-span-2 -mt-4">
             {/* Two smaller cards in a row */}
             <div className="grid grid-cols-2 gap-4 pt-6 my-6">
                               {/* Community Policies Card */}
                <Card className="bg-neutral-800 border-none overflow-hidden h-78 p-0">
                  <CardContent className="p-0">
                    <div className="aspect-[4/3] relative">
                      <Image
                        src={cdn.product("assets/help-one.png")}
                        alt={t?.communityPolicies?.imageAlt ?? "Team collaboration and discussion in office setting"}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <h2 className="text-lg font-semibold text-white mb-2">{t?.communityPolicies?.title ?? "Our community policies"}</h2>
                      <p className="text-gray-300 text-sm">{t?.communityPolicies?.description ?? "How we build a foundation of trust."}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Safety Tips Card */}
                <Card className="bg-neutral-800 border-none overflow-hidden h-78 p-0">
                  <CardContent className="p-0">
                    <div className="aspect-[4/3] relative">
                      <Image
                        src={cdn.product("assets/help-two.png")}
                        alt={t?.safetyTips?.imageAlt ?? "Father and son preparing for outdoor activity with life vests"}
                        fill
                        className="object-cover"
                      />
                    </div>
                                         <div className="p-4">
                       <h2 className="text-lg font-semibold text-white mb-2">{t?.safetyTips?.title ?? "Safety tips and guidelines"}</h2>
                       <p className="text-gray-300 text-sm">{t?.safetyTips?.description ?? "Resources to help travelers stay safe."}</p>
                     </div>
                  </CardContent>
                </Card>
             </div>
          </div>

          {/* Right side - Contact Section */}
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl lg:text-3xl font-semibold mb-4">{t?.contact?.title ?? "Need to get in touch?"}</h2>
              <p className="text-gray-300 text-lg mb-4">
                {t?.contact?.description ?? "We'll start with some questions and get you to the right place."}
              </p>

              <Button
                className="w-full bg-white text-black hover:bg-gray-100 text-lg py-6 rounded-lg font-medium"
                size="lg"
              >
                {t?.contact?.button ?? "Contact us"}
              </Button>
            </div>

            <p className="text-gray-300">
              {t?.contact?.feedbackPrefix ?? "You can also"}{" "}
              <Link href="#" className="underline hover:no-underline text-white">
                {t?.contact?.feedbackLink ?? "give us feedback."}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
