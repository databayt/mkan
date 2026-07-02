"use client";
// Disable static generation for this page
export const dynamic = "force-dynamic";

import React from "react";
import { usePathname } from "next/navigation";
import StepHeader from "@/components/host/step-header";
import { useHostValidation } from "@/context/onboarding-validation-context";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { cdn } from "@/lib/cdn";

interface StandOutPageProps {
  params: Promise<{ id: string }>;
}

const StandOutPage = ({ params }: StandOutPageProps) => {
  const pathname = usePathname();
  const dict = useDictionary();
  const [id, setId] = React.useState<string>("");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const { enableNext } = useHostValidation();

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  // Enable next button for this informational page
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  // Auto-play video when component mounts
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log("Auto-play was prevented:", error);
      });
    }
  }, []);

  const illustration = (
    <div className="w-full max-w-2xl mx-auto bg-gradient-to-br from-orange-50 to-pink-50 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden aspect-[770/674]">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedData={() => {
          // Ensure video plays after loading
          if (videoRef.current) {
            videoRef.current.play().catch((error) => {
              console.log("Video play failed:", error);
            });
          }
        }}
      >
        <source src={cdn.vendor("airbnb", "host-stand-out.mp4")} type="video/mp4" />
      </video>
    </div>
  );

  return (
    <div className="w-full">
      <div className="w-full">
        <StepHeader
          stepNumber={2}
          title={dict.hosting.pages.standOut.title}
          description={dict.hosting.pages.standOut.description}
          illustration={illustration}
        />
      </div>
    </div>
  );
};

export default StandOutPage;
