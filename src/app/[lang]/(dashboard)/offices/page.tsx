'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bus,
  Calendar,
  Ticket,
  TrendingUp,
  Users,
  DollarSign,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Header from '@/components/Header';
import Loading from '@/components/Loading';
import { getAuthUser } from '@/lib/actions/user-actions';
import {
  getMyTransportOffices,
  getOfficeDashboardStats,
} from '@/lib/actions/transport-actions';

interface OfficeStats {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  totalRevenue: number;
  upcomingTrips: number;
  totalBuses: number;
  totalRoutes: number;
}

interface TransportOffice {
  id: number;
  name: string;
  nameAr: string | null;
  logoUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  _count: {
    buses: number;
    routes: number;
    bookings: number;
  };
}

const OfficeDashboard = () => {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<any>(null);
  const [offices, setOffices] = useState<TransportOffice[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null);
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const user = await getAuthUser();
        setAuthUser(user);

        if (user?.id) {
          const myOffices = await getMyTransportOffices();
          setOffices(myOffices as TransportOffice[]);

          const firstOffice = myOffices[0];
          if (firstOffice) {
            setSelectedOfficeId(firstOffice.id);
            const officeStats = await getOfficeDashboardStats(firstOffice.id);
            setStats(officeStats);
          }
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error loading dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleOfficeChange = async (officeId: number) => {
    setSelectedOfficeId(officeId);
    try {
      const officeStats = await getOfficeDashboardStats(officeId);
      setStats(officeStats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  if (offices.length === 0) {
    return (
      <div className="dashboard-container">
        <Header
          title="Transport Office"
          subtitle="Manage your transport business"
        />
        <Card className="max-w-xl mx-auto mt-8">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Bus className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No Transport Office</CardTitle>
            <CardDescription>
              You haven't created a transport office yet. Start by registering
              your office to manage buses, routes, and bookings.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/transport-host')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Transport Office
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedOffice = offices.find((o) => o.id === selectedOfficeId);

  return (
    <div className="dashboard-container">
      <Header
        title="Transport Dashboard"
        subtitle={selectedOffice?.name || 'Manage your transport business'}
      />

      {offices.length > 1 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {offices.map((office) => (
            <Button
              key={office.id}
              variant={selectedOfficeId === office.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleOfficeChange(office.id)}
            >
              {office.name}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBookings || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.pendingBookings || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.totalRevenue || 0).toLocaleString()} SDG
            </div>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Trips</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.upcomingTrips || 0}</div>
            <p className="text-xs text-muted-foreground">Next 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fleet Size</CardTitle>
            <Bus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBuses || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalRoutes || 0} routes
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => router.push('/offices/bookings')}
            >
              <span className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                View Bookings
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => router.push('/offices/trips')}
            >
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Manage Trips
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() =>
                router.push(`/transport-host/${selectedOfficeId}/buses`)
              }
            >
              <span className="flex items-center gap-2">
                <Bus className="h-4 w-4" />
                Manage Buses
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest bookings and updates</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.totalBookings === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No bookings yet</p>
                <p className="text-sm mt-1">
                  Bookings will appear here once travelers start booking
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {stats?.confirmedBookings || 0} confirmed bookings
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ready for travel
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {stats?.pendingBookings || 0} pending bookings
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Awaiting confirmation
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OfficeDashboard;
