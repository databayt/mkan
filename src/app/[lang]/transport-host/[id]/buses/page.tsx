'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bus, Plus, Trash2, Edit2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTransportHostValidation } from '@/components/onboarding';
import { useTransportOffice } from '@/context/transport-office-context';
import { createBus, updateBus, deleteBus, getBusesByOffice } from '@/lib/actions/transport-actions';
import { BusAmenity } from '@prisma/client';

const BUS_AMENITIES = [
  { value: 'AirConditioning', label: 'Air Conditioning' },
  { value: 'WiFi', label: 'WiFi' },
  { value: 'USB', label: 'USB Charging' },
  { value: 'LegRoom', label: 'Extra Leg Room' },
  { value: 'Toilet', label: 'Toilet' },
  { value: 'Refreshments', label: 'Refreshments' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Luggage', label: 'Luggage Storage' },
  { value: 'Reclining', label: 'Reclining Seats' },
];

const busSchema = z.object({
  plateNumber: z.string().min(3, 'Plate number is required'),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  year: z.number().optional(),
  capacity: z.number().min(1, 'Capacity must be at least 1'),
  amenities: z.array(z.string()).default([]),
});

type BusFormData = z.infer<typeof busSchema>;

interface BusData {
  id: number;
  plateNumber: string;
  model: string | null;
  manufacturer: string | null;
  year: number | null;
  capacity: number;
  amenities: string[];
  isActive: boolean;
}

const BusesPage = () => {
  const { enableNext, disableNext } = useTransportHostValidation();
  const { office } = useTransportOffice();
  const [buses, setBuses] = useState<BusData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BusFormData>({
    resolver: zodResolver(busSchema),
    defaultValues: {
      plateNumber: '',
      model: '',
      manufacturer: '',
      capacity: 45,
      amenities: [],
    },
  });

  useEffect(() => {
    async function loadBuses() {
      if (!office?.id) return;
      try {
        const officeBuses = await getBusesByOffice(office.id);
        setBuses(officeBuses as BusData[]);
      } catch (error) {
        console.error('Error loading buses:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadBuses();
  }, [office?.id]);

  useEffect(() => {
    if (buses.length > 0) {
      enableNext();
    } else {
      disableNext();
    }
  }, [buses.length, enableNext, disableNext]);

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity)
        ? prev.filter((a) => a !== amenity)
        : [...prev, amenity]
    );
  };

  const onSubmit = async (data: BusFormData) => {
    if (!office?.id) return;

    try {
      const busData = {
        ...data,
        amenities: selectedAmenities as BusAmenity[],
        officeId: office.id,
        photoUrls: [] as string[],
      };

      if (editingBus) {
        const updated = await updateBus(editingBus.id, busData);
        if (updated) {
          setBuses((prev) =>
            prev.map((b) => (b.id === editingBus.id ? (updated as BusData) : b))
          );
        }
      } else {
        const created = await createBus(busData);
        if (created) {
          setBuses((prev) => [...prev, created as BusData]);
        }
      }

      setIsDialogOpen(false);
      setEditingBus(null);
      setSelectedAmenities([]);
      reset();
    } catch (error) {
      console.error('Error saving bus:', error);
    }
  };

  const handleEdit = (bus: BusData) => {
    setEditingBus(bus);
    setSelectedAmenities(bus.amenities || []);
    reset({
      plateNumber: bus.plateNumber,
      model: bus.model || '',
      manufacturer: bus.manufacturer || '',
      year: bus.year || undefined,
      capacity: bus.capacity,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (busId: number) => {
    try {
      await deleteBus(busId);
      setBuses((prev) => prev.filter((b) => b.id !== busId));
    } catch (error) {
      console.error('Error deleting bus:', error);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingBus(null);
    setSelectedAmenities([]);
    reset();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bus className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Add your buses</h1>
          <p className="text-muted-foreground">
            Register the buses in your fleet. Include details like capacity and
            amenities to help travelers choose.
          </p>
        </div>

        <div className="flex-1 space-y-6">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" onClick={() => handleDialogClose()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Bus
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingBus ? 'Edit Bus' : 'Add New Bus'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="plateNumber">Plate Number *</Label>
                  <Input
                    id="plateNumber"
                    {...register('plateNumber')}
                    placeholder="e.g., ABC 1234"
                  />
                  {errors.plateNumber && (
                    <p className="text-sm text-destructive">
                      {errors.plateNumber.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <Input
                      id="manufacturer"
                      {...register('manufacturer')}
                      placeholder="e.g., Mercedes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      {...register('model')}
                      placeholder="e.g., Travego"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      {...register('year', { valueAsNumber: true })}
                      placeholder="e.g., 2020"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Capacity *</Label>
                    <Input
                      id="capacity"
                      type="number"
                      {...register('capacity', { valueAsNumber: true })}
                      placeholder="e.g., 45"
                    />
                    {errors.capacity && (
                      <p className="text-sm text-destructive">
                        {errors.capacity.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Amenities</Label>
                  <div className="flex flex-wrap gap-2">
                    {BUS_AMENITIES.map((amenity) => (
                      <Badge
                        key={amenity.value}
                        variant={
                          selectedAmenities.includes(amenity.value)
                            ? 'default'
                            : 'outline'
                        }
                        className="cursor-pointer"
                        onClick={() => toggleAmenity(amenity.value)}
                      >
                        {amenity.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDialogClose}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingBus ? 'Save Changes' : 'Add Bus'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : buses.length > 0 ? (
            <div className="space-y-3">
              {buses.map((bus) => (
                <div
                  key={bus.id}
                  className="p-4 rounded-lg border bg-background"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {bus.plateNumber}
                        {bus.manufacturer && ` - ${bus.manufacturer}`}
                        {bus.model && ` ${bus.model}`}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bus.capacity} seats
                        {bus.year && ` • ${bus.year}`}
                      </p>
                      {bus.amenities && bus.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {bus.amenities.slice(0, 4).map((amenity) => (
                            <Badge
                              key={amenity}
                              variant="secondary"
                              className="text-xs"
                            >
                              {
                                BUS_AMENITIES.find((a) => a.value === amenity)
                                  ?.label
                              }
                            </Badge>
                          ))}
                          {bus.amenities.length > 4 && (
                            <Badge variant="secondary" className="text-xs">
                              +{bus.amenities.length - 4} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(bus)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(bus.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Bus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No buses added yet</p>
              <p className="text-sm mt-1">
                Add at least one bus to continue
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusesPage;
