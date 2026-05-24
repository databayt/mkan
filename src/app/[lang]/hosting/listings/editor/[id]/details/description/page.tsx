"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileText, Info, Loader2 } from 'lucide-react';
import { getListing, updateListing } from '@/components/host/actions';
import { useParams } from 'next/navigation';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const DescriptionPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const dict = useDictionary();
  const t = dict?.listingEditor?.description;

  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const listing = await getListing(parseInt(id));
        setDescription(listing.description || '');
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
      await updateListing(parseInt(id), { description });
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
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Create your description"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Share what makes your place special and what guests can expect during their stay."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              {t?.cardTitle ?? "About your space"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="description">{t?.label ?? "Description"}</Label>
              <Textarea
                id="description"
                placeholder={t?.placeholder ?? "Tell guests about your space, the neighborhood, and what makes your place unique..."}
                className="mt-2 min-h-[200px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
              />
              <p className="text-sm text-muted-foreground mt-2">{description.length}/5000</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">{t?.tipTitle ?? "Writing tips"}</h4>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• {t?.tip1 ?? "Highlight unique features of your space"}</li>
                    <li>• {t?.tip2 ?? "Mention the neighborhood and nearby attractions"}</li>
                    <li>• {t?.tip3 ?? "Describe the ambiance and what guests can expect"}</li>
                    <li>• {t?.tip4 ?? "Be specific about the space layout"}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{t?.previewTitle ?? "Preview"}</h4>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {description || (t?.previewPlaceholder ?? "Your description will appear here...")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            {dict?.common?.back ?? "Back"}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 me-2 animate-spin" />}
            {dict?.common?.save ?? "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DescriptionPage;
