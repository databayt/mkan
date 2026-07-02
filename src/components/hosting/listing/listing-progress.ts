import { Listing } from '@/types/listing';

// Define the step order for the hosting flow
const HOSTING_STEPS = [
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
];

// Step validation functions
const stepValidations = {
  'about-place': (listing: Listing) => true, // Always accessible
  'structure': (listing: Listing) => !!listing.propertyType,
  'privacy-type': (listing: Listing) => !!listing.propertyType,
  'location': (listing: Listing) => !!listing.propertyType,
  'floor-plan': (listing: Listing) => !!listing.location,
  'stand-out': (listing: Listing) => !!listing.guestCount,
  'amenities': (listing: Listing) => !!listing.guestCount,
  'photos': (listing: Listing) => true, // Photos are optional (phase 1)
  'title': (listing: Listing) => !!listing.title,
  'description': (listing: Listing) => !!listing.description,
  'finish-setup': (listing: Listing) => !!listing.description,
  'instant-book': (listing: Listing) => !!listing.description,
  'visibility': (listing: Listing) => !!listing.description,
  'price': (listing: Listing) => !!listing.pricePerNight,
  'discount': (listing: Listing) => !!listing.pricePerNight,
  'legal': (listing: Listing) => !!listing.pricePerNight
};

/**
 * Determines the next step in the listing creation process
 * @param listing - The current listing data
 * @returns The next step to navigate to
 */
export function getNextStep(listing: Listing): string {
  // If listing is published, go to photo tour editor
  if (listing.isPublished) {
    return 'photo-tour';
  }

  // Find the first incomplete step
  for (const step of HOSTING_STEPS) {
    if (!stepValidations[step as keyof typeof stepValidations](listing)) {
      return step;
    }
  }

  // If all steps are complete but not published, go to legal step
  return 'legal';
}

/**
 * Gets the progress percentage of the listing creation
 * @param listing - The current listing data
 * @returns Progress percentage (0-100)
 */
export function getProgressPercentage(listing: Listing): number {
  if (listing.isPublished) {
    return 100;
  }

  let completedSteps = 0;
  const totalSteps = HOSTING_STEPS.length;

  for (const step of HOSTING_STEPS) {
    if (stepValidations[step as keyof typeof stepValidations](listing)) {
      completedSteps++;
    }
  }

  return Math.round((completedSteps / totalSteps) * 100);
}

/**
 * Gets the current step the user should be on
 * @param listing - The current listing data
 * @returns The current step
 */
export function getCurrentStep(listing: Listing): string {
  // If listing is published, return photo-tour
  if (listing.isPublished) {
    return 'photo-tour';
  }

  // Find the last completed step
  let lastCompletedStep = 'about-place';
  
  for (const step of HOSTING_STEPS) {
    if (stepValidations[step as keyof typeof stepValidations](listing)) {
      lastCompletedStep = step;
    } else {
      break;
    }
  }

  return lastCompletedStep;
}

/**
 * Gets the step title for display
 * @param step - The step identifier
 * @returns The human-readable step title
 */
export function getStepTitle(step: string): string {
  const stepTitles: Record<string, string> = {
    'about-place': 'Tell us about your place',
    'structure': 'What type of place will guests have?',
    'privacy-type': 'What type of place will guests have?',
    'location': 'Where is your place located?',
    'floor-plan': 'Share some basics about your space',
    'stand-out': 'Let guests know what your place has to offer',
    'amenities': 'What amenities do you offer?',
    'photos': 'Add some photos of your place',
    'title': 'Create your title',
    'description': 'Create your description',
    'finish-setup': 'Congratulations!',
    'instant-book': 'Instant Book',
    'visibility': 'Publish your listing',
    'price': 'Set your price',
    'discount': 'Add discounts',
    'legal': 'Legal',
    'photo-tour': 'Photo Tour'
  };

  return stepTitles[step] || step;
} 