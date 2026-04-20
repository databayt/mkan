"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ListingSidebarProps {
  listingId: string;
}

const ListingSidebar = ({ listingId }: ListingSidebarProps) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'details' | 'travel'>('details');

  const detailsLinks = [
    { title: 'Photo tour', path: `/hosting/listings/editor/${listingId}/details/photo-tour`, description: '1 bedroom • 1 bed • 1 bath' },
    { title: 'Title', path: `/hosting/listings/editor/${listingId}/details/title`, description: 'hello makan' },
    { title: 'Property type', path: `/hosting/listings/editor/${listingId}/details/property-type`, description: 'Entire place • House' },
    { title: 'Pricing', path: `/hosting/listings/editor/${listingId}/details/pricing`, description: 'SDG 100 per night' },
    { title: 'Availability', path: `/hosting/listings/editor/${listingId}/details/availability`, description: 'Calendar and availability' },
    { title: 'Number of guests', path: `/hosting/listings/editor/${listingId}/details/number-of-guests`, description: 'Guest capacity' },
    { title: 'Description', path: `/hosting/listings/editor/${listingId}/details/description`, description: 'About your space' },
    { title: 'Amenities', path: `/hosting/listings/editor/${listingId}/details/amenities`, description: 'What you offer' },
    { title: 'Accessibility', path: `/hosting/listings/editor/${listingId}/details/accessibility`, description: 'Accessibility features' },
    { title: 'Location', path: `/hosting/listings/editor/${listingId}/details/location`, description: 'Where you\'re located' },
    { title: 'Host', path: `/hosting/listings/editor/${listingId}/details/host`, description: 'About you' },
    { title: 'Co-hosts', path: `/hosting/listings/editor/${listingId}/details/co-hosts`, description: 'Manage co-hosts' },
    { title: 'Instant book', path: `/hosting/listings/editor/${listingId}/details/instant-book`, description: 'Booking settings' },
    { title: 'House rules', path: `/hosting/listings/editor/${listingId}/details/house-rules`, description: 'Rules for guests' },
    { title: 'Guest safety', path: `/hosting/listings/editor/${listingId}/details/guest-safety`, description: 'Safety information' },
    { title: 'Cancellation policy', path: `/hosting/listings/editor/${listingId}/details/cancellation-policy`, description: 'Cancellation terms' },
    { title: 'Custom link', path: `/hosting/listings/editor/${listingId}/details/custom-link`, description: 'Custom booking link' },
  ];

  const travelLinks = [
    { title: 'Check-in and checkout', path: `/hosting/listings/editor/${listingId}/travel/check-in-out`, description: 'Check-in times' },
    { title: 'Directions', path: `/hosting/listings/editor/${listingId}/travel/directions`, description: 'Getting there' },
    { title: 'Check-in method', path: `/hosting/listings/editor/${listingId}/travel/check-in-method`, description: 'How guests check in' },
    { title: 'Wifi details', path: `/hosting/listings/editor/${listingId}/travel/wifi-details`, description: 'Network information' },
    { title: 'House manual', path: `/hosting/listings/editor/${listingId}/travel/house-manual`, description: 'How things work' },
    { title: 'House rules', path: `/hosting/listings/editor/${listingId}/travel/house-rules`, description: 'Rules for guests' },
    { title: 'Checkout instructions', path: `/hosting/listings/editor/${listingId}/travel/checkout-instructions`, description: 'Checkout process' },
    { title: 'Guidebooks', path: `/hosting/listings/editor/${listingId}/travel/guidebooks`, description: 'Local recommendations' },
    { title: 'Interaction preferences', path: `/hosting/listings/editor/${listingId}/travel/interaction-preferences`, description: 'How you interact' },
  ];

  const currentLinks = activeTab === 'details' ? detailsLinks : travelLinks;

  return (
    <div className="lg:col-span-1 lg:max-w-80 h-[calc(100vh-2rem)] overflow-y-auto">
      <Button
        variant="ghost"
        onClick={() => router.push('/hosting/listings')}
        className="gap-2 mb-6 p-0 h-auto"
      >
        <ArrowLeft className="size-5 rtl:rotate-180" />
        <span>Listing editor</span>
      </Button>

      {/* Navigation Tabs */}
      <div className="flex space-x-6 mb-8">
        <button 
          onClick={() => setActiveTab('details')}
          className={cn(
            "font-medium border-b-2 pb-2 transition-colors",
            activeTab === 'details' 
              ? "text-foreground border-foreground" 
              : "text-muted-foreground border-transparent hover:text-foreground"
          )}
        >
          Your space
        </button>
        <button 
          onClick={() => setActiveTab('travel')}
          className={cn(
            "font-medium border-b-2 pb-2 transition-colors",
            activeTab === 'travel' 
              ? "text-foreground border-foreground" 
              : "text-muted-foreground border-transparent hover:text-foreground"
          )}
        >
          Arrival guide
        </button>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground pb-2 p-0 h-auto">
          <Settings className="size-4" />
        </Button>
      </div>

      {/* Required Steps - Common to both tabs */}
      <Card 
        onClick={() => router.push(`/verify-listing/${listingId}`)} 
        className="mb-6 cursor-pointer hover:shadow-md transition-shadow"
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-destructive rounded-full"></div>
              <CardTitle className="text-lg">Complete required steps</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="p-0 h-auto">
              <ArrowLeft className="size-4 rotate-180 rtl:rotate-180" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Finish these final tasks to publish your listing and start getting booked.
          </p>
        </CardContent>
      </Card>

      {/* Dynamic Links based on active tab */}
      <div className="space-y-4">
        {currentLinks.map((link, index) => (
          <Card 
            key={index}
            onClick={() => router.push(link.path)} 
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{link.title}</CardTitle>
              {link.description && (
                <p className="text-sm text-muted-foreground">{link.description}</p>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ListingSidebar;
