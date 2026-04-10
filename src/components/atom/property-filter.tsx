"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Settings2, 
  X, 
  Wifi, 
  Car, 
  Waves, 
  Mountain, 
  Home, 
  Building, 
  TreePine,
  UtensilsCrossed
} from 'lucide-react';

interface FilterState {
  priceRange: [number, number];
  propertyTypes: string[];
  amenities: string[];
  instantBook: boolean;
  superhost: boolean;
  guestFavorites: boolean;
}

const PROPERTY_TYPES = [
  { id: 'house', label: 'House', icon: Home },
  { id: 'apartment', label: 'Apartment', icon: Building },
  { id: 'cabin', label: 'Cabin', icon: TreePine },
  { id: 'villa', label: 'Villa', icon: Mountain },
];

const AMENITIES = [
  { id: 'wifi', label: 'Wifi', icon: Wifi },
  { id: 'parking', label: 'Free parking', icon: Car },
  { id: 'pool', label: 'Pool', icon: Waves },
  { id: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed },
];

interface AirbnbFilterProps {
  onFiltersChange?: (filters: FilterState) => void;
  className?: string;
}

const AirbnbFilter: React.FC<AirbnbFilterProps> = ({ 
  onFiltersChange, 
  className = "" 
}) => {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [50, 500],
    propertyTypes: [],
    amenities: [],
    instantBook: false,
    superhost: false,
    guestFavorites: false,
  });

  const [tempFilters, setTempFilters] = useState<FilterState>(filters);

  const updateTempFilters = (updates: Partial<FilterState>) => {
    setTempFilters(prev => ({ ...prev, ...updates }));
  };

  const applyFilters = () => {
    setFilters(tempFilters);
    onFiltersChange?.(tempFilters);
    setOpen(false);
  };

  const clearFilters = () => {
    const clearedFilters = {
      priceRange: [50, 500] as [number, number],
      propertyTypes: [],
      amenities: [],
      instantBook: false,
      superhost: false,
      guestFavorites: false,
    };
    setTempFilters(clearedFilters);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.priceRange[0] > 50 || filters.priceRange[1] < 500) count++;
    if (filters.propertyTypes.length > 0) count++;
    if (filters.amenities.length > 0) count++;
    if (filters.instantBook) count++;
    if (filters.superhost) count++;
    if (filters.guestFavorites) count++;
    return count;
  };

  const togglePropertyType = (typeId: string) => {
    const updated = tempFilters.propertyTypes.includes(typeId)
      ? tempFilters.propertyTypes.filter(t => t !== typeId)
      : [...tempFilters.propertyTypes, typeId];
    updateTempFilters({ propertyTypes: updated });
  };

  const toggleAmenity = (amenityId: string) => {
    const updated = tempFilters.amenities.includes(amenityId)
      ? tempFilters.amenities.filter(a => a !== amenityId)
      : [...tempFilters.amenities, amenityId];
    updateTempFilters({ amenities: updated });
  };

  const activeCount = getActiveFiltersCount();

  return (
    <div className={`${className}`}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            className="relative h-12 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white hover:bg-gray-50"
          >
            <Settings2 className="w-4 h-4 me-2" />
            <span className="font-medium">Filters</span>
            {activeCount > 0 && (
              <Badge 
                variant="default" 
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center"
              >
                {activeCount}
              </Badge>
            )}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Price Range */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Price range</h3>
              <div className="space-y-4">
                <div className="px-4">
                  <Slider
                    value={tempFilters.priceRange}
                    onValueChange={(value) => updateTempFilters({ priceRange: value as [number, number] })}
                    max={1000}
                    min={0}
                    step={10}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>${tempFilters.priceRange[0]}</span>
                  <span>${tempFilters.priceRange[1]}+</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Property Type */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Property type</h3>
              <div className="grid grid-cols-2 gap-3">
                {PROPERTY_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = tempFilters.propertyTypes.includes(type.id);
                  return (
                    <Button
                      key={type.id}
                      variant="outline"
                      onClick={() => togglePropertyType(type.id)}
                      className={`h-16 flex flex-col items-center justify-center space-y-1 border-2 rounded-xl transition-all ${
                        isSelected 
                          ? 'border-gray-900 bg-gray-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-gray-900' : 'text-gray-600'}`} />
                      <span className={`text-xs font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                        {type.label}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Amenities */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Amenities</h3>
              <div className="space-y-3">
                {AMENITIES.map((amenity) => {
                  const Icon = amenity.icon;
                  return (
                    <div key={amenity.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={amenity.id}
                        checked={tempFilters.amenities.includes(amenity.id)}
                        onCheckedChange={() => toggleAmenity(amenity.id)}
                      />
                      <Icon className="w-5 h-5 text-gray-600" />
                      <label 
                        htmlFor={amenity.id} 
                        className="text-sm font-medium text-gray-700 cursor-pointer flex-1"
                      >
                        {amenity.label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Booking Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Booking options</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Instant Book</p>
                    <p className="text-xs text-gray-500">Book without waiting for host approval</p>
                  </div>
                  <Checkbox
                    checked={tempFilters.instantBook}
                    onCheckedChange={(checked) => updateTempFilters({ instantBook: !!checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Superhost</p>
                    <p className="text-xs text-gray-500">Stay with recognized hosts</p>
                  </div>
                  <Checkbox
                    checked={tempFilters.superhost}
                    onCheckedChange={(checked) => updateTempFilters({ superhost: !!checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Guest favorites</p>
                    <p className="text-xs text-gray-500">The most loved homes on Mkan</p>
                  </div>
                  <Checkbox
                    checked={tempFilters.guestFavorites}
                    onCheckedChange={(checked) => updateTempFilters({ guestFavorites: !!checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between pt-6 border-t">
            <Button 
              variant="ghost" 
              onClick={clearFilters}
              className="text-gray-700 hover:text-gray-900 underline"
            >
              Clear all
            </Button>
            <Button 
              onClick={applyFilters}
              className="bg-gray-900 hover:bg-gray-800 text-white px-6"
            >
              Show results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AirbnbFilter;
