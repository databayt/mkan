"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { 
  Calendar,
  Users, 
  MapPin, 
  Search,
  Minus,
  Plus,
  ChevronDown,
  Wifi,
  Car
} from 'lucide-react';
import AirbnbIcon from './property-icon';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ComponentType<any>;
  description?: string;
}

interface GuestCount {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

interface AirbnbSelectProps {
  type: 'location' | 'guests' | 'property-type' | 'amenities' | 'dates';
  placeholder?: string;
  value?: string | GuestCount;
  onChange?: (value: any) => void;
  className?: string;
}

const LOCATION_OPTIONS: SelectOption[] = [
  { value: 'new-york', label: 'New York, NY', icon: MapPin },
  { value: 'los-angeles', label: 'Los Angeles, CA', icon: MapPin },
  { value: 'miami', label: 'Miami, FL', icon: MapPin },
  { value: 'san-francisco', label: 'San Francisco, CA', icon: MapPin },
  { value: 'chicago', label: 'Chicago, IL', icon: MapPin },
];

const PROPERTY_TYPE_OPTIONS: SelectOption[] = [
  { value: 'mension', label: 'Mansion', description: 'Luxury accommodations' },
  { value: 'islands', label: 'Islands', description: 'Private island getaways' },
  { value: 'beach', label: 'Beach', description: 'Beachfront properties' },
  { value: 'boat', label: 'Boat', description: 'Unique floating stays' },
  { value: 'containers', label: 'Containers', description: 'Modern container homes' },
];

const AMENITY_OPTIONS: SelectOption[] = [
  { value: 'wifi', label: 'WiFi', icon: Wifi },
  { value: 'parking', label: 'Free parking', icon: Car },
  { value: 'beauty-pools', label: 'Pool' },
  { value: 'new', label: 'New listings' },
];

const AirbnbSelect: React.FC<AirbnbSelectProps> = ({ 
  type, 
  placeholder, 
  value, 
  onChange, 
  className = "" 
}) => {
  const [open, setOpen] = useState(false);
  const [guestCount, setGuestCount] = useState<GuestCount>({
    adults: 1,
    children: 0,
    infants: 0,
    pets: 0
  });

  const updateGuestCount = (category: keyof GuestCount, increment: boolean) => {
    const newCount = { ...guestCount };
    if (increment) {
      newCount[category]++;
    } else if (newCount[category] > 0) {
      newCount[category]--;
    }
    
    // Adults must be at least 1
    if (category === 'adults' && newCount.adults < 1) {
      newCount.adults = 1;
    }
    
    setGuestCount(newCount);
    onChange?.(newCount);
  };

  const getGuestSummary = () => {
    const total = guestCount.adults + guestCount.children;
    let summary = `${total} guest${total !== 1 ? 's' : ''}`;
    
    if (guestCount.infants > 0) {
      summary += `, ${guestCount.infants} infant${guestCount.infants !== 1 ? 's' : ''}`;
    }
    
    if (guestCount.pets > 0) {
      summary += `, ${guestCount.pets} pet${guestCount.pets !== 1 ? 's' : ''}`;
    }
    
    return summary;
  };

  const renderLocationSelect = () => (
    <Select value={value as string} onValueChange={onChange}>
      <SelectTrigger className={`h-14 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white ${className}`}>
        <div className="flex items-center space-x-3 w-full">
          <Search className="w-5 h-5 text-gray-500" />
          <SelectValue placeholder={placeholder || "Where are you going?"} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {LOCATION_OPTIONS.map((option) => {
          const Icon = option.icon!;
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4 text-gray-500" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  const renderPropertyTypeSelect = () => (
    <Select value={value as string} onValueChange={onChange}>
      <SelectTrigger className={`h-14 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white ${className}`}>
        <div className="flex items-center space-x-3 w-full">
          <AirbnbIcon name="Mension" size={20} />
          <SelectValue placeholder={placeholder || "Property type"} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {PROPERTY_TYPE_OPTIONS.map((option) => {
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center space-x-3">
                <AirbnbIcon name={option.value} size={20} />
                <div>
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-gray-500">{option.description}</div>
                  )}
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  const renderAmenitiesSelect = () => (
    <Select value={value as string} onValueChange={onChange}>
      <SelectTrigger className={`h-14 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white ${className}`}>
        <div className="flex items-center space-x-3 w-full">
          <Wifi className="w-5 h-5 text-gray-500" />
          <SelectValue placeholder={placeholder || "Amenities"} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {AMENITY_OPTIONS.map((option) => {
          return (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center space-x-2">
                {option.icon ? (
                  <option.icon className="w-4 h-4 text-gray-500" />
                ) : (
                  <AirbnbIcon name={option.value} size={16} />
                )}
                <span>{option.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  const renderGuestsSelect = () => (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={`h-14 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white justify-between ${className}`}
        >
          <div className="flex items-center space-x-3">
            <Users className="w-5 h-5 text-gray-500" />
            <span className="text-start">
              {getGuestSummary()}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          {/* Adults */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Adults</div>
              <div className="text-sm text-gray-500">Ages 13 or above</div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('adults', false)}
                disabled={guestCount.adults <= 1}
                aria-label="Decrease adults"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center">{guestCount.adults}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('adults', true)}
                aria-label="Increase adults"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Children */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Children</div>
              <div className="text-sm text-gray-500">Ages 2-12</div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('children', false)}
                disabled={guestCount.children <= 0}
                aria-label="Decrease children"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center">{guestCount.children}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('children', true)}
                aria-label="Increase children"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Infants */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Infants</div>
              <div className="text-sm text-gray-500">Under 2</div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('infants', false)}
                disabled={guestCount.infants <= 0}
                aria-label="Decrease infants"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center">{guestCount.infants}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('infants', true)}
                aria-label="Increase infants"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Pets */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Pets</div>
              <div className="text-sm text-gray-500">Bringing a service animal?</div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('pets', false)}
                disabled={guestCount.pets <= 0}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center">{guestCount.pets}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => updateGuestCount('pets', true)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  const renderDatesSelect = () => (
    <Button 
      variant="outline" 
      className={`h-14 px-4 border-gray-300 hover:border-gray-400 rounded-xl bg-white justify-start ${className}`}
    >
      <Calendar className="w-5 h-5 text-gray-500 me-3" />
      <span>{placeholder || "Add dates"}</span>
    </Button>
  );

  switch (type) {
    case 'location':
      return renderLocationSelect();
    case 'guests':
      return renderGuestsSelect();
    case 'property-type':
      return renderPropertyTypeSelect();
    case 'amenities':
      return renderAmenitiesSelect();
    case 'dates':
      return renderDatesSelect();
    default:
      return renderLocationSelect();
  }
};

export default AirbnbSelect;
