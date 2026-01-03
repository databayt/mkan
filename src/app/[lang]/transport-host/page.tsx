'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Plus, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { getMyTransportOffices } from '@/lib/actions/transport-actions';

export const dynamic = 'force-dynamic';

interface TransportOffice {
  id: number;
  name: string;
  nameAr: string | null;
  logoUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  assemblyPoint: {
    name: string;
    city: string;
  } | null;
  _count: {
    buses: number;
    routes: number;
  };
}

const TransportHostPage = () => {
  const router = useRouter();
  const { session, status } = useAuthRedirect();
  const [offices, setOffices] = useState<TransportOffice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadOffices() {
      try {
        const myOffices = await getMyTransportOffices();
        setOffices(myOffices as TransportOffice[]);
      } catch (error) {
        console.error('Error loading offices:', error);
      } finally {
        setIsLoading(false);
      }
    }
    if (session) {
      loadOffices();
    }
  }, [session]);

  const handleOfficeClick = (id: number) => {
    router.push(`/transport-host/${id}/office-info`);
  };

  const handleCreateNew = () => {
    router.push('/transport-host/overview');
  };

  if (status === 'loading' || isLoading) {
    return <Loading variant="fullscreen" text="Loading..." />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
            <Bus className="h-5 w-5" />
            <span className="text-sm font-medium">Transport Host</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Welcome, {session.user?.name || 'Host'}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage your transport offices and start accepting online bookings for
            your bus services.
          </p>
        </div>

        {offices.length > 0 ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Your Offices</h2>
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add New Office
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {offices.map((office) => (
                <Card
                  key={office.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleOfficeClick(office.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        {office.logoUrl ? (
                          <img
                            src={office.logoUrl}
                            alt={office.name}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <Building2 className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="flex gap-2">
                        {office.isVerified && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                            Verified
                          </span>
                        )}
                        {!office.isActive && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                            Draft
                          </span>
                        )}
                      </div>
                    </div>
                    <CardTitle className="mt-4">{office.name}</CardTitle>
                    <CardDescription>
                      {office.assemblyPoint
                        ? `${office.assemblyPoint.name}, ${office.assemblyPoint.city}`
                        : 'No location set'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{office._count.buses} buses</span>
                      <span>{office._count.routes} routes</span>
                    </div>
                    <Button variant="ghost" className="mt-4 w-full">
                      Continue Setup
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card className="max-w-xl mx-auto">
            <CardHeader className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bus className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Start Your Transport Business</CardTitle>
              <CardDescription>
                Register your transport office and start accepting online
                bookings. Add your buses, define routes, and reach more
                customers.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button
                size="lg"
                onClick={handleCreateNew}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Office
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">1</span>
            </div>
            <h3 className="font-semibold mb-2">Add Your Office</h3>
            <p className="text-sm text-muted-foreground">
              Enter your office details and select your assembly point location.
            </p>
          </div>
          <div className="text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">2</span>
            </div>
            <h3 className="font-semibold mb-2">Add Buses & Routes</h3>
            <p className="text-sm text-muted-foreground">
              Register your buses with amenities and define your routes with
              pricing.
            </p>
          </div>
          <div className="text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">3</span>
            </div>
            <h3 className="font-semibold mb-2">Start Receiving Bookings</h3>
            <p className="text-sm text-muted-foreground">
              Publish your office and start accepting online bookings from
              travelers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransportHostPage;
