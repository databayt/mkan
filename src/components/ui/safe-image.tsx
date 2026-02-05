"use client"

import React, { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { cn } from '@/lib/utils';
import { getFallbackImage } from '@/lib/image-utils';

export interface SafeImageProps extends Omit<ImageProps, 'onError'> {
  fallbackSrc?: string;
  fallbackType?: 'property' | 'avatar' | 'placeholder';
}

/**
 * SafeImage component that handles image loading errors gracefully
 * Automatically falls back to a placeholder image if the main image fails to load
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  fallbackType = 'property',
  ...props
}: SafeImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(src as string);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      const fallback = fallbackSrc || getFallbackImage(
        props.width as number,
        props.height as number,
        fallbackType
      );
      setImgSrc(fallback);
    }
  };

  return (
    <Image
      {...props}
      src={imgSrc || getFallbackImage()}
      alt={alt}
      className={cn(
        "transition-opacity duration-300",
        hasError && "opacity-70",
        className
      )}
      onError={handleError}
      placeholder="blur"
      blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZTVlN2ViIi8+PC9zdmc+"
    />
  );
}