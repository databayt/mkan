"use client";

import React, { useState } from 'react';
import { FilePond, registerPlugin } from 'react-filepond';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';

// Import FilePond styles
import 'filepond/dist/filepond.min.css';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';

import { useImageUpload } from '@/hooks/use-image-upload';
import { cn } from '@/lib/utils';

// Register FilePond plugins
registerPlugin(
  FilePondPluginImageExifOrientation,
  FilePondPluginImagePreview,
  FilePondPluginFileValidateType
);

interface ImageUploadProps {
  listingId?: number;
  type?: 'listing' | 'profile' | 'document';
  folder?: string;
  maxFiles?: number;
  existingImages?: string[];
  onImagesChange?: (images: string[]) => void;
  className?: string;
}

export function ImageUpload({
  listingId,
  type = 'listing',
  folder = '/listings',
  maxFiles = 10,
  existingImages = [],
  onImagesChange,
  className,
}: ImageUploadProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(existingImages);

  const { filePondServer, uploading, error } = useImageUpload({
    listingId,
    type,
    folder,
    maxFiles,
    onSuccess: (file) => {
      const newUrls = [...imageUrls, file.url];
      setImageUrls(newUrls);
      onImagesChange?.(newUrls);
    },
    onError: (error) => {
      console.error('Upload error:', error);
    },
  });

  return (
    <div className={cn('w-full', className)}>
      <FilePond
        files={files}
        onupdatefiles={setFiles}
        allowMultiple={maxFiles > 1}
        maxFiles={maxFiles}
        server={filePondServer as any}
        name="images"
        labelIdle='Drag & Drop your images or <span class="filepond--label-action">Browse</span>'
        acceptedFileTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
        credits={false}
        allowImagePreview={true}
        imagePreviewHeight={200}
        stylePanelLayout="compact"
        styleLoadIndicatorPosition="center bottom"
        styleProgressIndicatorPosition="right bottom"
        styleButtonRemoveItemPosition="left bottom"
        styleButtonProcessItemPosition="right bottom"
      />
      
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {imageUrls.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Uploaded Images ({imageUrls.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {imageUrls.map((url, index) => (
              <div key={index} className="relative group">
                <img
                  src={url}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    const newUrls = imageUrls.filter((_, i) => i !== index);
                    setImageUrls(newUrls);
                    onImagesChange?.(newUrls);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}