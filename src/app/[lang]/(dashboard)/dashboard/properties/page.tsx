import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, MapPin, DollarSign } from 'lucide-react'

// Force dynamic rendering to allow use of headers() in auth
export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  // TODO: Uncomment auth check when ready for production
  // const session = await auth()
  
  // if (!session?.user) {
  //   redirect('/login')
  // }

  console.log('🏠 === PROPERTIES PAGE DEBUG ===')
  
  // Debug: Check all users and properties in database
  const allUsers = await db.user.findMany()
  const allProperties = await db.listing.findMany({
    include: { location: true, host: true }
  })

  console.log('👥 All users in database:', allUsers.map(u => ({ id: u.id, email: u.email, username: u.username })))
  console.log('🏠 All properties in database:', allProperties.map(p => ({
    id: p.id,
    title: p.title,
    hostId: p.hostId,
    host: p.host ? { id: p.host.id, email: p.host.email } : null
  })))
  
  // For debugging: Show all properties instead of filtering by user
  const properties = await db.listing.findMany({
    // where: {
    //   hostId: session.user.id
    // },
    include: {
      location: true,
      _count: {
        select: {
          applications: true,
          leases: true
        }
      }
    },
    orderBy: {
      id: 'desc'
    }
  })

  console.log('🏠 Found properties:', properties.length)
  properties.forEach((property, index) => {
    console.log(`🏠 Property ${index + 1}:`, {
      id: property.id,
      title: property.title,
      hostId: property.hostId,
      pricePerNight: property.pricePerNight,
      location: property.location ? `${property.location.city}, ${property.location.state}` : 'N/A'
    })
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Properties</h1>
          <p className="text-gray-600 mt-2">
            Manage your property listings and track applications
          </p>
        </div>
        <Link href="/dashboard/properties/new">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add New Property
          </Button>
        </Link>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold">No properties yet</h3>
              <p className="text-gray-600 max-w-md">
                Start by adding your first property listing.
              </p>
              <Link href="/dashboard/properties/new">
                <Button>Add Your First Property</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <Card key={property.id} className="group hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg line-clamp-2">{property.title}</CardTitle>
                <div className="flex items-center text-gray-600">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span className="text-sm">
                    {property.location?.city ?? 'N/A'}, {property.location?.state ?? 'N/A'}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="font-medium">${property.pricePerNight?.toLocaleString() ?? 0}/night</span>
                </div>
                
                <Badge variant="secondary">
                  {property.propertyType}
                </Badge>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href={`/search/${property.id}`}>
                      View
                    </Link>
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <Link href={`/dashboard/properties/${property.id}`}>
                      Manage
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
} 