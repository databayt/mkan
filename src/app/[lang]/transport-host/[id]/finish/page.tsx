'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  CheckCircle2,
  Building2,
  MapPin,
  Bus,
  Route,
  Calendar,
  Camera,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTransportHostValidation } from '@/context/transport-host-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';
import {
  publishTransportOffice,
  getRoutesByOffice,
  getBusesByOffice,
  getTripsByOffice,
} from '@/lib/actions/transport-actions';

interface StepStatus {
  name: string;
  icon: React.ReactNode;
  completed: boolean;
  required: boolean;
  link: string;
}

const FinishPage = () => {
  const router = useRouter();
  const params = useParams();
  const { enableNext, disableNext, setCustomNavigation } = useTransportHostValidation();
  const { office, loadOffice } = useTransportOffice();
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    async function checkStatus() {
      if (!office?.id) return;

      try {
        const [routes, buses, trips] = await Promise.all([
          getRoutesByOffice(office.id),
          getBusesByOffice(office.id),
          getTripsByOffice(office.id),
        ]);

        const statusSteps: StepStatus[] = [
          {
            name: 'Office Information',
            icon: <Building2 className="h-5 w-5" />,
            completed: !!(office.name && office.phone && office.email),
            required: true,
            link: 'office-info',
          },
          {
            name: 'Assembly Point',
            icon: <MapPin className="h-5 w-5" />,
            completed: !!office.assemblyPointId,
            required: true,
            link: 'assembly-point',
          },
          {
            name: 'Buses',
            icon: <Bus className="h-5 w-5" />,
            completed: buses.length > 0,
            required: true,
            link: 'buses',
          },
          {
            name: 'Routes',
            icon: <Route className="h-5 w-5" />,
            completed: routes.length > 0,
            required: true,
            link: 'routes',
          },
          {
            name: 'Schedule',
            icon: <Calendar className="h-5 w-5" />,
            completed: trips.length > 0,
            required: false,
            link: 'schedule',
          },
          {
            name: 'Photos',
            icon: <Camera className="h-5 w-5" />,
            completed: !!office.logoUrl,
            required: false,
            link: 'photos',
          },
        ];

        setSteps(statusSteps);
      } catch (error) {
        console.error('Error checking status:', error);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, [office]);

  const allRequiredComplete = steps
    .filter((s) => s.required)
    .every((s) => s.completed);

  const canPublish = allRequiredComplete && agreedToTerms;

  useEffect(() => {
    if (canPublish) {
      enableNext();
    } else {
      disableNext();
    }
  }, [canPublish, enableNext, disableNext]);

  useEffect(() => {
    setCustomNavigation({
      onNext: handlePublish,
      nextDisabled: !canPublish || isPublishing,
    });

    return () => {
      setCustomNavigation(undefined);
    };
  }, [canPublish, isPublishing, setCustomNavigation]);

  const handlePublish = async () => {
    if (!office?.id || !canPublish) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      await publishTransportOffice(office.id);
      router.push('/offices');
    } catch (error) {
      console.error('Error publishing office:', error);
      setPublishError('Failed to publish office. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleStepClick = (link: string) => {
    router.push(`/transport-host/${params.id}/${link}`);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Review and publish</h1>
          <p className="text-muted-foreground">
            Review your office setup before publishing. Once published, your
            office will be visible to travelers.
          </p>

          {office && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold text-lg">{office.name}</h3>
              {office.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {office.description}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-6">
          <div className="space-y-3">
            {steps.map((step) => (
              <button
                key={step.name}
                onClick={() => handleStepClick(step.link)}
                className="w-full p-4 rounded-lg border bg-background text-left hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        step.completed
                          ? 'bg-green-100 text-green-700'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div>
                      <p className="font-medium">{step.name}</p>
                      {step.required && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {!allRequiredComplete && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">
                  Complete required steps
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  Please complete all required steps before publishing your
                  office.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
              />
              <Label htmlFor="terms" className="text-sm leading-relaxed">
                I confirm that all information provided is accurate. I agree to
                the Terms of Service and understand that my office will be
                visible to all Mkan users.
              </Label>
            </div>

            {publishError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{publishError}</p>
              </div>
            )}

            <Button
              onClick={handlePublish}
              disabled={!canPublish || isPublishing}
              className="w-full"
              size="lg"
            >
              {isPublishing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Publishing...
                </>
              ) : (
                'Publish Office'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinishPage;
