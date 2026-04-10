"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { OnboardingStepsOverviewProps } from './types';

/**
 * Generic steps overview component for onboarding flows
 * Displays the main steps in a two-column layout with illustrations
 * Can be configured for different onboarding flows (host, transport, etc.)
 */
const OnboardingStepsOverview: React.FC<OnboardingStepsOverviewProps> = ({
  config,
  onGetStarted,
  isLoading = false,
  loadingLabel: loadingLabelProp,
  className,
}) => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const loadingLabel = loadingLabelProp ?? (isAr ? "جارٍ الإنشاء..." : "Creating...");

  // Translation map for overview step titles and descriptions
  const overviewTranslations: Record<string, { title: string; description: string }> = isAr ? {
    "Tell us about your place": {
      title: "أخبرنا عن مكانك",
      description: "شارك بعض المعلومات الأساسية، مثل موقعه وعدد الضيوف الذين يمكنهم الإقامة.",
    },
    "Make it stand out": {
      title: "اجعله مميزاً",
      description: "أضف 5 صور أو أكثر بالإضافة إلى عنوان ووصف — سنساعدك.",
    },
    "Finish up and publish": {
      title: "أكمل وانشر",
      description: "اختر سعراً للبدء، تحقق من بعض التفاصيل، ثم انشر إعلانك.",
    },
    "Set up your office": {
      title: "أعد مكتبك",
      description: "أدخل تفاصيل مكتبك ومعلومات الاتصال واختر موقع نقطة التجمع.",
    },
    "Add buses & routes": {
      title: "أضف الحافلات والمسارات",
      description: "سجّل حافلاتك بالمرافق والسعة، ثم حدد مساراتك مع الأسعار.",
    },
    "Create schedules & publish": {
      title: "أنشئ الجداول وانشر",
      description: "أعد جداول الرحلات، أضف صوراً، وانشر مكتبك لبدء استقبال الحجوزات.",
    },
  } : {};

  const translateStep = (step: { title: string; description: string }) => {
    const translation = overviewTranslations[step.title];
    return translation ? { title: translation.title, description: translation.description } : step;
  };

  const defaultHeadline = isAr ? (
    <>
      من السهل البدء
      <br />
      على مكان
    </>
  ) : (
    <>
      It's easy to get
      <br />
      started on Mkan
    </>
  );

  return (
    <div className={cn("h-full flex flex-col px-6 md:px-20", className)}>
      <div className="flex-1">
        <div className="h-full max-w-7xl mx-auto flex flex-col">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-start py-12">
            {/* Left Side - Title */}
            <div>
              <h2>
                {config.headline || defaultHeadline}
              </h2>
              {config.subheadline && (
                <p className="mt-4 text-muted-foreground">
                  {config.subheadline}
                </p>
              )}
            </div>

            {/* Right Side - Steps */}
            <div className="space-y-6">
              {config.steps.map((step) => {
                const translated = translateStep(step);
                return (
                <div key={step.number} className="flex gap-6 items-start">
                  <div className="flex gap-3 flex-1">
                    <div className="flex-shrink-0">
                      <h4 className="text-foreground">
                        {step.number}
                      </h4>
                    </div>
                    <div>
                      <h4 className="mb-1">
                        {translated.title}
                      </h4>
                      <p>
                        {translated.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 hidden md:flex items-center justify-center w-24 h-24">
                    {step.illustration}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Section with HR and Button */}
          <div>
            <Separator className="w-full" />
            <div className="flex justify-end py-4">
              <Button onClick={onGetStarted} disabled={isLoading}>
                {isLoading ? loadingLabel : (config.buttonLabel || (isAr ? 'ابدأ الآن' : 'Get started'))}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingStepsOverview;
