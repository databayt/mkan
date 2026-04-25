import Image from "next/image";
import { Superhost } from "@/components/atom/icons";

export default function HostedBy() {
    return (
      <div className="flex items-center gap-4 py-8">
        <div className="relative">
          <div className="w-11 h-11 rounded-full overflow-hidden relative">
            <Image
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop"
              alt="Host Faisal"
              width={44}
              height={44}
              className="w-full h-full object-cover"
            />
          </div>
          {/* Superhost badge overlay positioned more inward */}
          <div className="absolute -bottom-0.5 -right-[5px]">
            <Superhost className="w-4 h-4" />
          </div>
        </div>
        <div className="flex flex-col">
          <h5 className="text-lg font-semibold">Hosted by Faisal</h5>
          <p className="">Superhost · 9 months hosting</p>
        </div>
      </div>
    )
  }
  