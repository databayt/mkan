import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, ArrowLeft, AlertCircle } from 'lucide-react';
import { getDictionary } from '@/components/internationalization/dictionaries';

interface PageProps {
  params: Promise<{ lang: string; id: string }>;
}

type VerifyStepCopy = { title?: string; description?: string; action?: string };
type VerifyListingCopy = {
  backToEditor?: string;
  completedBadge?: string;
  subtitle?: string;
  completedLabel?: string;
  readyTitle?: string;
  readyBody?: string;
  steps?: Record<string, VerifyStepCopy>;
};

const VerifyListingPage = async ({ params }: PageProps) => {
  const { lang, id } = await params;
  const dict = await getDictionary(lang as 'en' | 'ar');
  const v =
    (dict as unknown as { property?: { verifyListing?: VerifyListingCopy } }).property
      ?.verifyListing ?? {};
  const steps = v.steps ?? {};

  const requiredSteps = [
    {
      title: steps.addPhotos?.title ?? 'Add at least 5 photos',
      completed: false,
      description: steps.addPhotos?.description ?? 'Show guests what your place looks like',
      action: steps.addPhotos?.action ?? 'Add photos'
    },
    {
      title: steps.addTitle?.title ?? 'Create a title',
      completed: true,
      description: steps.addTitle?.description ?? 'Help guests find your listing',
      action: steps.addTitle?.action ?? 'Add title'
    },
    {
      title: steps.addDescription?.title ?? 'Write a description',
      completed: false,
      description: steps.addDescription?.description ?? 'Share what makes your place special',
      action: steps.addDescription?.action ?? 'Add description'
    },
    {
      title: steps.setPrice?.title ?? 'Set your price',
      completed: false,
      description: steps.setPrice?.description ?? 'Decide how much to charge per night',
      action: steps.setPrice?.action ?? 'Set price'
    },
    {
      title: steps.checkInInstructions?.title ?? 'Add check-in instructions',
      completed: false,
      description: steps.checkInInstructions?.description ?? 'Help guests access your place',
      action: steps.checkInInstructions?.action ?? 'Add instructions'
    },
    {
      title: steps.verifyPhone?.title ?? 'Verify your phone number',
      completed: false,
      description: steps.verifyPhone?.description ?? 'Required for account security',
      action: steps.verifyPhone?.action ?? 'Verify'
    },
  ];

  const completedCount = requiredSteps.filter(step => step.completed).length;
  const totalSteps = requiredSteps.length;
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="gap-2 mb-6 p-0 h-auto"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
          <span>{v.backToEditor ?? "Back to listing editor"}</span>
        </Button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-3xl font-semibold">
              {dict.hosting?.content?.completeListing ?? "Complete your listing"}
            </h1>
            <Badge variant="secondary">
              {(v.completedBadge ?? "{completed}/{total} completed")
                .replace("{completed}", String(completedCount))
                .replace("{total}", String(totalSteps))}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {v.subtitle ?? "Finish these steps to publish your listing and start welcoming guests."}
          </p>
        </div>

        <div className="grid gap-4">
          {requiredSteps.map((step, index) => (
            <Card key={index} className={step.completed ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {step.completed ? (
                      <CheckCircle className="size-6 text-green-600" />
                    ) : (
                      <AlertCircle className="size-6 text-orange-600" />
                    )}
                    <div>
                      <CardTitle className={`text-lg ${step.completed ? 'text-green-900' : 'text-orange-900'}`}>
                        {step.title}
                      </CardTitle>
                      <p className={`text-sm ${step.completed ? 'text-green-700' : 'text-orange-700'}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant={step.completed ? "outline" : "default"}
                    size="sm"
                    disabled={step.completed}
                  >
                    {step.completed ? (v.completedLabel ?? 'Completed') : step.action}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-6 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-3">
            <Circle className="size-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 mb-2">{v.readyTitle ?? "Ready to publish?"}</h3>
              <p className="text-sm text-blue-700 mb-4">
                {v.readyBody ?? "Once you complete all required steps, you can publish your listing and start receiving bookings."}
              </p>
              <Button disabled={completedCount !== totalSteps}>
                {dict.listingEditor?.finishSetup?.publish ?? "Publish listing"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyListingPage;
