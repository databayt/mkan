"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import HostStepLayout from '@/components/host/host-step-layout';
import { useListing } from '@/components/host/use-listing';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { uploadListingPhoto } from '@/lib/image-upload-client';
import { toast } from 'sonner';

interface PhotosPageProps {
  params: Promise<{ id: string }>;
}

const PhotosPageContent = ({ params }: PhotosPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const [id, setId] = React.useState<string>('');
  const { enableNext } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
      // Load the listing data in the background
      const listingId = parseInt(resolvedParams.id);
      if (!isNaN(listingId)) {
        loadListing(listingId).catch(console.error);
      }
    });
  }, [params, loadListing]);

  // Load existing photos from listing
  React.useEffect(() => {
    if (listing?.photoUrls) {
      setUploadedPhotos(listing.photoUrls);
    }
  }, [listing]);

  // Enable next button since photos are optional
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  // Uploads the file directly to ImageKit and returns its persistent URL.
  // Rejects non-image types and >10MB files before hitting the server.
  const uploadFile = async (file: File): Promise<string> => {
    const uploaded = await uploadListingPhoto(file, { listingId: id });
    return uploaded.url;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setIsUploading(true);
      
      try {
        const newPhotos: string[] = [];

        for (const file of Array.from(files)) {
          try {
            const photoUrl = await uploadFile(file);
            newPhotos.push(photoUrl);
          } catch (err) {
            toast.error(
              err instanceof Error
                ? `${file.name}: ${err.message}`
                : `Could not upload ${file.name}`
            );
          }
        }

        if (newPhotos.length > 0) {
          const updatedPhotos = [...uploadedPhotos, ...newPhotos];
          setUploadedPhotos(updatedPhotos);
          // The /api/upload call already pushes each URL into the listing,
          // but we also update the draft state so the UI stays in sync
          // without needing a reload.
          await updateListingData({ photoUrls: updatedPhotos });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    }
    
    // Reset input
    event.target.value = '';
  };

  const handleSingleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploading(true);
      
      try {
        const photoUrl = await uploadFile(file);
        const updatedPhotos = [...uploadedPhotos, photoUrl];
        setUploadedPhotos(updatedPhotos);

        await updateListingData({ photoUrls: updatedPhotos });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    }
    
    // Reset input
    event.target.value = '';
  };

  const removePhoto = async (index: number) => {
    const updatedPhotos = uploadedPhotos.filter((_, i) => i !== index);
    setUploadedPhotos(updatedPhotos);
    
    // Update backend
    try {
      await updateListingData({
        photoUrls: updatedPhotos
      });
    } catch (error) {
      console.error('Error removing photo:', error);
    }
  };

  const renderUploadBoxes = () => {
    const boxes = [];
    const maxPhotos = 9; // Allow more photos since we're using 3 per row
    
    // Render uploaded photos
    for (let i = 0; i < uploadedPhotos.length; i++) {
      const photoUrl = uploadedPhotos[i];
      if (!photoUrl) continue;
      boxes.push(
        <div
          key={`photo-${i}`}
          className="border border-solid border-foreground rounded-lg bg-muted h-[100px] sm:h-[140px]"
        >
          <div className="relative w-full h-full group">
            <Image
              src={photoUrl}
              alt={`Photo ${i + 1}`}
              fill
              className="object-cover rounded-lg"
            />
            <button
              onClick={() => removePhoto(i)}
              className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        </div>
      );
    }
    
    // Add the "add button" box if we haven't reached max photos
    if (uploadedPhotos.length < maxPhotos) {
      boxes.push(
        <div
          key="add-button"
          className="border border-dashed border-muted-foreground rounded-lg bg-muted h-[100px] sm:h-[140px]"
        >
          <div className="w-full h-full flex flex-col items-center justify-center">
            <label
              htmlFor="photo-upload-add"
              className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-muted-foreground/10 transition-colors"
            >
              <Plus size={24} className="text-muted-foreground" />
            </label>
            <input
              id="photo-upload-add"
              type="file"
              accept="image/*"
              onChange={handleSingleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
          </div>
        </div>
      );
    }
    
    return boxes;
  };

  return (
    <div className="">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-20 items-start">
          {/* Left side - Text content */}
          <div className="space-y-3 sm:space-y-4">
            <h3>
              {dict.hosting.pages.photos.title}
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              {dict.hosting.pages.photos.subtitle}
            </p>
          </div>
          
          {/* Right side - Upload boxes */}
          <div>
            {uploadedPhotos.length === 0 ? (
              // Initial large upload box
              <div className="border border-dashed border-muted-foreground rounded-lg text-center bg-muted h-[200px] sm:h-[300px] flex flex-col justify-center">
                <div className="">
                  <div className="relative w-20 h-20 sm:w-32 sm:h-32 mx-auto">
                    <Image
                      src="/assets/camera.avif"
                      alt="Camera"
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="photo-upload"
                    className="inline-block px-3 py-1.5 border border-foreground rounded-md bg-background hover:bg-accent cursor-pointer transition-colors text-sm sm:text-base"
                  >
                    {isUploading ? dict.hosting.pages.photos.uploading : dict.hosting.pages.photos.addPhotos}
                  </label>
                  <input
                    id="photo-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </div>
              </div>
            ) : (
              // Grid of photos
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {renderUploadBoxes()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotosPageContent; 