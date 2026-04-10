"use client";

import React, { useState } from 'react';
import { Search, MapPin, Calendar, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname } from 'next/navigation';

interface SearchState {
  where: string;
  checkIn: string;
  checkOut: string;
  guests: string;
}

const MobileListingsHeader = () => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<'where' | 'checkIn' | 'checkOut' | 'guests'>('where');
  const [searchState, setSearchState] = useState<SearchState>({
    where: isAr ? 'أي مكان' : 'Anywhere',
    checkIn: isAr ? 'تسجيل الوصول' : 'Check in',
    checkOut: isAr ? 'المغادرة' : 'Check out',
    guests: isAr ? 'أضف ضيوف' : 'Add guests'
  });

  const handleStepComplete = (step: keyof SearchState, value: string) => {
    setSearchState(prev => ({ ...prev, [step]: value }));
    
    // Auto-advance to next step
    switch (step) {
      case 'where':
        setCurrentStep('checkIn');
        break;
      case 'checkIn':
        setCurrentStep('checkOut');
        break;
      case 'checkOut':
        setCurrentStep('guests');
        break;
      case 'guests':
        setIsOpen(false);
        break;
    }
  };

  const handleSearch = () => {
    // Handle search logic here
    console.log('Search with:', searchState);
    setIsOpen(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 md:hidden">
      <div className="flex items-center justify-center p-4 pt-6">
        <div className="relative w-full max-w-sm">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <div className="relative flex items-center">
                <div className="w-full h-14 ps-6 pe-16 text-base border rounded-full shadow-lg bg-[#ffffff] placeholder:text-[#6b7280] focus-visible:ring-2 focus-visible:ring-[#de3151] focus-visible:ring-offset-0 flex items-center cursor-pointer">
                  <span className="text-[#6b7280]">{isAr ? "ابدأ البحث" : "Start your search"}</span>
                </div>
                <Button
                  size="icon"
                  className="absolute right-2 h-10 w-10 rounded-full bg-[#de3151] hover:bg-[#c42a47] focus-visible:ring-2 focus-visible:ring-[#de3151] focus-visible:ring-offset-2"
                >
                  <Search className="h-5 w-5 text-[#ffffff]" />
                  <span className="sr-only">{isAr ? "ابدأ البحث" : "Start your search"}</span>
                </Button>
              </div>
            </DropdownMenuTrigger>
            
            <DropdownMenuContent 
            className="w-screen h-screen max-w-none rounded-none border-0 shadow-none bg-white p-0"
            side="bottom"
            align="start"
            sideOffset={0}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{isAr ? "تعديل البحث" : "Edit your search"}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8"
                  aria-label="Close search"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Where Section */}
                {currentStep === 'where' && (
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-4">{isAr ? "إلى أين؟" : "Where to?"}</h3>
                    <div className="space-y-3">
                      {(isAr
                        ? ['أي مكان', 'مرن', 'السودان', 'الخليج', 'أفريقيا', 'أوروبا']
                        : ['Anywhere', 'I\'m flexible', 'United States', 'Europe', 'Asia', 'Africa']
                      ).map((location) => (
                        <button
                          key={location}
                          onClick={() => handleStepComplete('where', location)}
                          className="w-full text-start p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <MapPin className="w-5 h-5 text-gray-600" />
                            <span className="font-medium">{location}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Check-in Section */}
                {currentStep === 'checkIn' && (
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-4">{isAr ? "متى تسافر؟" : "When are you traveling?"}</h3>
                    <div className="space-y-3">
                      {(isAr
                        ? ['مرن', 'نهاية هذا الأسبوع', 'الأسبوع القادم', 'الشهر القادم', 'الصيف']
                        : ['I\'m flexible', 'This weekend', 'Next week', 'Next month', 'Summer 2024']
                      ).map((date) => (
                        <button
                          key={date}
                          onClick={() => handleStepComplete('checkIn', date)}
                          className="w-full text-start p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            <span className="font-medium">{date}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Check-out Section */}
                {currentStep === 'checkOut' && (
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-4">{isAr ? "كم مدة إقامتك؟" : "How long are you staying?"}</h3>
                    <div className="space-y-3">
                      {(isAr
                        ? ['ليلة واحدة', 'ليلتان', '3 ليالي', 'أسبوع', 'أسبوعان', 'شهر']
                        : ['1 night', '2 nights', '3 nights', '1 week', '2 weeks', '1 month']
                      ).map((duration) => (
                        <button
                          key={duration}
                          onClick={() => handleStepComplete('checkOut', duration)}
                          className="w-full text-start p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            <span className="font-medium">{duration}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Guests Section */}
                {currentStep === 'guests' && (
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-4">{isAr ? "من سيحضر؟" : "Who's coming?"}</h3>
                    <div className="space-y-3">
                      {(isAr
                        ? ['ضيف واحد', 'ضيفان', '3 ضيوف', '4 ضيوف', '5+ ضيوف', 'مرن']
                        : ['1 guest', '2 guests', '3 guests', '4 guests', '5+ guests', 'I\'m flexible']
                      ).map((guest) => (
                        <button
                          key={guest}
                          onClick={() => handleStepComplete('guests', guest)}
                          className="w-full text-start p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Users className="w-5 h-5 text-gray-600" />
                            <span className="font-medium">{guest}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200">
                <Button
                  onClick={handleSearch}
                  className="w-full bg-[#de3151] hover:bg-[#de3151]/90 text-white"
                >
                  {isAr ? "بحث" : "Search"}
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default MobileListingsHeader; 