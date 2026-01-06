"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React from 'react';
import { HostStepHeader } from '@/components/host';
import { useHostValidation } from '@/context/host-validation-context';
import { ListingProvider, useListing } from '@/components/host/use-listing';

interface AboutPlaceProps {
  params: Promise<{ id: string }>;
}

const AboutPlaceContent = ({ params }: AboutPlaceProps) => {
  const [id, setId] = React.useState<string>('');
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const { enableNext } = useHostValidation();
  const { loadListing } = useListing();

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
      // Load the listing data in the background
      const listingId = parseInt(resolvedParams.id);
      if (!isNaN(listingId)) {
        loadListing(listingId).catch(console.error);
      }
    });
  }, [params, loadListing]);

  // Enable next button for this informational page
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  // Auto-play video when component mounts
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log('Auto-play was prevented:', error);
      });
    }
  }, []);

  const illustration = (
    <div className="w-full sm:w-3/4 max-w-xl mx-auto bg-gradient-to-br from-orange-50 to-pink-50 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden h-[300px] sm:aspect-video">
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
              console.log('Video play failed:', error);
            });
          }
        }}
      >
        <source
          src="https://stream.media.muscache.com/zFaydEaihX6LP01x8TSCl76WHblb01Z01RrFELxyCXoNek.mp4?v_q=high"
          type="video/mp4"
        />
        {/* Fallback for browsers that don't support video */}
        {/* <div className="w-full h-full bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center">
          <div className="text-center text-white">
            <div className="w-48 h-48 bg-white/20 rounded-2xl mx-auto mb-4 relative">
              <div className="absolute inset-4 bg-white/20 rounded-xl"></div>
              <div className="absolute inset-8 bg-white/20 rounded-lg"></div>
            </div>
            <p className="text-sm">3D House Cross-Section</p>
          </div>
        </div> */}
      </video>
    </div>
  );

  return (
    <div className="">
      <div className="w-full">
        <HostStepHeader
          stepNumber={1}
          title="Tell us about your place"
          description="In this step, we'll ask you which type of property you have and if guests will book the entire place or just a room. Then let us know the location and how many guests can stay."
          illustration={illustration}
        />
      </div>
    </div>
  );
};

const AboutPlace = ({ params }: AboutPlaceProps) => {
  return (
    <ListingProvider>
      <AboutPlaceContent params={params} />
    </ListingProvider>
  );
};

export default AboutPlace; 