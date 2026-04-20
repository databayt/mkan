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
import { usePathname } from 'next/navigation';
import {
  getMyTransportOffices,
  getOfficeDashboardStats,
} from '@/lib/actions/transport-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';

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
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const dict = useDictionary();
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
          setOffices(myOffices as unknown as TransportOffice[]);

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
  if (error) return <div className="text-red-500">{dict.dashboard.common.error}: {error}</div>;

  if (offices.length === 0) {
    return (
      <div className="dashboard-container">
        <Header
          title={dict.dashboard.offices.title}
          subtitle={dict.dashboard.offices.subtitle}
        />
        <Card className="max-w-xl mx-auto mt-8">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Bus className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>{dict.dashboard.offices.noOffice}</CardTitle>
            <CardDescription>
              {dict.dashboard.offices.noOfficeDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/transport-host')}>
              <Plus className="h-4 w-4 me-2" />
              {dict.dashboard.offices.createOffice}
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
        title={dict.dashboard.offices.transportDashboard}
        subtitle={selectedOffice?.name || dict.dashboard.offices.subtitle}
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
            <CardTitle className="text-sm font-medium">{dict.dashboard.offices.totalBookings}</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBookings || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.pendingBookings || 0} {dict.dashboard.common.pending}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{dict.dashboard.offices.revenue}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {`${(stats?.totalRevenue || 0).toLocaleString()} ${dict.dashboard.offices.currencySDG}`}
            </div>
            <p className="text-xs text-muted-foreground">{dict.dashboard.offices.totalEarnings}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{dict.dashboard.offices.upcomingTrips}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.upcomingTrips || 0}</div>
            <p className="text-xs text-muted-foreground">{dict.dashboard.offices.next7Days}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{dict.dashboard.offices.fleetSize}</CardTitle>
            <Bus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBuses || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalRoutes || 0} {dict.dashboard.common.routes}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{dict.dashboard.offices.quickActions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => router.push('/offices/bookings')}
            >
              <span className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                {dict.dashboard.offices.viewBookings}
              </span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => router.push('/offices/trips')}
            >
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {dict.dashboard.offices.manageTrips}
              </span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
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
                {dict.dashboard.offices.manageBuses}
              </span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict.dashboard.offices.recentActivity}</CardTitle>
            <CardDescription>{dict.dashboard.offices.latestBookingsAndUpdates}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.totalBookings === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{dict.dashboard.offices.noBookingsYet}</p>
                <p className="text-sm mt-1">
                  {dict.dashboard.offices.bookingsWillAppear}
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
                      {stats?.confirmedBookings || 0} {dict.dashboard.offices.confirmedBookings}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {dict.dashboard.offices.readyForTravel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {stats?.pendingBookings || 0} {dict.dashboard.offices.pendingBookings}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {dict.dashboard.offices.awaitingConfirmation}
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
