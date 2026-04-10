'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { MapPin, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTransportHostValidation } from '@/context/onboarding-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';
import { getAssemblyPoints } from '@/lib/actions/transport-actions';
import HostStepLayout from '@/components/host/host-step-layout';

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  address: string;
  city: string;
}

const AssemblyPointPage = () => {
  const { enableNext, disableNext } = useTransportHostValidation();
  const { office, updateOfficeData } = useTransportOffice();
  const [assemblyPoints, setAssemblyPoints] = useState<AssemblyPoint[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAssemblyPoints() {
      try {
        const points = await getAssemblyPoints();
        setAssemblyPoints(points);
      } catch (error) {
        console.error('Error loading assembly points:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAssemblyPoints();
  }, []);

  useEffect(() => {
    if (office?.assemblyPointId) {
      setSelectedId(office.assemblyPointId);
    }
  }, [office]);

  useEffect(() => {
    if (selectedId) {
      enableNext();
    } else {
      disableNext();
    }
  }, [selectedId, enableNext, disableNext]);

  const handleSelect = async (pointId: number) => {
    setSelectedId(pointId);
    await updateOfficeData({ assemblyPointId: pointId });
  };

  const filteredPoints = assemblyPoints.filter(
    (point) =>
      point.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      point.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      point.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <HostStepLayout
      title={<h3>Select your assembly point</h3>}
      subtitle="Choose the assembly point where your office is located. This is where passengers will come to board your buses."
    >
      <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="search">Search locations</Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or city..."
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : filteredPoints.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {filteredPoints.map((point) => (
                <button
                  key={point.id}
                  onClick={() => handleSelect(point.id)}
                  className={`w-full p-4 rounded-lg border text-start transition-all ${
                    selectedId === point.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{point.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {point.address}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {point.city}
                      </p>
                    </div>
                    {selectedId === point.id && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No assembly points found</p>
              <p className="text-sm mt-1">
                Try a different search term or contact support
              </p>
            </div>
          )}
      </div>
    </HostStepLayout>
  );
};

export default AssemblyPointPage;
