'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTransportHostValidation } from '@/context/transport-host-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';

interface UploadedImage {
  id: string;
  url: string;
  type: 'logo' | 'bus' | 'office';
}

const PhotosPage = () => {
  const { enableNext } = useTransportHostValidation();
  const { office, updateOfficeData } = useTransportOffice();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (office?.logoUrl) {
      setLogoUrl(office.logoUrl);
    }
  }, [office]);

  useEffect(() => {
    enableNext();
  }, [enableNext]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'transport-offices');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setLogoUrl(data.url);
        await updateOfficeData({ logoUrl: data.url });
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newImages: UploadedImage[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'transport-buses');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          newImages.push({
            id: crypto.randomUUID(),
            url: data.url,
            type: 'bus',
          });
        }
      }

      setImages((prev) => [...prev, ...newImages]);
    } catch (error) {
      console.error('Error uploading photos:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeLogo = async () => {
    setLogoUrl(null);
    await updateOfficeData({ logoUrl: null });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Camera className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Add photos</h1>
          <p className="text-muted-foreground">
            Upload your office logo and photos of your buses. Good photos help
            travelers trust your service.
          </p>
        </div>

        <div className="flex-1 space-y-8">
          <div className="space-y-4">
            <Label>Office Logo</Label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative">
                  <img
                    src={logoUrl}
                    alt="Office logo"
                    className="h-24 w-24 rounded-lg object-cover border"
                  />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="h-24 w-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={isUploading}
                  />
                </label>
              )}
              <div className="text-sm text-muted-foreground">
                <p>Upload your office logo</p>
                <p className="text-xs mt-1">PNG, JPG up to 2MB</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Label>Bus & Office Photos (Optional)</Label>
            <div className="grid grid-cols-3 gap-3">
              {images.map((image) => (
                <div key={image.id} className="relative aspect-video">
                  <img
                    src={image.url}
                    alt="Bus photo"
                    className="w-full h-full rounded-lg object-cover border"
                  />
                  <button
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <label className="aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Add photos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotosUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Add photos of your buses, seats, and office to build trust with
              travelers
            </p>
          </div>

          {isUploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Uploading...
            </div>
          )}

          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Photo Tips
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Use well-lit photos of your buses</li>
              <li>• Show the interior and seat quality</li>
              <li>• Include any special amenities</li>
              <li>• Photos help travelers choose your service</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotosPage;
