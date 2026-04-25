"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState, useCallback } from 'react';
import { useRouter, usePathname, useParams as useRouteParams } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { publishListing } from '@/components/host/actions';
import { toast } from 'sonner';

interface LegalAndCreatePageProps {
  params: Promise<{ id: string }>;
}

const LegalAndCreatePage = ({ params }: LegalAndCreatePageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const routeParams = useRouteParams();
  const lang = (routeParams?.lang as string) ?? 'en';
  const [id, setId] = React.useState<string>('');
  const [hostingType, setHostingType] = useState<string>('private-individual');
  const [safetyFeatures, setSafetyFeatures] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const { setCustomNavigation } = useHostValidation();

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  // Hook the footer's "Create listing" button to actually publish the draft.
  // Without this the listing stays in draft=true/isPublished=false forever.
  const handlePublish = useCallback(async () => {
    if (!id || isPublishing) return;
    const listingId = Number(id);
    if (!Number.isFinite(listingId)) return;

    setIsPublishing(true);
    try {
      await publishListing(listingId);
      toast.success(
        (dict.hosting?.pages?.legal as Record<string, string>)?.published ??
          'Your listing is live!'
      );
      router.push(`/${lang}/listings/${listingId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not publish';
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  }, [id, isPublishing, lang, router, dict]);

  React.useEffect(() => {
    setCustomNavigation({
      onNext: handlePublish,
      nextDisabled: !id || isPublishing,
    });
    return () => setCustomNavigation(undefined);
  }, [setCustomNavigation, handlePublish, id, isPublishing]);



  const toggleSafetyFeature = (feature: string) => {
    setSafetyFeatures(prev => 
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const safetyOptions = [
    dict.hosting.pages.legal.exteriorCamera,
    dict.hosting.pages.legal.noiseMonitor,
    dict.hosting.pages.legal.weapons,
  ];

  const isFormValid = hostingType && safetyFeatures.length >= 0; // At least hosting type selected

  return (
    <div className="">
      <div className="">
        {/* Title at the top */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-4xl font-medium text-foreground">
            {dict.hosting.pages.legal.title}
          </h1>
        </div>

        {/* Two sections side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-20 items-start">
          {/* Left column - Hosting type */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-2 mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-medium text-foreground">
                {dict.hosting.pages.legal.hostingOnMkan}
              </h2>
              <HelpCircle size={16} className="text-muted-foreground sm:w-4.5 sm:h-4.5" />
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="hosting-type"
                  value="private-individual"
                  checked={hostingType === 'private-individual'}
                  onChange={(e) => setHostingType(e.target.value)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  hostingType === 'private-individual'
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground bg-background'
                }`}>
                  {hostingType === 'private-individual' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-background"></div>
                  )}
                </div>
                <span className="text-sm text-foreground">{dict.hosting.pages.legal.privateIndividual}</span>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="hosting-type"
                  value="business"
                  checked={hostingType === 'business'}
                  onChange={(e) => setHostingType(e.target.value)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  hostingType === 'business'
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground bg-background'
                }`}>
                  {hostingType === 'business' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-background"></div>
                  )}
                </div>
                <span className="text-sm text-foreground">{dict.hosting.pages.legal.business}</span>
              </label>
            </div>
          </div>

          {/* Right column - Safety features and important info */}
          <div className="lg:col-span-3 space-y-3 sm:space-y-4">
            {/* Safety Features */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <h2 className="text-base sm:text-lg font-medium text-foreground">
                  {dict.hosting.pages.legal.safetyQuestion}
                </h2>
                <HelpCircle size={16} className="text-muted-foreground sm:w-4.5 sm:h-4.5" />
              </div>
              
              <div className="space-y-2">
                {safetyOptions.map((option) => (
                  <label key={option} className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-foreground">{option}</span>
                    <input
                      type="checkbox"
                      checked={safetyFeatures.includes(option)}
                      onChange={() => toggleSafetyFeature(option)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      safetyFeatures.includes(option)
                        ? 'border-foreground bg-foreground'
                        : 'border-muted-foreground bg-background'
                    }`}>
                      {safetyFeatures.includes(option) && (
                        <svg className="w-2.5 h-2.5 text-background" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <hr className="border-border" />

            {/* Important Information */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-medium text-foreground">
                {dict.hosting.pages.legal.importantThings}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {dict.hosting.pages.legal.complianceNotice}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default LegalAndCreatePage; 