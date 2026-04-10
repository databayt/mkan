import { getListing } from '@/components/host/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Bed, Bath, Square, DollarSign, Car, PawPrint, Wifi, Dumbbell } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AirbnbPropertyHeader from '@/components/atom/property-header'
import AirbnbImages from '@/components/atom/property-images'
import { RentalListingHeader } from '@/components/property/rental-listing-header'
import { getDictionary } from '@/components/internationalization/dictionaries'

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string; lang: "en" | "ar" }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const d = await getDictionary(resolvedParams.lang);
  const propertyId = parseInt(resolvedParams.id)

  if (isNaN(propertyId)) {
    console.error('❌ Invalid property ID:', resolvedParams.id)
    notFound()
  }

  let property;
  try {
    property = await getListing(propertyId)
  } catch (error) {
    console.error('❌ Error fetching property for ID:', propertyId, error)
    notFound()
  }

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
      <div className="px-20 py-10">
        <AirbnbPropertyHeader
          title={property.title ?? 'Untitled Property'}
          location={property.location?.address ?? 'Location not specified'}
          rating={4.8}
          reviewCount={127}
          isSuperhost={true}
        />
        <AirbnbImages
          images={[
            "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop",
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop",
            "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&h=300&fit=crop",
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
            "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=300&fit=crop"
          ]}
        />
        <RentalListingHeader
          title={`Entire rental unit hosted by ${property.host.username ?? 'Host'}`}
          hostName={property.host.username ?? 'Host'}
          maxGuests={property.guestCount}
          bedrooms={property.bedrooms ?? 0}
          beds={property.bedrooms ?? 0}
          bathrooms={property.bathrooms ?? 0}
        />
      </div>
      <div className="relative h-96 w-full">
        {property.photoUrls && property.photoUrls.length > 0 && property.photoUrls[0] ? (
          <Image
            src={property.photoUrls[0]}
            alt={property.title ?? 'Property'}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gray-300 flex items-center justify-center">
            <span className="text-gray-500 text-xl">{d.rental?.property?.card?.noImage ?? "No Image Available"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black bg-opacity-30" />
        <div className="absolute bottom-6 left-6 text-white">
          <h1 className="text-4xl font-bold mb-2">{property.title ?? 'Untitled Property'}</h1>
          <div className="flex items-center text-lg">
            <MapPin className="w-5 h-5 me-2" />
            <span>
              {property.location?.address ?? ''}, {property.location?.city ?? ''}, {property.location?.state ?? ''}
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
                  <span>{d.rental?.property?.details?.propertyDetails ?? "Property Details"}</span>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {property.propertyType}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Bed className="w-5 h-5 text-gray-600" />
                    <span>{property.bedrooms ?? 0} {property.bedrooms === 1 ? (d.rental?.property?.details?.bedroomSingular ?? "Bedroom") : (d.rental?.property?.details?.bedroomPlural ?? "Bedrooms")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bath className="w-5 h-5 text-gray-600" />
                    <span>{property.bathrooms ?? 0} {property.bathrooms === 1 ? (d.rental?.property?.details?.bathroomSingular ?? "Bathroom") : (d.rental?.property?.details?.bathroomPlural ?? "Bathrooms")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Square className="w-5 h-5 text-gray-600" />
                    <span>{(property.squareFeet ?? 0).toLocaleString()} {d.rental?.property?.details?.sqft ?? "sq ft"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-600">
                      ${(property.pricePerNight ?? 0).toLocaleString()}/{d.rental?.property?.details?.perNight ?? "night"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {property.isPetsAllowed && (
                    <div className="flex items-center gap-2 text-green-600">
                      <PawPrint className="w-4 h-4" />
                      <span>{d.rental?.property?.details?.petFriendly ?? "Pet-Friendly"}</span>
                    </div>
                  )}
                  {property.isParkingIncluded && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <Car className="w-4 h-4" />
                      <span>{d.rental?.property?.details?.parkingIncluded ?? "Parking Included"}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle>{d.rental?.property?.details?.description ?? "Description"}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">{property.description}</p>
              </CardContent>
            </Card>

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{d.rental?.property?.details?.amenities ?? "Amenities"}</CardTitle>
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
                  <CardTitle>{d.rental?.property?.details?.propertyHighlights ?? "Property Highlights"}</CardTitle>
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
                  <CardTitle>{d.rental?.property?.details?.morePhotos ?? "More Photos"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {property.photoUrls.slice(1).map((photo, index) => (
                      photo && (
                        <div key={index} className="relative h-48 rounded-lg overflow-hidden">
                          <Image
                            src={photo}
                            alt={`${property.title ?? 'Property'} photo ${index + 2}`}
                            fill
                            className="object-cover hover:scale-105 transition-transform"
                          />
                        </div>
                      )
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
                  ${(property.pricePerNight ?? 0).toLocaleString()}/{d.rental?.property?.details?.perNight ?? "night"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>{d.rental?.property?.details?.securityDeposit ?? "Security Deposit:"}</span>
                    <span className="font-medium">${(property.securityDeposit ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{d.rental?.property?.details?.applicationFee ?? "Application Fee:"}</span>
                    <span className="font-medium">${(property.applicationFee ?? 0).toLocaleString()}</span>
                  </div>
                </div>

                <Button className="w-full text-lg py-6">
                  {d.rental?.property?.details?.applyNow ?? "Apply Now"}
                </Button>

                <p className="text-xs text-center text-gray-500">
                  {d.rental?.property?.details?.notChargedYet ?? "You won't be charged yet"}
                </p>

                <div className="text-sm text-gray-600 text-center">
                  <Link href={`/contact?propertyId=${property.id}`} className="underline">
                    {d.rental?.property?.details?.contactManager ?? "Contact Property Manager"}
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{d.rental?.property?.details?.aboutHost ?? "About the Host"}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                  <span className="text-gray-500 text-2xl">{(property.host.username ?? 'H').charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <h3 className="font-semibold">{property.host.username ?? (d.rental?.property?.details?.hostFallback ?? 'Host')}</h3>
                  <p className="text-sm text-gray-500">{d.rental?.property?.details?.joinedIn ?? "Joined in 2023"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 