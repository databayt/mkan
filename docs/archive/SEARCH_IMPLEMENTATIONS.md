# Search Implementations Documentation

## Overview

This document traces all search-related implementations currently present in the project, including their file paths, URLs, and component descriptions.

## Current Search Components

### 1. Booking Form (Vertical Layout)
- **File Path**: `src/components/site/booking-form.tsx`
- **URL**: `/` (Landing page)
- **Component**: `BookingForm`
- **Layout Type**: Vertical
- **Description**: Main booking form with mobile-first responsive design, featuring:
  - Location search with Sudan-focused autocomplete
  - Date range picker with dual calendar
  - Three-tier guest counter (Adults, Children, Infants)
  - Auto-flip navigation between fields
  - Right-side dropdowns on desktop
  - Single-field progression on mobile

### 2. Big Search (Horizontal Layout)
- **File Path**: `src/components/template/search/big-search.tsx`
- **URL**: Not currently integrated (reference component)
- **Component**: `Component`
- **Layout Type**: Horizontal
- **Description**: Reference implementation with sophisticated horizontal layout:
  - Single horizontal container with flex layout
  - Advanced hover/active state management
  - Complex styling logic with adjacent button effects
  - Bottom-positioned dropdowns
  - Dynamic search button integration

### 3. Small Search
- **File Path**: `src/components/template/search/small-search.tsx`
- **URL**: Not currently integrated
- **Component**: `Component`
- **Layout Type**: Compact
- **Description**: Compact search implementation (minimal implementation)

### 4. Help Search
- **File Path**: `src/components/help/search.tsx`
- **URL**: `/help` (Help page)
- **Component**: `SearchBar`
- **Layout Type**: Simple
- **Description**: Basic search bar for help functionality

## Search Results Page

### Search Results Handler
- **File Path**: `src/app/(site)/search/page.tsx`
- **URL**: `/search?location=&checkIn=&checkOut=&guests=`
- **Component**: Search results page
- **Description**: Handles search parameters from booking form:
  - Location filtering (city, country, title matching)
  - Guest count filtering
  - Date range processing
  - Search summary display

## Related Components

### Date Range Picker
- **File Path**: `src/components/atom/date-range-picker.tsx`
- **Usage**: Used by `booking-form.tsx`
- **Description**: Reusable date range picker component with dual calendar

### UI Components
- **Button**: `src/components/ui/button.tsx`
- **Input**: `src/components/ui/input.tsx`
- **Label**: `src/components/ui/label.tsx`
- **Calendar**: `src/components/ui/calendar.tsx`

## Container Components

### Hero Section
- **File Path**: `src/components/site/HeroSection.tsx`
- **URL**: `/` (Landing page)
- **Description**: Container for the booking form on the landing page

## Landing Page Integration

### Main Landing Page
- **File Path**: `src/app/(site)/page.tsx`
- **URL**: `/`
- **Description**: Landing page that includes HeroSection with booking form

## File Structure Summary

```
src/
├── components/
│   ├── site/
│   │   ├── booking-form.tsx              # Main booking form (vertical)
│   │   └── HeroSection.tsx               # Container for booking form
│   ├── template/
│   │   └── search/
│   │       ├── big-search.tsx            # Horizontal search reference
│   │       └── small-search.tsx          # Compact search
│   ├── help/
│   │   └── search.tsx                    # Help page search
│   ├── atom/
│   │   └── date-range-picker.tsx         # Date picker component
│   └── ui/
│       ├── button.tsx                    # Button component
│       ├── input.tsx                     # Input component
│       ├── label.tsx                     # Label component
│       └── calendar.tsx                  # Calendar component
├── app/
│   └── (site)/
│       ├── page.tsx                      # Landing page
│       └── search/
│           └── page.tsx                  # Search results page
└── styles/
    └── scrollbar.css                     # Custom scrollbar utilities
```

## Current Integration Status

### ✅ Active Implementations
1. **Booking Form** - Fully integrated on landing page (`/`)
2. **Search Results Page** - Handles search parameters and displays results
3. **Date Range Picker** - Integrated with booking form

### 🔄 Reference Implementations
1. **Big Search** - Available as reference for horizontal layout patterns
2. **Small Search** - Available as compact search reference

### 🔧 Utility Components
1. **Help Search** - Integrated in help section
2. **UI Components** - Supporting components for all search implementations

## URL Mapping

| Component | File Path | URL | Status |
|-----------|-----------|-----|--------|
| Booking Form | `src/components/site/booking-form.tsx` | `/` | ✅ Active |
| Search Results | `src/app/(site)/search/page.tsx` | `/search` | ✅ Active |
| Big Search | `src/components/template/search/big-search.tsx` | N/A | 🔄 Reference |
| Small Search | `src/components/template/search/small-search.tsx` | N/A | 🔄 Reference |
| Help Search | `src/components/help/search.tsx` | `/help` | ✅ Active |

## Implementation Notes

### Current Active Search Flow
1. User interacts with booking form on landing page (`/`)
2. Form data is passed via URL parameters to search page (`/search`)
3. Search results page processes parameters and displays filtered results

### Reference Components
- Big Search serves as inspiration for horizontal layout patterns
- Small Search provides compact search reference
- Both reference components are not currently integrated into the main application flow

### Future Integration Opportunities
- Big Search could be integrated as an alternative search interface
- Small Search could be used for compact search scenarios
- Both could benefit from the shared component architecture outlined in the reorganization plan 