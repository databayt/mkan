"use client";
import { cdn } from "@/lib/cdn";

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
    <svg
      viewBox="0 0 1007 1080"
      className="w-5 h-5 text-[#FF385C] fill-current"
      aria-hidden="true"
    >
      <path d="M949.278 666.715C875.957 506.859 795.615 344.664 713.713 184.809C698.893 155.177 670.813 98.2527 645.852 67.8412C609.971 24.1733 556.93 0.779785 503.109 0.779785C449.288 0.779785 396.247 24.1733 360.366 67.8412C335.406 98.2527 307.325 155.177 292.505 184.809C210.603 344.664 130.262 506.859 56.9404 666.715C47.5802 687.769 24.9598 737.675 16.3796 760.289C6.23941 787.581 0.779297 817.213 0.779297 846.845C0.779297 975.509 101.401 1079.22 235.564 1079.22C346.326 1079.22 434.468 1008.26 503.109 934.18C571.751 1008.26 659.892 1079.22 770.655 1079.22C904.817 1079.22 1006.22 975.509 1006.22 846.845C1006.22 817.213 999.979 787.581 989.839 760.289C981.259 737.675 958.638 687.769 949.278 666.715ZM503.109 810.195C447.728 738.455 396.247 649.56 396.247 577.819C396.247 506.079 446.948 470.209 503.109 470.209C559.27 470.209 610.751 508.419 610.751 577.819C610.751 647.22 558.49 738.455 503.109 810.195ZM770.655 998.902C688.628 998.902 618.271 941.557 555.955 872.656C620.205 792.541 691.093 679.121 691.093 577.819C691.093 458.513 598.271 389.892 503.109 389.892C407.947 389.892 315.906 458.513 315.906 577.819C315.906 679.098 386.294 792.478 450.318 872.593C387.995 941.526 317.614 998.902 235.564 998.902C146.642 998.902 81.1209 931.061 81.1209 846.845C81.1209 826.57 84.241 807.856 91.2611 788.361C98.2812 770.426 120.902 720.52 130.262 701.025C203.583 541.17 282.365 380.534 364.267 220.679C379.087 191.047 404.047 141.921 422.768 119.307C443.048 94.3538 471.129 81.0975 503.109 81.0975C535.09 81.0975 563.17 94.3538 583.451 119.307C602.171 141.921 627.132 191.047 641.952 220.679C723.854 380.534 802.635 541.17 875.957 701.025C885.317 720.52 907.937 770.426 914.957 788.361C921.978 807.856 925.878 826.57 925.878 846.845C925.878 931.061 859.576 998.902 770.655 998.902Z" />
    </svg>
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
            src={cdn.product("assets/place.webp")}
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
            src={cdn.product("assets/stand-out.webp")}
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
            src={cdn.product("assets/publish.png")}
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
            src="/assets/transport-office.webp"
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
            src="/assets/transport-bus.webp"
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
            src="/assets/transport-schedule.webp"
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
