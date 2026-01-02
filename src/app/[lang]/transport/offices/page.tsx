'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Phone,
  Star,
  Bus,
  Search,
  CheckCircle,
} from 'lucide-react';
import { getTransportOffices } from '@/lib/actions/transport-actions';

interface TransportOffice {
  id: number;
  name: string;
  nameAr: string | null;
  description: string | null;
  logoUrl: string | null;
  phone: string;
  rating: number | null;
  reviewCount: number;
  isVerified: boolean;
  assemblyPoint: {
    name: string;
    city: string;
  };
  _count: {
    buses: number;
    routes: number;
  };
}

export default function OfficesListPage() {
  const [offices, setOffices] = useState<TransportOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchOffices = async () => {
      try {
        const data = await getTransportOffices();
        setOffices(data || []);
      } catch (error) {
        console.error('Failed to fetch offices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOffices();
  }, []);

  const filteredOffices = offices.filter((office) =>
    office.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    office.assemblyPoint.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 bg-gray-200 rounded" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Transport Offices</h1>
        <p className="text-muted-foreground">
          Find and book with trusted transport operators
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by office name or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Offices Grid */}
      {filteredOffices.length === 0 ? (
        <div className="text-center py-12">
          <Bus className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No offices found</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOffices.map((office) => (
            <Link key={office.id} href={`/transport/offices/${office.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {office.logoUrl ? (
                        <img
                          src={office.logoUrl}
                          alt={office.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Bus className="h-6 w-6 text-primary" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {office.name}
                          {office.isVerified && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {office.assemblyPoint.city}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Rating */}
                  {office.rating !== null && office.rating > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{office.rating.toFixed(1)}</span>
                      <span className="text-muted-foreground text-sm">
                        ({office.reviewCount} reviews)
                      </span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mb-3">
                    <Badge variant="secondary" className="gap-1">
                      <Bus className="h-3 w-3" />
                      {office._count.buses} buses
                    </Badge>
                    <Badge variant="secondary">
                      {office._count.routes} routes
                    </Badge>
                  </div>

                  {/* Contact */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {office.phone}
                  </div>

                  {/* Description */}
                  {office.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {office.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
