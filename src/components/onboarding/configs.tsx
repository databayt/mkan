"use client";

import React from 'react';
import Image from 'next/image';
import { Bus, Building2, CalendarCheck } from 'lucide-react';
import type { OnboardingFooterConfig, StepsOverviewConfig } from './types';

/**
 * Host (Property Listing) Footer Configuration
 */
export const HOST_FOOTER_CONFIG: OnboardingFooterConfig = {
  steps: [
    'about-place',
    'structure',
    'privacy-type',
    'location',
    'floor-plan',
    'stand-out',
    'amenities',
    'photos',
    'title',
    'description',
    'finish-setup',
    'instant-book',
    'visibility',
    'price',
    'discount',
    'legal'
  ],
  stepGroups: {
    1: ['about-place', 'structure', 'privacy-type', 'location', 'floor-plan', 'stand-out'],
    2: ['amenities', 'photos', 'title', 'description', 'finish-setup'],
    3: ['instant-book', 'visibility', 'price', 'discount', 'legal']
  },
  stepLabels: [
    "Tell us about your place",
    "Make it stand out",
    "Finish up and publish"
  ],
  routeBase: '/host',
  finalStep: 'legal',
  finalRedirect: '/hosting/listings',
  finalButtonLabel: 'Create listing',
  icon: (
    <Image
      src="/tent.png"
      alt="Tent icon"
      width={20}
      height={20}
      className="object-contain"
    />
  ),
  buttonVariant: 'black',
};

/**
 * Transport Office Footer Configuration
 */
export const TRANSPORT_FOOTER_CONFIG: OnboardingFooterConfig = {
  steps: [
    'office-info',
    'assembly-point',
    'buses',
    'routes',
    'schedule',
    'photos',
    'finish'
  ],
  stepGroups: {
    1: ['office-info', 'assembly-point'],
    2: ['buses', 'routes', 'schedule'],
    3: ['photos', 'finish']
  },
  stepLabels: [
    "Office details",
    "Fleet & routes",
    "Photos & publish"
  ],
  routeBase: '/transport-host',
  finalStep: 'finish',
  finalRedirect: '/offices',
  finalButtonLabel: 'Publish office',
  icon: <Bus className="h-5 w-5" />,
  buttonVariant: 'default',
};

/**
 * Host (Property Listing) Overview Configuration
 */
export const HOST_OVERVIEW_CONFIG: StepsOverviewConfig = {
  steps: [
    {
      number: 1,
      title: "Tell us about your place",
      description: "Share some basic info, like where it is and how many guests can stay.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/place.webp"
            alt="Place illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
    {
      number: 2,
      title: "Make it stand out",
      description: "Add 5 or more photos plus a title and description—we'll help you out.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/stand-out.webp"
            alt="Stand out illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
    {
      number: 3,
      title: "Finish up and publish",
      description: "Choose a starting price, verify a few details, then publish your listing.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/publish.png"
            alt="Publish illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
  ],
};

/**
 * Transport Office Overview Configuration
 * Currently uses icons but can be updated to use illustrations
 */
export const TRANSPORT_OVERVIEW_CONFIG: StepsOverviewConfig = {
  steps: [
    {
      number: 1,
      title: "Set up your office",
      description: "Enter your office details, contact information, and select your assembly point location.",
      illustration: <Building2 className="h-12 w-12 text-primary" />,
    },
    {
      number: 2,
      title: "Add buses & routes",
      description: "Register your buses with amenities and capacities, then define your routes with pricing.",
      illustration: <Bus className="h-12 w-12 text-primary" />,
    },
    {
      number: 3,
      title: "Create schedules & publish",
      description: "Set up trip schedules, add photos, and publish your office to start receiving bookings.",
      illustration: <CalendarCheck className="h-12 w-12 text-primary" />,
    },
  ],
  subheadline: "Set up your transport office in minutes and start accepting online bookings from travelers.",
};

/**
 * Transport Office Overview Configuration with Airbnb-style illustrations
 * Use this config when illustrations are available
 */
export const TRANSPORT_OVERVIEW_CONFIG_WITH_ILLUSTRATIONS: StepsOverviewConfig = {
  steps: [
    {
      number: 1,
      title: "Set up your office",
      description: "Enter your office details, contact information, and select your assembly point location.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/transport-office.webp"
            alt="Office illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
    {
      number: 2,
      title: "Add buses & routes",
      description: "Register your buses with amenities and capacities, then define your routes with pricing.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/transport-bus.webp"
            alt="Bus illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
    {
      number: 3,
      title: "Create schedules & publish",
      description: "Set up trip schedules, add photos, and publish your office to start receiving bookings.",
      illustration: (
        <div className="relative w-24 h-24 overflow-hidden">
          <Image
            src="/airbnb/transport-schedule.webp"
            alt="Schedule illustration"
            fill
            className="object-contain"
          />
        </div>
      ),
    },
  ],
  subheadline: "Set up your transport office in minutes and start accepting online bookings from travelers.",
};
