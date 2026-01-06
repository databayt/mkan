import { PrismaClient, PropertyType, Amenity, Highlight } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting Sudan listings seed process...')

  // Clear existing listings and related data
  await prisma.application.deleteMany()
  await prisma.lease.deleteMany()
  await prisma.tenant.deleteMany()
  await prisma.listing.deleteMany()
  await prisma.location.deleteMany()
  console.log('🧹 Cleared existing data')

  // Find or create the Facebook account manager
  const manager = await prisma.user.upsert({
    where: { email: 'osmanabdout@hotmail.com' },
    update: { role: 'MANAGER' },
    create: {
      email: 'osmanabdout@hotmail.com',
      username: 'Osman Abdout',
      role: 'MANAGER',
      emailVerified: new Date()
    }
  })

  console.log(`✅ Manager set up: ${manager.email} (${manager.username})`)

  // Define diverse listing data with Sudanese locations and realistic pricing
  const listingData = [
    // KHARTOUM - 8 Listings
    {
      title: 'Luxury Nile View Apartment',
      description: 'Stunning modern apartment with breathtaking views of the Nile River. Located in the prestigious Al-Manshiya district, this property features premium finishes, a private balcony, and 24/7 security. Perfect for executives and families seeking luxury living in the heart of Khartoum.',
      pricePerNight: 250,
      securityDeposit: 2500,
      applicationFee: 100,
      bedrooms: 3,
      bathrooms: 2.5,
      squareFeet: 1800,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher, Amenity.WasherDryer],
      highlights: [Highlight.GreatView, Highlight.RecentlyRenovated, Highlight.HighSpeedInternetAccess, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
        'https://images.unsplash.com/photo-1555854877-bab0e5b6856c?w=800'
      ],
      location: { address: 'Al-Manshiya Street, Building 15', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11111', latitude: 15.5007, longitude: 32.5599 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.8, numberOfReviews: 24, guestCount: 6
    },
    {
      title: 'Traditional Sudanese Villa',
      description: 'Beautiful traditional Sudanese villa with courtyard and garden. Features authentic Sudanese architecture with modern amenities. Located in the peaceful Al-Riyadh neighborhood.',
      pricePerNight: 180,
      securityDeposit: 1800,
      applicationFee: 75,
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2500,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.GreatView, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
        'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800'
      ],
      location: { address: 'Al-Riyadh District, Villa 8', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11112', latitude: 15.5507, longitude: 32.5599 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.6, numberOfReviews: 18, guestCount: 8
    },
    {
      title: 'Downtown Studio Apartment',
      description: 'Cozy studio apartment in the heart of downtown Khartoum. Perfect for solo travelers or couples. Walking distance to shops, restaurants, and public transport.',
      pricePerNight: 75,
      securityDeposit: 750,
      applicationFee: 30,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 450,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.AirConditioning, Amenity.WiFi],
      highlights: [Highlight.CloseToTransit, Highlight.HighSpeedInternetAccess],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: { address: 'Central Business District, Tower 3', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11113', latitude: 15.5887, longitude: 32.5342 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.4, numberOfReviews: 42, guestCount: 2
    },
    {
      title: 'Penthouse with Panoramic Views',
      description: 'Exclusive penthouse apartment with 360-degree views of Khartoum. Features a private rooftop terrace, luxury finishes, and concierge service. The ultimate in urban living.',
      pricePerNight: 450,
      securityDeposit: 4500,
      applicationFee: 150,
      bedrooms: 4,
      bathrooms: 4,
      squareFeet: 3200,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher, Amenity.WasherDryer, Amenity.Pool],
      highlights: [Highlight.GreatView, Highlight.RecentlyRenovated, Highlight.HighSpeedInternetAccess, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
        'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
        'https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800',
        'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800'
      ],
      location: { address: 'Nile Tower, Penthouse Floor', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11114', latitude: 15.6007, longitude: 32.5399 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.9, numberOfReviews: 12, guestCount: 8
    },
    {
      title: 'Garden Flat near University',
      description: 'Charming ground floor apartment with private garden. Located near University of Khartoum, ideal for visiting academics or students. Quiet and secure.',
      pricePerNight: 95,
      securityDeposit: 950,
      applicationFee: 40,
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 850,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: { address: 'University Avenue, Building 12', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11115', latitude: 15.5607, longitude: 32.5499 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.5, numberOfReviews: 28, guestCount: 4
    },
    {
      title: 'Modern Loft in Amarat',
      description: 'Stylish loft apartment in trendy Amarat district. Open plan living with industrial design elements. Walking distance to cafes and galleries.',
      pricePerNight: 130,
      securityDeposit: 1300,
      applicationFee: 55,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 700,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer],
      highlights: [Highlight.RecentlyRenovated, Highlight.HighSpeedInternetAccess],
      photoUrls: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: { address: 'Amarat Street 41, Unit 5', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11116', latitude: 15.5807, longitude: 32.5299 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.7, numberOfReviews: 35, guestCount: 2
    },
    {
      title: 'Family Home with Pool',
      description: 'Spacious family home with private swimming pool in prestigious Khartoum 2 district. Large garden, modern kitchen, and multiple living areas. Perfect for families.',
      pricePerNight: 320,
      securityDeposit: 3200,
      applicationFee: 120,
      bedrooms: 5,
      bathrooms: 4,
      squareFeet: 4000,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher, Amenity.WasherDryer, Amenity.Pool, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
      ],
      location: { address: 'Khartoum 2 District, Villa 22', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11117', latitude: 15.5407, longitude: 32.5699 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.8, numberOfReviews: 19, guestCount: 10
    },
    {
      title: 'Business Traveler Suite',
      description: 'Executive suite designed for business travelers. Located in the business district with high-speed internet, work desk, and meeting facilities nearby.',
      pricePerNight: 160,
      securityDeposit: 1600,
      applicationFee: 65,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 600,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher],
      highlights: [Highlight.HighSpeedInternetAccess, Highlight.CloseToTransit, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: { address: 'Africa Street, Business Center', city: 'Khartoum', state: 'Khartoum', country: 'Sudan', postalCode: '11118', latitude: 15.5907, longitude: 32.5199 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.6, numberOfReviews: 56, guestCount: 2
    },

    // OMDURMAN - 6 Listings
    {
      title: 'Family Villa in Omdurman',
      description: 'Spacious family villa in the heart of Omdurman. Features a large garden, traditional Sudanese design elements, and modern conveniences. Located near markets and schools.',
      pricePerNight: 150,
      securityDeposit: 1500,
      applicationFee: 60,
      bedrooms: 5,
      bathrooms: 3,
      squareFeet: 3000,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.GreatView, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
        'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
        'https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800',
        'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800'
      ],
      location: { address: 'Al-Thawra Street, Villa 12', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11211', latitude: 15.6507, longitude: 32.4799 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.7, numberOfReviews: 28, guestCount: 10
    },
    {
      title: 'Modern Apartment Complex',
      description: 'Contemporary apartment in a modern complex with security, parking, and community facilities. Located in the growing Al-Sahafa district of Omdurman.',
      pricePerNight: 120,
      securityDeposit: 1200,
      applicationFee: 50,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1200,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher],
      highlights: [Highlight.RecentlyRenovated, Highlight.CloseToTransit, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
        'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
      ],
      location: { address: 'Al-Sahafa District, Building 7', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11212', latitude: 15.6007, longitude: 32.4899 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.5, numberOfReviews: 15, guestCount: 4
    },
    {
      title: 'Historic Quarter Townhouse',
      description: 'Beautifully restored townhouse in Omdurman historic quarter. Original architecture with modern comforts. Steps from the famous Omdurman Souq.',
      pricePerNight: 110,
      securityDeposit: 1100,
      applicationFee: 45,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1600,
      propertyType: PropertyType.Townhouse,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.WasherDryer],
      highlights: [Highlight.CloseToTransit, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
      ],
      location: { address: 'Old Souq Street, House 45', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11213', latitude: 15.6407, longitude: 32.4699 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.8, numberOfReviews: 22, guestCount: 6
    },
    {
      title: 'Riverside Retreat',
      description: 'Peaceful villa on the banks of the White Nile. Private garden reaching the riverbank. Perfect for those seeking tranquility away from city noise.',
      pricePerNight: 200,
      securityDeposit: 2000,
      applicationFee: 80,
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2800,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'
      ],
      location: { address: 'Nile Bank Road, Villa 8', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11214', latitude: 15.6607, longitude: 32.4599 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.9, numberOfReviews: 11, guestCount: 8
    },
    {
      title: 'Budget-Friendly Flat',
      description: 'Clean and affordable apartment for budget-conscious travelers. Basic amenities with good transport links. Ideal for short stays.',
      pricePerNight: 55,
      securityDeposit: 550,
      applicationFee: 25,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 400,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.AirConditioning, Amenity.WiFi],
      highlights: [Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: { address: 'Central Omdurman, Block 15', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11215', latitude: 15.6307, longitude: 32.4799 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.2, numberOfReviews: 67, guestCount: 2
    },
    {
      title: 'Artist Loft Studio',
      description: 'Creative space with high ceilings and natural light. Popular with artists and photographers. Includes small workspace area.',
      pricePerNight: 85,
      securityDeposit: 850,
      applicationFee: 35,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 550,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking],
      highlights: [Highlight.HighSpeedInternetAccess, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: { address: 'Arts District, Studio 12', city: 'Omdurman', state: 'Khartoum', country: 'Sudan', postalCode: '11216', latitude: 15.6207, longitude: 32.4899 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.6, numberOfReviews: 29, guestCount: 2
    },

    // KHARTOUM BAHRI - 4 Listings
    {
      title: 'Executive Townhouse',
      description: 'Elegant townhouse in the prestigious Al-Kalakla district. Features modern design, private garden, and premium amenities. Perfect for professionals.',
      pricePerNight: 200,
      securityDeposit: 2000,
      applicationFee: 80,
      bedrooms: 3,
      bathrooms: 2.5,
      squareFeet: 1800,
      propertyType: PropertyType.Townhouse,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.Dishwasher],
      highlights: [Highlight.RecentlyRenovated, Highlight.QuietNeighborhood, Highlight.GreatView],
      photoUrls: [
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
      ],
      location: { address: 'Al-Kalakla Street, Townhouse 5', city: 'Khartoum Bahri', state: 'Khartoum', country: 'Sudan', postalCode: '11311', latitude: 15.6507, longitude: 32.5599 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.9, numberOfReviews: 31, guestCount: 6
    },
    {
      title: 'Compact City Apartment',
      description: 'Well-designed compact apartment perfect for solo travelers or couples. Modern amenities in a convenient location.',
      pricePerNight: 70,
      securityDeposit: 700,
      applicationFee: 30,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 480,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking],
      highlights: [Highlight.CloseToTransit, Highlight.HighSpeedInternetAccess],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: { address: 'Bahri Central, Building 9', city: 'Khartoum Bahri', state: 'Khartoum', country: 'Sudan', postalCode: '11312', latitude: 15.6607, longitude: 32.5499 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.4, numberOfReviews: 45, guestCount: 2
    },
    {
      title: 'Industrial Chic Warehouse',
      description: 'Converted warehouse space with exposed brick and high ceilings. Unique accommodation for those seeking something different.',
      pricePerNight: 140,
      securityDeposit: 1400,
      applicationFee: 55,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1500,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.RecentlyRenovated, Highlight.HighSpeedInternetAccess],
      photoUrls: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
        'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
      ],
      location: { address: 'Industrial Zone, Unit 22', city: 'Khartoum Bahri', state: 'Khartoum', country: 'Sudan', postalCode: '11313', latitude: 15.6707, longitude: 32.5399 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.7, numberOfReviews: 18, guestCount: 4
    },
    {
      title: 'Garden Bungalow',
      description: 'Charming bungalow surrounded by tropical garden. Single-story living with outdoor entertaining area. Pet-friendly and family-oriented.',
      pricePerNight: 125,
      securityDeposit: 1250,
      applicationFee: 50,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1400,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.GreatView],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800'
      ],
      location: { address: 'Garden District, Bungalow 3', city: 'Khartoum Bahri', state: 'Khartoum', country: 'Sudan', postalCode: '11314', latitude: 15.6807, longitude: 32.5299 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.8, numberOfReviews: 24, guestCount: 6
    },

    // PORT SUDAN - 4 Listings
    {
      title: 'Beachfront Apartment',
      description: 'Beautiful apartment with stunning Red Sea views in Port Sudan. Features modern amenities and easy access to the beach. Perfect for those who love the sea.',
      pricePerNight: 140,
      securityDeposit: 1400,
      applicationFee: 60,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1000,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher],
      highlights: [Highlight.GreatView, Highlight.CloseToTransit, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
      ],
      location: { address: 'Red Sea Street, Building 10', city: 'Port Sudan', state: 'Red Sea', country: 'Sudan', postalCode: '22111', latitude: 19.6158, longitude: 37.2164 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.6, numberOfReviews: 22, guestCount: 4
    },
    {
      title: 'Diving Paradise Villa',
      description: 'Spacious villa perfect for diving enthusiasts. Equipment storage, outdoor shower, and close to dive sites. Stunning coral reef views.',
      pricePerNight: 220,
      securityDeposit: 2200,
      applicationFee: 90,
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2200,
      propertyType: PropertyType.Villa,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.Pool],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood, Highlight.RecentlyRenovated],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
      ],
      location: { address: 'Coral Beach Road, Villa 5', city: 'Port Sudan', state: 'Red Sea', country: 'Sudan', postalCode: '22112', latitude: 19.6058, longitude: 37.2264 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.8, numberOfReviews: 14, guestCount: 8
    },
    {
      title: 'Harbor View Studio',
      description: 'Cozy studio overlooking Port Sudan harbor. Watch ships come and go from your balcony. Central location with easy access to restaurants.',
      pricePerNight: 65,
      securityDeposit: 650,
      applicationFee: 25,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 380,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.AirConditioning, Amenity.WiFi],
      highlights: [Highlight.GreatView, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: { address: 'Harbor District, Building 3', city: 'Port Sudan', state: 'Red Sea', country: 'Sudan', postalCode: '22113', latitude: 19.6258, longitude: 37.2064 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.3, numberOfReviews: 38, guestCount: 2
    },
    {
      title: 'Seaside Family Home',
      description: 'Large family home with direct beach access. Multiple bedrooms, large garden, and outdoor BBQ area. Perfect for family vacations.',
      pricePerNight: 280,
      securityDeposit: 2800,
      applicationFee: 100,
      bedrooms: 5,
      bathrooms: 4,
      squareFeet: 3500,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.Dishwasher, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
        'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
        'https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800',
        'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800'
      ],
      location: { address: 'Beach Road, Villa 12', city: 'Port Sudan', state: 'Red Sea', country: 'Sudan', postalCode: '22114', latitude: 19.5958, longitude: 37.2364 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.9, numberOfReviews: 9, guestCount: 12
    },

    // WAD MADANI - 3 Listings
    {
      title: 'Agricultural Villa',
      description: 'Spacious villa with garden and agricultural land in Wad Madani. Perfect for families who enjoy gardening and outdoor activities.',
      pricePerNight: 100,
      securityDeposit: 1000,
      applicationFee: 40,
      bedrooms: 4,
      bathrooms: 2,
      squareFeet: 2200,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.GreatView],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800'
      ],
      location: { address: 'Agricultural District, Villa 3', city: 'Wad Madani', state: 'Al Jazirah', country: 'Sudan', postalCode: '33111', latitude: 14.4019, longitude: 33.5199 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.3, numberOfReviews: 8, guestCount: 8
    },
    {
      title: 'Blue Nile View Apartment',
      description: 'Modern apartment with beautiful views of the Blue Nile. Located in central Wad Madani with easy access to local attractions.',
      pricePerNight: 80,
      securityDeposit: 800,
      applicationFee: 35,
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 900,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking],
      highlights: [Highlight.GreatView, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: { address: 'Nile Street, Building 7', city: 'Wad Madani', state: 'Al Jazirah', country: 'Sudan', postalCode: '33112', latitude: 14.3919, longitude: 33.5299 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.5, numberOfReviews: 16, guestCount: 4
    },
    {
      title: 'Traditional Guesthouse',
      description: 'Authentic Sudanese guesthouse with traditional architecture. Experience local hospitality in a comfortable setting.',
      pricePerNight: 60,
      securityDeposit: 600,
      applicationFee: 25,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1200,
      propertyType: PropertyType.Villa,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking],
      highlights: [Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
      ],
      location: { address: 'Old Town District, House 15', city: 'Wad Madani', state: 'Al Jazirah', country: 'Sudan', postalCode: '33113', latitude: 14.4119, longitude: 33.5099 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.4, numberOfReviews: 21, guestCount: 6
    },

    // KASSALA - 3 Listings
    {
      title: 'Mountain View Cottage',
      description: 'Charming cottage with beautiful views of the Taka Mountains. Features traditional Sudanese architecture with modern comforts.',
      pricePerNight: 80,
      securityDeposit: 800,
      applicationFee: 30,
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 800,
      propertyType: PropertyType.Cottage,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800',
        'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800'
      ],
      location: { address: 'Mountain District, Cottage 7', city: 'Kassala', state: 'Kassala', country: 'Sudan', postalCode: '44111', latitude: 15.4507, longitude: 36.3999 },
      isPublished: true, draft: false, instantBook: false, averageRating: 4.7, numberOfReviews: 16, guestCount: 4
    },
    {
      title: 'Taka Mountain Lodge',
      description: 'Rustic lodge at the foot of Taka Mountains. Perfect base for hiking and exploring the natural beauty of Kassala.',
      pricePerNight: 95,
      securityDeposit: 950,
      applicationFee: 40,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1100,
      propertyType: PropertyType.Cottage,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
        'https://images.unsplash.com/photo-1555854877-bab0e5b6856c?w=800',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800'
      ],
      location: { address: 'Taka Foothills, Lodge 2', city: 'Kassala', state: 'Kassala', country: 'Sudan', postalCode: '44112', latitude: 15.4607, longitude: 36.4099 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.8, numberOfReviews: 11, guestCount: 6
    },
    {
      title: 'City Center Flat',
      description: 'Convenient apartment in the center of Kassala. Walking distance to markets, restaurants, and local attractions.',
      pricePerNight: 55,
      securityDeposit: 550,
      applicationFee: 25,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 450,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.AirConditioning, Amenity.WiFi],
      highlights: [Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: { address: 'Central Kassala, Building 5', city: 'Kassala', state: 'Kassala', country: 'Sudan', postalCode: '44113', latitude: 15.4407, longitude: 36.3899 },
      isPublished: true, draft: false, instantBook: true, averageRating: 4.2, numberOfReviews: 33, guestCount: 2
    }
  ]

  // Create listings with locations
  console.log('🏠 Creating Sudanese listings with locations...')

  let publishedCount = 0

  for (const listing of listingData) {
    try {
      const location = await prisma.location.create({
        data: listing.location
      })

      await prisma.listing.create({
        data: {
          title: listing.title,
          description: listing.description,
          pricePerNight: listing.pricePerNight,
          securityDeposit: listing.securityDeposit,
          applicationFee: listing.applicationFee,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          squareFeet: listing.squareFeet,
          propertyType: listing.propertyType,
          isPetsAllowed: listing.isPetsAllowed,
          isParkingIncluded: listing.isParkingIncluded,
          amenities: listing.amenities,
          highlights: listing.highlights,
          photoUrls: listing.photoUrls,
          locationId: location.id,
          hostId: manager.id,
          isPublished: listing.isPublished,
          draft: listing.draft,
          instantBook: listing.instantBook,
          averageRating: listing.averageRating,
          numberOfReviews: listing.numberOfReviews,
          guestCount: listing.guestCount,
          postedDate: new Date()
        }
      })

      publishedCount++
      console.log(`✅ Created: ${listing.title} (${listing.location.city})`)
    } catch (error) {
      console.error(`❌ Error creating ${listing.title}:`, error)
    }
  }

  console.log('\n🎉 Sudan listings seed completed!')
  console.log(`📊 Total listings created: ${publishedCount}`)
  console.log(`\n🌍 Cities: Khartoum (8), Omdurman (6), Khartoum Bahri (4), Port Sudan (4), Wad Madani (3), Kassala (3)`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
