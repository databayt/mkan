"use client";

import { useState, useCallback } from 'react';
import type { ProcessServerConfigFunction, RevertServerConfigFunction } from 'filepond';
import { validateImageFile } from '@/lib/imagekit';

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

  // Get upload authentication
  const getUploadAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/upload/auth');
      if (!response.ok) {
        throw new Error('Failed to get upload credentials');
      }
      return await response.json();
    } catch (error) {
      console.error('Auth error:', error);
      throw error;
    }
  }, []);

  // Upload file to ImageKit
  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploading(true);
      setError(null);

      // Validate file
      const validation = validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Get authentication parameters
      const auth = await getUploadAuth();

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('publicKey', auth.publicKey);
      formData.append('signature', auth.signature);
      formData.append('expire', auth.expire);
      formData.append('token', auth.token);
      formData.append('fileName', file.name);
      formData.append('useUniqueFileName', 'true');
      
      if (options.folder) {
        formData.append('folder', options.folder);
      }

      // Upload to ImageKit
      const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();

      // Save reference in our database
      const saveResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: uploadData.fileId,
          url: uploadData.url,
          filePath: uploadData.filePath,
          listingId: options.listingId,
          type: options.type || 'listing',
        }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save image reference');
      }

      const savedData = await saveResponse.json();
      
      const uploadedFile: UploadedFile = {
        fileId: uploadData.fileId,
        url: uploadData.url,
        name: uploadData.name,
        size: uploadData.size,
        filePath: uploadData.filePath,
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
  }, [options, getUploadAuth]);

  // Delete uploaded file
  const deleteFile = useCallback(async (fileId: string, url: string) => {
    try {
      const params = new URLSearchParams({
        fileId,
        url,
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
      // Update progress
      const progressHandler = (loaded: number, total: number) => {
        const percentage = Math.round((loaded / total) * 100);
        setProgress({ loaded, total, percentage });
        progress(true, loaded, total);
      };

      // Start upload
      progressHandler(0, (file as File).size);

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