import { Metadata } from "next";
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, MapPin, DollarSign } from 'lucide-react'
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang as Locale);
  return createMetadata({
    title: d.dashboard.properties.title,
    description: d.dashboard.properties.subtitle,
    locale: lang,
    path: "/dashboard/properties",
  });
}

// Force dynamic rendering to allow use of headers() in auth
export const dynamic = 'force-dynamic';

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const d = await getDictionary(lang as Locale);

  const session = await auth();

  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  const properties = await db.listing.findMany({
    where: {
      hostId: session.user.id,
    },
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
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{d.dashboard.properties.title}</h1>
          <p className="text-gray-600 mt-2">
            {d.dashboard.properties.subtitle}
          </p>
        </div>
        <Link href={`/${lang}/dashboard/properties/new`}>
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {d.dashboard.properties.addNew}
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
              <h3 className="text-lg font-semibold">{d.dashboard.properties.noProperties}</h3>
              <p className="text-gray-600 max-w-md">
                {d.dashboard.properties.noPropertiesMessage}
              </p>
              <Link href={`/${lang}/dashboard/properties/new`}>
                <Button>{d.dashboard.propertyManagement.addFirstProperty}</Button>
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
                  <MapPin className="w-4 h-4 me-1" />
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
                    <Link href={`/${lang}/search/${property.id}`}>
                      {d.dashboard.common.view}
                    </Link>
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <Link href={`/${lang}/dashboard/properties/${property.id}`}>
                      {d.dashboard.common.manage}
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