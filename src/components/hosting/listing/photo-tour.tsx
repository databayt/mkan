"use client";

import React from 'react';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface PhotoTourProps {
  listingId: string;
}

const PhotoTour = ({ listingId }: PhotoTourProps) => {
  const rooms = [
    {
      id: 'bedroom',
      name: 'Bedroom',
      status: 'add-photos',
      photoCount: 0,
      image: '/hosting/bedroom.png',
    },
    {
      id: 'bathroom',
      name: 'Bathroom',
      status: 'add-photos',
      photoCount: 0,
      image: '/hosting/bathroom.png',
    },
    {
      id: 'additional',
      name: 'Additional photos',
      status: 'has-photos',
      photoCount: 5,
      image: null,
    },
  ];

  const PhotoOverlayIcon = () => (
    <svg 
      viewBox="0 0 32 32" 
      xmlns="http://www.w3.org/2000/svg" 
      style={{display: 'block', fill: 'none', height: '16px', width: '16px', stroke: 'currentColor', strokeWidth: 3, overflow: 'visible'}} 
      aria-hidden="true" 
      role="presentation" 
      focusable="false"
    >
      <g>
        <path d="m9.37059905 10.0233417c.18293611-1.03748223.45734027-2.59370556.82321245-4.66866999.383613-2.17557722 2.4582465-3.62825127 4.6338238-3.24463831l11.817693 2.08377814c2.1755772.38361296 3.6282513 2.4582465 3.2446383 4.63382372l-2.0837781 11.81769304c-.383613 2.1755772-2.4582465 3.6282513-4.6338238 3.2446383-.5125818-.090382-.8970182-.1581685-1.1533092-.2033595"></path>
        <path d="m6 10h12c2.209139 0 4 1.790861 4 4v12c0 2.209139-1.790861 4-4 4h-12c-2.209139 0-4-1.790861-4-4v-12c0-2.209139 1.790861-4 4-4z"></path>
      </g>
    </svg>
  );

  return (
    <div className="lg:col-span-2">
      <div className="flex items-center justify-between mb-8">
        <h3>Photo tour</h3>
        <div className="flex items-center space-x-4">
          <Button variant="default" className="gap-2 rounded-full bg-muted text-primary">
            <PhotoOverlayIcon />
            <span>All photos</span>
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" aria-label="Add photo">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <p className="mb-8">
        Manage photos and add details. Guests will only see your tour if every room has a photo.
      </p>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {rooms.map((room) => (
          <div key={room.id} className="">
            {/* Image */}
            <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden rounded-xl">
              {room.image ? (
                <Image
                  src={room.image}
                  alt={room.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <Avatar className="size-16">
                  <AvatarFallback className="text-2xl">
                    👤
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            
            {/* Room name */}
            <h5>{room.name}</h5>
            
            {/* Action button/badge */}
            {room.status === 'add-photos' ? (
              <Button variant="link" size="sm" className="self-start">
                Add photos
              </Button>
            ) : (
              <Badge variant="secondary" className="self-start">
                {room.photoCount} photos
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhotoTour;
