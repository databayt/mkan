"use client";

import { useState, useCallback } from 'react';
import type { ProcessServerConfigFunction, RevertServerConfigFunction } from 'filepond';
import { validateImageFile } from '@/lib/upload-config';
import { uploadListingPhoto } from '@/lib/image-upload-client';

export interface UploadOptions {
  listingId?: number;
  type?: 'listing' | 'profile' | 'document';
  folder?: string;
  maxFiles?: number;
  onSuccess?: (file: UploadedFile) => void;
  onError?: (error: string) => void;
}

export interface UploadedFile {
  fileId: string;
  url: string;
  name: string;
  size: number;
  filePath: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export function useImageUpload(options: UploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0, percentage: 0 });
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Upload a file: optimize → presigned PUT → S3 → attach to listing.
  // (Bytes go straight to S3; nothing streams through the Vercel function.)
  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploading(true);
      setError(null);

      const validation = validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const { url, key } = await uploadListingPhoto(file, {
        listingId: options.listingId,
      });

      const uploadedFile: UploadedFile = {
        fileId: key,
        url,
        name: file.name,
        size: file.size,
        filePath: key,
      };

      setUploadedFiles(prev => [...prev, uploadedFile]);
      options.onSuccess?.(uploadedFile);

      return uploadedFile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setError(errorMessage);
      options.onError?.(errorMessage);
      throw error;
    } finally {
      setUploading(false);
      setProgress({ loaded: 0, total: 0, percentage: 0 });
    }
  }, [options]);

  // Delete an uploaded file (removes from the listing + best-effort S3 delete).
  const deleteFile = useCallback(async (fileId: string, url: string) => {
    try {
      const params = new URLSearchParams({
        url,
        ...(fileId && { key: fileId }),
        ...(options.listingId && { listingId: options.listingId.toString() }),
      });

      const response = await fetch(`/api/upload?${params}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      setUploadedFiles(prev => prev.filter(f => f.fileId !== fileId));
      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }, [options.listingId]);

  // FilePond server configuration
  const filePondProcess: ProcessServerConfigFunction = async (
    fieldName,
    file,
    metadata,
    load,
    error,
    progress,
    abort
  ) => {
    try {
      // FilePond exposes no real progress for our fetch-based upload; report
      // start then completion so the UI still animates.
      setProgress({ loaded: 0, total: (file as File).size, percentage: 0 });
      progress(true, 0, (file as File).size);

      const uploadedFile = await uploadFile(file as File);
      load(uploadedFile.fileId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      error(errorMessage);
    }
  };

  const filePondRevert: RevertServerConfigFunction = async (
    uniqueFileId,
    load,
    error
  ) => {
    try {
      if (uniqueFileId && typeof uniqueFileId === 'object' && 'fileId' in uniqueFileId && 'url' in uniqueFileId) {
        await deleteFile(uniqueFileId.fileId as string, uniqueFileId.url as string);
      }
      load();
    } catch (err) {
      error('Failed to remove file');
    }
  };

  const filePondServer = {
    process: filePondProcess,
    revert: filePondRevert,
  };

  return {
    uploadFile,
    deleteFile,
    uploading,
    progress,
    uploadedFiles,
    error,
    filePondServer,
  };
}
