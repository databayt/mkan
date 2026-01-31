"use client";

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link2, Copy, Check, Info, ExternalLink } from 'lucide-react';

const CustomLinkPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [customSlug, setCustomSlug] = useState('');
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mkan.com';
  const fullUrl = customSlug
    ? `${baseUrl}/p/${customSlug}`
    : `${baseUrl}/listing/${id}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSlugChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setCustomSlug(sanitized);
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Custom link</h1>
          <p className="text-muted-foreground">
            Create a memorable, shareable link for your listing.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-5" />
              Your listing URL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="slug">Custom URL slug (optional)</Label>
              <div className="flex items-center mt-2">
                <span className="px-3 py-2 bg-gray-100 border border-r-0 rounded-l-md text-sm text-muted-foreground">
                  {baseUrl}/p/
                </span>
                <Input
                  id="slug"
                  placeholder="my-amazing-place"
                  className="rounded-l-none"
                  value={customSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Use lowercase letters, numbers, and hyphens only
              </p>
            </div>

            <div className="border-t pt-4">
              <Label>Your shareable link</Label>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 p-3 bg-gray-50 border rounded-lg text-sm font-mono truncate">
                  {fullUrl}
                </div>
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quick share</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <span className="text-2xl">📧</span>
                <span className="text-sm">Email</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <span className="text-2xl">💬</span>
                <span className="text-sm">Messages</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <span className="text-2xl">📱</span>
                <span className="text-sm">Social</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Why use a custom link?</h4>
                <p className="text-sm text-blue-700 mt-1">
                  A custom URL is easier to remember and share. It looks more professional when you share it on social media, business cards, or in messages.
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

export default CustomLinkPage;
