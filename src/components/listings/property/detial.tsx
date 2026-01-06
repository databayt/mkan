import { getListing } from '@/components/host/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Bed, Bath, Square, DollarSign, Car, PawPrint, Wifi, Dumbbell } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PropertyPageProps {
  params: {
    id: string
  }
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  console.log('🔍 Property page loading for ID:', params.id)
  
  try {
    const propertyId = parseInt(params.id)
    
    if (isNaN(propertyId)) {
      console.error('❌ Invalid property ID:', params.id)
      notFound()
    }

    console.log('📡 Fetching property with ID:', propertyId)
    const property = await getListing(propertyId)
    console.log('✅ Property fetched successfully:', property?.title)

    if (!property) {
      console.error('❌ Property not found for ID:', propertyId)
      notFound()
    }

    const amenityIcons: Record<string, any> = {
      WiFi: Wifi,
      Gym: Dumbbell,
      AirConditioning: '❄️',
      Parking: Car,
      PetsAllowed: PawPrint,
    }

    const formatAmenity = (amenity: string) => {
      return amenity.replace(/([A-Z])/g, ' $1').trim()
    }

    const formatHighlight = (highlight: string) => {
      return highlight.replace(/([A-Z])/g, ' $1').trim()
    }

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section with Images */}
        <div className="relative h-96 w-full">
          {property.photoUrls && property.photoUrls.length > 0 ? (
            <Image
              src={property.photoUrls[0] ?? '/placeholder.svg'}
              alt={property.title ?? 'Property'}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-gray-300 flex items-center justify-center">
              <span className="text-gray-500 text-xl">No Image Available</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black bg-opacity-30" />
          <div className="absolute bottom-6 left-6 text-white">
            <h1 className="text-4xl font-bold mb-2">{property.title}</h1>
            <div className="flex items-center text-lg">
              <MapPin className="w-5 h-5 mr-2" />
              <span>
                {property.location?.address}, {property.location?.city}, {property.location?.state}
              </span>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Basic Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Property Details</span>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {property.propertyType}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Bed className="w-5 h-5 text-gray-600" />
                      <span>{property.bedrooms ?? 0} {property.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bath className="w-5 h-5 text-gray-600" />
                      <span>{property.bathrooms ?? 0} {property.bathrooms === 1 ? 'Bathroom' : 'Bathrooms'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Square className="w-5 h-5 text-gray-600" />
                      <span>{(property.squareFeet ?? 0).toLocaleString()} sq ft</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-600">
                        ${(property.pricePerNight ?? 0).toLocaleString()}/night
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {property.isPetsAllowed && (
                      <div className="flex items-center gap-2 text-green-600">
                        <PawPrint className="w-4 h-4" />
                        <span>Pet-Friendly</span>
                      </div>
                    )}
                    {property.isParkingIncluded && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <Car className="w-4 h-4" />
                        <span>Parking Included</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">{property.description}</p>
                </CardContent>
              </Card>

              {/* Amenities */}
              {property.amenities && property.amenities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Amenities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {property.amenities.map((amenity, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <span className="text-sm">{formatAmenity(amenity)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Highlights */}
              {property.highlights && property.highlights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Property Highlights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {property.highlights.map((highlight, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                          <span className="text-sm text-blue-800">{formatHighlight(highlight)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Additional Photos */}
              {property.photoUrls && property.photoUrls.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>More Photos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {property.photoUrls.slice(1).map((photo, index) => (
                        <div key={index} className="relative h-48 rounded-lg overflow-hidden">
                          <Image
                            src={photo}
                            alt={`${property.title ?? 'Property'} photo ${index + 2}`}
                            fill
                            className="object-cover hover:scale-105 transition-transform"
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              
              {/* Pricing Card */}
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="text-2xl text-green-600">
                    ${(property.pricePerNight ?? 0).toLocaleString()}/night
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Security Deposit:</span>
                      <span className="font-medium">${(property.securityDeposit ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Application Fee:</span>
                      <span className="font-medium">${(property.applicationFee ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <hr />
                  
                  <Button className="w-full" size="lg">
                    Contact Property Manager
                  </Button>
                  
                  <Button variant="outline" className="w-full" size="lg">
                    Schedule Viewing
                  </Button>
                </CardContent>
              </Card>

              {/* Property Host */}
              <Card>
                <CardHeader>
                  <CardTitle>Property Host</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-medium">
                        {property.host?.username?.[0] ?? 'H'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{property.host?.username ?? 'Host'}</p>
                      <p className="text-sm text-gray-600">{property.host?.email ?? ''}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-medium">{property.location?.address}</p>
                    <p className="text-gray-600">
                      {property.location?.city}, {property.location?.state} {property.location?.postalCode}
                    </p>
                    <p className="text-gray-600">{property.location?.country}</p>
                  </div>
                  
                  {/* Map placeholder */}
                  <div className="mt-4 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500">Map Coming Soon</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Back Button */}
          <div className="mt-8">
            <Link href="/search">
              <Button variant="outline">
                ← Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    console.error('❌ Error loading property:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Property</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              We couldn't load this property. It may have been removed or the ID is invalid.
            </p>
            <Link href="/search">
              <Button className="w-full">
                Back to Search
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }
}
