"use client"

import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createListing, ListingFormData } from '@/components/host/actions'
import { Amenity, Highlight, PropertyType } from '@prisma/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const propertySchema = z.object({
  name: z.string().min(1, 'Property name is required').max(100, 'Name too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description too long'),
  pricePerMonth: z.number().min(1, 'Price must be greater than 0'),
  securityDeposit: z.number().min(0, 'Security deposit cannot be negative'),
  applicationFee: z.number().min(0, 'Application fee cannot be negative'),
  beds: z.number().min(0, 'Beds cannot be negative').max(20, 'Too many beds'),
  baths: z.number().min(0, 'Baths cannot be negative').max(20, 'Too many baths'),
  squareFeet: z.number().min(1, 'Square feet must be greater than 0'),
  propertyType: z.nativeEnum(PropertyType),
  isPetsAllowed: z.boolean(),
  isParkingIncluded: z.boolean(),
  amenities: z.array(z.nativeEnum(Amenity)),
  highlights: z.array(z.nativeEnum(Highlight)),
  photoUrls: z.array(z.string().min(1).url('Invalid URL')),
  // Location fields
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

type PropertyFormValues = z.infer<typeof propertySchema>

const amenityOptions = Object.values(Amenity).map(amenity => ({
  value: amenity,
  label: amenity.replace(/([A-Z])/g, ' $1').trim()
}))

const highlightOptions = Object.values(Highlight).map(highlight => ({
  value: highlight,
  label: highlight.replace(/([A-Z])/g, ' $1').trim()
}))

const propertyTypeOptions = Object.values(PropertyType).map(type => ({
  value: type,
  label: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}))

