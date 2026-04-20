import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, ArrowLeft, AlertCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const VerifyListingPage = async ({ params }: PageProps) => {
  const { id } = await params;
  
  const requiredSteps = [
    { 
      title: 'Add at least 5 photos', 
      completed: false, 
      description: 'Show guests what your place looks like',
      action: 'Add photos'
    },
    { 
      title: 'Create a title', 
      completed: true, 
      description: 'Help guests find your listing',
      action: 'Add title'
    },
    { 
      title: 'Write a description', 
      completed: false, 
      description: 'Share what makes your place special',
      action: 'Add description'
    },
    { 
      title: 'Set your price', 
      completed: false, 
      description: 'Decide how much to charge per night',
      action: 'Set price'
    },
    { 
      title: 'Add check-in instructions', 
      completed: false, 
      description: 'Help guests access your place',
      action: 'Add instructions'
    },
    { 
      title: 'Verify your phone number', 
      completed: false, 
      description: 'Required for account security',
      action: 'Verify'
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
          <span>Back to listing editor</span>
        </Button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-3xl font-semibold">Complete your listing</h1>
            <Badge variant="secondary">
              {completedCount}/{totalSteps} completed
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Finish these steps to publish your listing and start welcoming guests.
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
                    {step.completed ? 'Completed' : step.action}
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
              <h3 className="font-medium text-blue-900 mb-2">Ready to publish?</h3>
              <p className="text-sm text-blue-700 mb-4">
                Once you complete all required steps, you can publish your listing and start receiving bookings.
              </p>
              <Button disabled={completedCount !== totalSteps}>
                Publish listing
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyListingPage;
