import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Info } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const PricingPage = async ({ params }: PageProps) => {
  const { id } = await params;
  
  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Now, set your price</h1>
          <p className="text-muted-foreground">
            You can change it anytime. Research similar listings in your area to help you pick the right price.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="size-5" />
              Base price
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="price">Price per night (USD)</Label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                <Input 
                  id="price"
                  type="number"
                  placeholder="0"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Price tip</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Most hosts in your area charge $85–$130 per night. Consider starting with a competitive price to attract your first guests and reviews.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Guest price breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>$100 x 1 night</span>
                  <span>$100</span>
                </div>
                <div className="flex justify-between">
                  <span>Airbnb service fee</span>
                  <span>$14</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-2">
                  <span>Total</span>
                  <span>$114</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">
            Back
          </Button>
          <Button>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