export function PropertyForm() {
  console.log('🚀 PropertyForm component rendered')
  
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<string[]>([''])

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty, isValidating },
    setValue,
    watch,
    control,
    reset,
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      amenities: [],
      highlights: [],
      photoUrls: [],
      isPetsAllowed: false,
      isParkingIncluded: false,
      country: 'United States',
      latitude: 0,
      longitude: 0,
      propertyType: PropertyType.Apartment, // Add default property type
      pricePerMonth: 0,
      securityDeposit: 0,
      applicationFee: 0,
      beds: 0,
      baths: 0,
      squareFeet: 1,
    },
  })

  // Test data for quick form filling
  const fillTestData = () => {
    console.log('🧪 Filling form with test data...')
    const testData = {
      name: 'Beautiful Downtown Apartment',
      description: 'This is a beautiful downtown apartment with modern amenities and great location. Perfect for young professionals.',
      pricePerMonth: 2500,
      securityDeposit: 2500,
      applicationFee: 100,
      beds: 2,
      baths: 2,
      squareFeet: 1200,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.Gym],
             highlights: [Highlight.GreatView, Highlight.RecentlyRenovated],
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      country: 'United States',
      postalCode: '10001',
      latitude: 40.7128,
      longitude: -74.0060,
      photoUrls: []
    }

    // Fill form fields
    Object.entries(testData).forEach(([key, value]) => {
      console.log(`Setting ${key}:`, value)
      setValue(key as keyof PropertyFormValues, value)
    })

    // Clear photo URLs for test
    setPhotoUrls([''])
    
    console.log('✅ Test data filled successfully')
  }

  // Extensive debugging
  const formValues = watch()
  console.log('📊 Form state debug:', {
    errors,
    isValid,
    isDirty,
    isValidating,
    isSubmitting,
    formValues,
    photoUrls
  })

  // Watch for form changes
  React.useEffect(() => {
    console.log('🔄 Form values changed:', formValues)
  }, [formValues])

  React.useEffect(() => {
    console.log('❌ Form errors changed:', errors)
  }, [errors])

  React.useEffect(() => {
    console.log('✅ Form validation state changed:', { isValid, isDirty, isValidating })
  }, [isValid, isDirty, isValidating])

  const watchedAmenities = watch('amenities') || []
  const watchedHighlights = watch('highlights') || []

  const onSubmit = async (data: PropertyFormValues) => {
    console.log('🎯 === FORM SUBMIT STARTED ===')
    console.log('📝 Form submit triggered with data:', data)
    console.log('❌ Form errors at submit:', errors)
    console.log('✅ Form validation state:', { isValid, isDirty, isValidating })
    console.log('🖼️ Photo URLs state:', photoUrls)
    
    setIsSubmitting(true)
    
    try {
      console.log('🔧 Processing photo URLs...')
      const filteredPhotoUrls = photoUrls.filter(url => url.trim() !== '')
      console.log('🖼️ Filtered photo URLs:', filteredPhotoUrls)
      
      const propertyData: ListingFormData = {
        ...data,
        photoUrls: filteredPhotoUrls,
      }

      console.log('🚀 Calling createListing with final data:', propertyData)
      console.log('📊 Data validation before API call:', {
        hasTitle: !!propertyData.title,
        hasDescription: !!propertyData.description && propertyData.description.length >= 10,
        hasAddress: !!propertyData.address,
        hasCity: !!propertyData.city,
        hasState: !!propertyData.state,
        hasCountry: !!propertyData.country,
        hasPostalCode: !!propertyData.postalCode,
        priceGreaterThanZero: (propertyData.pricePerNight ?? 0) > 0,
        squareFeetGreaterThanZero: (propertyData.squareFeet ?? 0) > 0,
        hasPropertyType: !!propertyData.propertyType,
        photoUrlsCount: propertyData.photoUrls?.length ?? 0
      })

      const result = await createListing(propertyData)
      console.log('✅ Create property API result:', result)
      
      if (result.success) {
        console.log('🎉 Property created successfully!')
        toast.success('Property created successfully!')
        console.log('🔄 Redirecting to dashboard...')
        router.push('/dashboard/properties')
      } else {
        console.log('❌ Property creation failed - no success flag')
        toast.error('Property creation failed - no success response')
      }
    } catch (error) {
      console.error('💥 Error creating property:', error)
      console.error('📋 Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        error
      })
      toast.error(`Failed to create property: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      console.log('🏁 Setting isSubmitting to false')
      setIsSubmitting(false)
      console.log('🎯 === FORM SUBMIT ENDED ===')
    }
  }

  const handleAmenityChange = (amenity: Amenity, checked: boolean) => {
    const currentAmenities = watchedAmenities
    if (checked) {
      setValue('amenities', [...currentAmenities, amenity])
    } else {
      setValue('amenities', currentAmenities.filter(a => a !== amenity))
    }
  }

  const handleHighlightChange = (highlight: Highlight, checked: boolean) => {
    const currentHighlights = watchedHighlights
    if (checked) {
      setValue('highlights', [...currentHighlights, highlight])
    } else {
      setValue('highlights', currentHighlights.filter(h => h !== highlight))
    }
  }

  const addPhotoUrl = () => {
    setPhotoUrls([...photoUrls, ''])
  }

  const removePhotoUrl = (index: number) => {
    const newUrls = photoUrls.filter((_, i) => i !== index)
    setPhotoUrls(newUrls)
    setValue('photoUrls', newUrls.filter(url => url.trim() !== ''))
  }

  const updatePhotoUrl = (index: number, url: string) => {
    const newUrls = [...photoUrls]
    newUrls[index] = url
    setPhotoUrls(newUrls)
    setValue('photoUrls', newUrls.filter(url => url.trim() !== ''))
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Property Listing</CardTitle>
          <div className="flex gap-2 mt-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={fillTestData}
              className="bg-blue-100 hover:bg-blue-200 text-blue-800"
            >
              🧪 Fill Test Data
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => {
                console.log('🔄 Resetting form...')
                reset()
                setPhotoUrls([''])
                console.log('✅ Form reset complete')
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800"
            >
              🔄 Reset Form
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={(e) => {
              console.log('📋 === FORM DOM SUBMIT EVENT ===')
              console.log('📋 Event object:', e)
              console.log('📋 Form validation before handleSubmit:', { isValid, errors })
              console.log('📋 Calling handleSubmit(onSubmit)...')
              
              const result = handleSubmit(onSubmit)(e)
              console.log('📋 handleSubmit result:', result)
              
              return result
            }} 
            className="space-y-6"
          >
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              
              <div>
                <Label htmlFor="name">Property Name *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="Beautiful Downtown Apartment"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="Describe your property..."
                  rows={4}
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="pricePerMonth">Monthly Rent ($) *</Label>
                  <Input
                    id="pricePerMonth"
                    type="number"
                    {...register('pricePerMonth', { valueAsNumber: true })}
                    placeholder="2500"
                  />
                  {errors.pricePerMonth && <p className="text-red-500 text-sm mt-1">{errors.pricePerMonth.message}</p>}
                </div>

                <div>
                  <Label htmlFor="securityDeposit">Security Deposit ($)</Label>
                  <Input
                    id="securityDeposit"
                    type="number"
                    {...register('securityDeposit', { valueAsNumber: true })}
                    placeholder="2500"
                  />
                  {errors.securityDeposit && <p className="text-red-500 text-sm mt-1">{errors.securityDeposit.message}</p>}
                </div>

                <div>
                  <Label htmlFor="applicationFee">Application Fee ($)</Label>
                  <Input
                    id="applicationFee"
                    type="number"
                    {...register('applicationFee', { valueAsNumber: true })}
                    placeholder="100"
                  />
                  {errors.applicationFee && <p className="text-red-500 text-sm mt-1">{errors.applicationFee.message}</p>}
                </div>
              </div>
            </div>

            {/* Property Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Property Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="beds">Bedrooms *</Label>
                  <Input
                    id="beds"
                    type="number"
                    {...register('beds', { valueAsNumber: true })}
                    placeholder="2"
                  />
                  {errors.beds && <p className="text-red-500 text-sm mt-1">{errors.beds.message}</p>}
                </div>

                <div>
                  <Label htmlFor="baths">Bathrooms *</Label>
                  <Input
                    id="baths"
                    type="number"
                    step="0.5"
                    {...register('baths', { valueAsNumber: true })}
                    placeholder="2"
                  />
                  {errors.baths && <p className="text-red-500 text-sm mt-1">{errors.baths.message}</p>}
                </div>

                <div>
                  <Label htmlFor="squareFeet">Square Feet *</Label>
                  <Input
                    id="squareFeet"
                    type="number"
                    {...register('squareFeet', { valueAsNumber: true })}
                    placeholder="1200"
                  />
                  {errors.squareFeet && <p className="text-red-500 text-sm mt-1">{errors.squareFeet.message}</p>}
                </div>

                <div>
                  <Label htmlFor="propertyType">Property Type *</Label>
                  <Select onValueChange={(value) => setValue('propertyType', value as PropertyType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {propertyTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.propertyType && <p className="text-red-500 text-sm mt-1">{errors.propertyType.message}</p>}
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isPetsAllowed"
                    {...register('isPetsAllowed')}
                  />
                  <Label htmlFor="isPetsAllowed">Pets Allowed</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isParkingIncluded"
                    {...register('isParkingIncluded')}
                  />
                  <Label htmlFor="isParkingIncluded">Parking Included</Label>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Location</h3>
              
              <div>
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder="123 Main Street"
                />
                {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address.message}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder="Los Angeles"
                  />
                  {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city.message}</p>}
                </div>

                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    {...register('state')}
                    placeholder="CA"
                  />
                  {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state.message}</p>}
                </div>

                <div>
                  <Label htmlFor="postalCode">Postal Code *</Label>
                  <Input
                    id="postalCode"
                    {...register('postalCode')}
                    placeholder="90210"
                  />
                  {errors.postalCode && <p className="text-red-500 text-sm mt-1">{errors.postalCode.message}</p>}
                </div>

                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    {...register('country')}
                    placeholder="United States"
                  />
                  {errors.country && <p className="text-red-500 text-sm mt-1">{errors.country.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    {...register('latitude', { valueAsNumber: true })}
                    placeholder="34.0522"
                  />
                  {errors.latitude && <p className="text-red-500 text-sm mt-1">{errors.latitude.message}</p>}
                </div>

                <div>
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    {...register('longitude', { valueAsNumber: true })}
                    placeholder="-118.2437"
                  />
                  {errors.longitude && <p className="text-red-500 text-sm mt-1">{errors.longitude.message}</p>}
                </div>
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Property Photos</h3>
              
              {photoUrls.map((url, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="https://example.com/photo.jpg"
                    value={url}
                    onChange={(e) => updatePhotoUrl(index, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removePhotoUrl(index)}
                    disabled={photoUrls.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              
              <Button type="button" variant="outline" onClick={addPhotoUrl}>
                Add Photo URL
              </Button>
            </div>

            {/* Amenities */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Amenities</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {amenityOptions.map((amenity) => (
                  <div key={amenity.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`amenity-${amenity.value}`}
                      checked={watchedAmenities.includes(amenity.value)}
                      onCheckedChange={(checked) => handleAmenityChange(amenity.value, checked as boolean)}
                    />
                    <Label htmlFor={`amenity-${amenity.value}`} className="text-sm">
                      {amenity.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Highlights</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {highlightOptions.map((highlight) => (
                  <div key={highlight.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`highlight-${highlight.value}`}
                      checked={watchedHighlights.includes(highlight.value)}
                      onCheckedChange={(checked) => handleHighlightChange(highlight.value, checked as boolean)}
                    />
                    <Label htmlFor={`highlight-${highlight.value}`} className="text-sm">
                      {highlight.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Validation Summary */}
            {Object.keys(errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h4 className="text-red-800 font-medium mb-2">Please fix the following errors:</h4>
                <ul className="text-red-700 text-sm space-y-1">
                  {Object.entries(errors).map(([field, error]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {error?.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                onClick={() => {
                  console.log('🔘 === SUBMIT BUTTON CLICKED ===')
                  console.log('🔘 isSubmitting:', isSubmitting)
                  console.log('🔘 Form validation state:', { isValid, isDirty, isValidating })
                  console.log('🔘 Form errors:', errors)
                  console.log('🔘 Current form values:', watch())
                }}
              >
                {isSubmitting ? '⏳ Creating...' : '✨ Create Property'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
} 