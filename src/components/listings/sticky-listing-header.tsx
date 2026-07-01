"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Phone, X } from "lucide-react";

interface StickyListingHeaderProps {
  price: number;
  rating: number;
  reviewCount: number;
  ownerPhone?: string;
  reserveElement?: React.RefObject<HTMLDivElement | null>;
  onCallButtonMerge?: (isMerged: boolean) => void;
}

export default function StickyListingHeader({
  price,
  rating,
  reviewCount,
  ownerPhone = "+249123456789",
  reserveElement,
  onCallButtonMerge,
}: StickyListingHeaderProps) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);
  const [showCallButton, setShowCallButton] = useState(false);
  const [callButtonOpacity, setCallButtonOpacity] = useState(0);
  const [activeTab, setActiveTab] = useState("photos");
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;

      // Header appears after gallery is out of view (~650px, just a bit delayed)
      const headerThreshold = 650;
      setIsHeaderVisible(scrollY > headerThreshold);

      // Call button only appears when reserve card is EXTREMELY close to header
      if (reserveElement?.current) {
        const reserveRect = reserveElement.current.getBoundingClientRect();
        const headerHeight = headerRef.current?.offsetHeight || 80;

        // Button only starts merging when card is within 50px of header (very last moment)
        const mergeStartDistance = 50;
        if (reserveRect.top < headerHeight + mergeStartDistance) {
          setShowCallButton(true);

          // Opacity increases only in the last 50px before reaching header
          const distance = Math.max(0, reserveRect.top - headerHeight);
          const opacity = Math.max(0, 1 - distance / mergeStartDistance);
          setCallButtonOpacity(opacity);
        } else {
          setShowCallButton(false);
          setCallButtonOpacity(0);
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reserveElement]);

  // Notify parent when call button merges to header
  useEffect(() => {
    onCallButtonMerge?.(showCallButton);
  }, [showCallButton, onCallButtonMerge]);

  const tabs = [
    { id: "photos", label: "Photos" },
    { id: "amenities", label: "Amenities" },
    { id: "reviews", label: "Reviews" },
    { id: "location", label: "Location" },
  ];

  const handleCallClick = () => {
    if (ownerPhone) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = `tel:${ownerPhone}`;
      } else {
        setShowPhonePrompt(true);
      }
    }
  };

  return (
    <>
      {/* Sticky header with tabs + call button (merges later) */}
      {isHeaderVisible && (
        <div
          ref={headerRef}
          className="fixed inset-x-0 top-0 z-40 bg-white"
          style={{
            boxShadow: "rgba(0, 0, 0, 0.1) 0px 1px 0px",
          }}
        >
          <div className="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between gap-4 lg:h-20 lg:gap-8">
              {/* Left: Navigation tabs (always visible) */}
              <div className="flex flex-1 items-center gap-4 overflow-x-auto lg:gap-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative whitespace-nowrap border-b-2 px-0 py-3 text-xs font-medium transition-colors duration-200 lg:py-4 lg:text-sm ${
                      activeTab === tab.id
                        ? "border-[#222222] text-[#222222]"
                        : "border-transparent text-[#6A6A6A] hover:text-[#222222]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right: Call button appears when reserve card merges */}
              {showCallButton && (
                <button
                  onClick={handleCallClick}
                  className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#E61E4D] via-[#E31C5F] to-[#D70466] px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:shadow-lg active:scale-95"
                  style={{
                    opacity: callButtonOpacity,
                  }}
                  title="Call owner"
                >
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>Call</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone prompt modal */}
      {showPhonePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-[#222222]">
                Contact Owner
              </h3>
              <button
                onClick={() => setShowPhonePrompt(false)}
                className="rounded-lg p-1 transition-colors hover:bg-[#F7F7F7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-[#6A6A6A]">
              Call the property owner about this listing:
            </p>
            <div className="space-y-3">
              <a
                href={`tel:${ownerPhone}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#E61E4D] to-[#D70466] px-4 py-3 font-medium text-white transition-all hover:shadow-lg active:scale-95"
              >
                <Phone className="h-4 w-4" />
                {ownerPhone}
              </a>
              <button
                onClick={() => setShowPhonePrompt(false)}
                className="w-full rounded-lg border border-[#DDDDDD] px-4 py-2.5 font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
