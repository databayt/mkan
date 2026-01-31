"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Info, Loader2, Clock, Shield, CheckCircle } from 'lucide-react';
import { getListing, updateListing } from '@/components/host/actions';

const InstantBookPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [instantBook, setInstantBook] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const listing = await getListing(parseInt(id));
        setInstantBook(listing.instantBook || false);
      } catch (error) {
        console.error('Error fetching listing:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchListing();
  }, [id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateListing(parseInt(id), { instantBook });
      router.back();
    } catch (error) {
      console.error('Error updating listing:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="lg:col-span-2 flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Instant Book</h1>
          <p className="text-muted-foreground">
            Allow guests to book instantly without waiting for your approval.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-5" />
              Enable Instant Book
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <Label htmlFor="instant-book" className="text-base font-medium cursor-pointer">
                  Turn on Instant Book
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Guests can book immediately without sending a request
                </p>
              </div>
              <Switch
                id="instant-book"
                checked={instantBook}
                onCheckedChange={setInstantBook}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card className={instantBook ? 'border-green-200 bg-green-50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Clock className="size-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Faster bookings</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Guests can book right away, which often means more bookings
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={instantBook ? 'border-green-200 bg-green-50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="size-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Better visibility</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Instant Book listings appear higher in search results
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="size-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">You're still protected</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Even with Instant Book, you can still set requirements for guests (like verified ID) and can cancel penalty-free if a guest doesn't meet your requirements.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InstantBookPage;
