"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar, Info, CheckCircle } from 'lucide-react';

const policies = [
  {
    id: 'flexible',
    name: 'Flexible',
    description: 'Full refund 1 day prior to arrival',
    details: [
      'Full refund for cancellations made at least 24 hours before check-in',
      'If cancelled less than 24 hours before check-in, the first night is non-refundable',
      'Cleaning fees are always refunded if the guest did not check in',
    ],
    recommended: true,
  },
  {
    id: 'moderate',
    name: 'Moderate',
    description: 'Full refund 5 days prior to arrival',
    details: [
      'Full refund for cancellations made at least 5 days before check-in',
      'If cancelled less than 5 days before check-in, 50% refund of nightly rate',
      'Cleaning fees are always refunded if the guest did not check in',
    ],
    recommended: false,
  },
  {
    id: 'firm',
    name: 'Firm',
    description: 'Full refund 30 days prior to arrival',
    details: [
      'Full refund for cancellations made at least 30 days before check-in',
      'If cancelled less than 30 days before check-in, 50% refund of nightly rate',
      'If cancelled less than 7 days before check-in, no refund',
    ],
    recommended: false,
  },
  {
    id: 'strict',
    name: 'Strict',
    description: '50% refund up to 1 week prior to arrival',
    details: [
      '50% refund for cancellations made at least 7 days before check-in',
      'No refund for cancellations made less than 7 days before check-in',
      'Cleaning fees are always refunded if the guest did not check in',
    ],
    recommended: false,
  },
  {
    id: 'non-refundable',
    name: 'Non-refundable',
    description: 'Guests pay 10% less, no refund',
    details: [
      'No refunds at any time',
      'Guests get a 10% discount on their booking',
      'Best for hosts who want to minimize cancellations',
    ],
    recommended: false,
  },
];

const CancellationPolicyPage = () => {
  const router = useRouter();
  const [selectedPolicy, setSelectedPolicy] = useState('flexible');

  const selected = policies.find(p => p.id === selectedPolicy);

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Cancellation policy</h1>
          <p className="text-muted-foreground">
            Choose a policy that works for you. This determines when guests can cancel and get a refund.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              Select your policy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedPolicy} onValueChange={setSelectedPolicy}>
              <div className="space-y-4">
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    onClick={() => setSelectedPolicy(policy.id)}
                    className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedPolicy === policy.id
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <RadioGroupItem value={policy.id} id={policy.id} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={policy.id} className="text-base font-medium cursor-pointer">
                          {policy.name}
                        </Label>
                        {policy.recommended && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{policy.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {selected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{selected.name} policy details</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {selected.details.map((detail, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle className="size-5 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-sm">{detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Choosing the right policy</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Flexible policies tend to get more bookings because guests feel more comfortable booking. Stricter policies give you more protection against last-minute cancellations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CancellationPolicyPage;
