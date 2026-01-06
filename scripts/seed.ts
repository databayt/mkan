import { PrismaClient, PropertyType, Amenity, Highlight } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed process...')

  // Create test managers
  const managers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        username: 'Test Manager',
        role: 'MANAGER'
      }
    }),
    prisma.user.upsert({
      where: { email: 'sarah.johnson@realty.com' },
      update: {},
      create: {
        email: 'sarah.johnson@realty.com',
        username: 'Sarah Johnson',
        role: 'MANAGER'
      }
    }),
    prisma.user.upsert({
      where: { email: 'mike.chen@properties.com' },
      update: {},
      create: {
        email: 'mike.chen@properties.com',
        username: 'Mike Chen',
        role: 'MANAGER'
      }
    }),
    prisma.user.upsert({
      where: { email: 'lisa.martinez@luxury.com' },
      update: {},
      create: {
        email: 'lisa.martinez@luxury.com',
        username: 'Lisa Martinez',
        role: 'MANAGER'
      }
    })
  ])

  console.log(`✅ Created ${managers.length} managers`)

  // Define diverse property data
  const propertyData = [
    {
      name: 'Luxury Downtown Penthouse',
      description: 'Stunning penthouse apartment in the heart of downtown with panoramic city views. Features include a private rooftop terrace, floor-to-ceiling windows, and premium finishes throughout. Perfect for executives and professionals.',
      pricePerMonth: 4500,
      securityDeposit: 4500,
      applicationFee: 150,
      beds: 3,
      baths: 2.5,
      squareFeet: 2200,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.Gym, Amenity.Pool, Amenity.WiFi, Amenity.Parking],
      highlights: [Highlight.GreatView, Highlight.RecentlyRenovated, Highlight.HighSpeedInternetAccess],
      photoUrls: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'
      ],
      location: {
        address: '100 Main Street, Suite 3001',
        city: 'New York',
        state: 'NY',
        country: 'United States',
        postalCode: '10001',
        latitude: 40.7128,
        longitude: -74.0060
      },
      managerId: managers[0].id
    },
    {
      name: 'Cozy Beach House',
      description: 'Charming beach house just steps from the ocean. Features include a private deck, outdoor shower, and fully equipped kitchen. Perfect for beach lovers and remote workers seeking inspiration.',
      pricePerMonth: 3200,
      securityDeposit: 3200,
      applicationFee: 100,
      beds: 2,
      baths: 1.5,
      squareFeet: 1400,
      propertyType: PropertyType.Cottage,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.WiFi, Amenity.WasherDryer, Amenity.HardwoodFloors, Amenity.PetsAllowed],
      highlights: [Highlight.GreatView, Highlight.QuietNeighborhood, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
      ],
      location: {
        address: '25 Seaside Drive',
        city: 'Santa Monica',
        state: 'CA',
        country: 'United States',
        postalCode: '90401',
        latitude: 34.0195,
        longitude: -118.4912
      },
      managerId: managers[1].id
    },
    {
      name: 'Modern Family Villa',
      description: 'Spacious modern villa perfect for families. Features include a large backyard, gourmet kitchen, master suite with walk-in closet, and home office. Located in a quiet, family-friendly neighborhood.',
      pricePerMonth: 5800,
      securityDeposit: 5800,
      applicationFee: 200,
      beds: 4,
      baths: 3,
      squareFeet: 3200,
      propertyType: PropertyType.Villa,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WasherDryer, Amenity.Dishwasher, Amenity.WalkInClosets, Amenity.PetsAllowed, Amenity.Parking],
      highlights: [Highlight.RecentlyRenovated, Highlight.QuietNeighborhood, Highlight.SprinklerSystem],
      photoUrls: [
        'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'
      ],
      location: {
        address: '789 Maple Avenue',
        city: 'Austin',
        state: 'TX',
        country: 'United States',
        postalCode: '78701',
        latitude: 30.2672,
        longitude: -97.7431
      },
      managerId: managers[2].id
    },
    {
      name: 'Urban Loft Studio',
      description: 'Trendy loft studio in the arts district. Features exposed brick walls, high ceilings, and large windows. Perfect for artists, students, or young professionals. Walking distance to galleries, cafes, and public transport.',
      pricePerMonth: 1800,
      securityDeposit: 1800,
      applicationFee: 75,
      beds: 1,
      baths: 1,
      squareFeet: 650,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.WiFi, Amenity.HardwoodFloors, Amenity.HighSpeedInternet],
      highlights: [Highlight.HighSpeedInternetAccess, Highlight.CloseToTransit, Highlight.GreatView],
      photoUrls: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800'
      ],
      location: {
        address: '456 Art Street, Unit 2B',
        city: 'Portland',
        state: 'OR',
        country: 'United States',
        postalCode: '97201',
        latitude: 45.5152,
        longitude: -122.6784
      },
      managerId: managers[0].id
    },
    {
      name: 'Executive Townhouse',
      description: 'Elegant three-story townhouse in prestigious neighborhood. Features include a private garage, rooftop deck, marble countertops, and smart home technology. Ideal for executives and professionals.',
      pricePerMonth: 4200,
      securityDeposit: 4200,
      applicationFee: 125,
      beds: 3,
      baths: 2.5,
      squareFeet: 2100,
      propertyType: PropertyType.Townhouse,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.WasherDryer, Amenity.Dishwasher, Amenity.WalkInClosets, Amenity.Parking],
      highlights: [Highlight.RecentlyRenovated, Highlight.Intercom, Highlight.SprinklerSystem, Highlight.QuietNeighborhood],
      photoUrls: [
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
      ],
      location: {
        address: '321 Executive Row',
        city: 'Seattle',
        state: 'WA',
        country: 'United States',
        postalCode: '98101',
        latitude: 47.6062,
        longitude: -122.3321
      },
      managerId: managers[3].id
    },
    {
      name: 'Eco-Friendly Tiny House',
      description: 'Sustainable tiny house with solar panels, composting toilet, and rainwater collection. Perfect for environmentally conscious renters. Features include a loft bedroom, compact kitchen, and outdoor living space.',
      pricePerMonth: 1200,
      securityDeposit: 1200,
      applicationFee: 50,
      beds: 1,
      baths: 1,
      squareFeet: 400,
      propertyType: PropertyType.Tinyhouse,
      isPetsAllowed: true,
      isParkingIncluded: true,
      amenities: [Amenity.WiFi, Amenity.PetsAllowed],
      highlights: [Highlight.QuietNeighborhood, Highlight.GreatView],
      photoUrls: [
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800'
      ],
      location: {
        address: '15 Green Valley Road',
        city: 'Asheville',
        state: 'NC',
        country: 'United States',
        postalCode: '28801',
        latitude: 35.5951,
        longitude: -82.5515
      },
      managerId: managers[1].id
    },
    {
      name: 'Student Housing - Shared Rooms',
      description: 'Affordable shared housing near university campus. Each room is furnished with a bed, desk, and storage. Common areas include kitchen, living room, and study spaces. Perfect for students and young professionals.',
      pricePerMonth: 800,
      securityDeposit: 800,
      applicationFee: 25,
      beds: 1,
      baths: 0.5,
      squareFeet: 150,
      propertyType: PropertyType.Rooms,
      isPetsAllowed: false,
      isParkingIncluded: false,
      amenities: [Amenity.WiFi, Amenity.HighSpeedInternet, Amenity.WasherDryer],
      highlights: [Highlight.HighSpeedInternetAccess, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1555854877-bab0e5b6856c?w=800'
      ],
      location: {
        address: '200 College Avenue, Room 3A',
        city: 'Boston',
        state: 'MA',
        country: 'United States',
        postalCode: '02115',
        latitude: 42.3601,
        longitude: -71.0589
      },
      managerId: managers[2].id
    },
    {
      name: 'Luxury High-Rise Apartment',
      description: 'Premium apartment in luxury high-rise building. Features include concierge service, rooftop pool, fitness center, and stunning city views. Located in the financial district with easy access to public transport.',
      pricePerMonth: 3800,
      securityDeposit: 3800,
      applicationFee: 150,
      beds: 2,
      baths: 2,
      squareFeet: 1800,
      propertyType: PropertyType.Apartment,
      isPetsAllowed: false,
      isParkingIncluded: true,
      amenities: [Amenity.AirConditioning, Amenity.Pool, Amenity.Gym, Amenity.WiFi, Amenity.Parking, Amenity.Dishwasher],
      highlights: [Highlight.GreatView, Highlight.Intercom, Highlight.HighSpeedInternetAccess, Highlight.CloseToTransit],
      photoUrls: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'
      ],
      location: {
        address: '888 Financial Plaza, Floor 25',
        city: 'Chicago',
        state: 'IL',
        country: 'United States',
        postalCode: '60601',
        latitude: 41.8781,
        longitude: -87.6298
      },
      managerId: managers[3].id
    }
  ]

  // Create properties with locations
  console.log('🏠 Creating properties with locations...')
  
  for (const [index, property] of propertyData.entries()) {
    try {
      // Create location first
      const location = await prisma.location.create({
        data: property.location
      })

      // Create listing
      const createdProperty = await prisma.listing.create({
        data: {
          title: property.name,
          description: property.description,
          pricePerNight: property.pricePerMonth,
          securityDeposit: property.securityDeposit,
          applicationFee: property.applicationFee,
          bedrooms: property.beds,
          bathrooms: property.baths,
          squareFeet: property.squareFeet,
          propertyType: property.propertyType,
          isPetsAllowed: property.isPetsAllowed,
          isParkingIncluded: property.isParkingIncluded,
          amenities: property.amenities,
          highlights: property.highlights,
          photoUrls: property.photoUrls,
          locationId: location.id,
          hostId: property.managerId,
          isPublished: true,
          draft: false,
        }
      })

      console.log(`✅ Created listing: ${createdProperty.title}`)
    } catch (error) {
      console.error(`❌ Error creating property ${index + 1}:`, error)
    }
  }

  // Create some sample tenants
  const tenants = await Promise.all([
    prisma.user.upsert({
      where: { email: 'john.doe@email.com' },
      update: {},
      create: {
        email: 'john.doe@email.com',
        username: 'John Doe',
        role: 'TENANT'
      }
    }),
    prisma.user.upsert({
      where: { email: 'jane.smith@email.com' },
      update: {},
      create: {
        email: 'jane.smith@email.com',
        username: 'Jane Smith',
        role: 'TENANT'
      }
    }),
    prisma.user.upsert({
      where: { email: 'alex.wilson@email.com' },
      update: {},
      create: {
        email: 'alex.wilson@email.com',
        username: 'Alex Wilson',
        role: 'TENANT'
      }
    })
  ])

  console.log(`✅ Created ${tenants.length} tenants`)

  console.log('🎉 Seed completed successfully!')
  console.log(`📊 Summary:`)
  console.log(`   - ${managers.length} managers created`)
  console.log(`   - ${propertyData.length} properties created`)
  console.log(`   - ${tenants.length} tenants created`)
  console.log(`\n🌐 Visit http://localhost:3002/dashboard/properties to see your properties!`)
  console.log(`🔍 Visit http://localhost:3002/search to see the public search page!`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 