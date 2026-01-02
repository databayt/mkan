'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Route, Plus, Trash2, Edit2, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTransportHostValidation } from '@/context/transport-host-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';
import {
  createRoute,
  updateRoute,
  deleteRoute,
  getRoutesByOffice,
  getAssemblyPoints,
} from '@/lib/actions/transport-actions';

const routeSchema = z.object({
  originId: z.number().min(1, 'Origin is required'),
  destinationId: z.number().min(1, 'Destination is required'),
  basePrice: z.number().min(1, 'Price must be at least 1'),
  duration: z.number().min(1, 'Duration is required'),
  distance: z.number().optional(),
});

type RouteFormData = z.infer<typeof routeSchema>;

interface AssemblyPoint {
  id: number;
  name: string;
  city: string;
}

interface RouteData {
  id: number;
  originId: number;
  destinationId: number;
  basePrice: number;
  duration: number;
  distance: number | null;
  isActive: boolean;
  origin: AssemblyPoint;
  destination: AssemblyPoint;
}

const RoutesPage = () => {
  const { enableNext, disableNext } = useTransportHostValidation();
  const { office } = useTransportOffice();
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [assemblyPoints, setAssemblyPoints] = useState<AssemblyPoint[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RouteFormData>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      basePrice: 1000,
      duration: 60,
    },
  });

  const originId = watch('originId');
  const destinationId = watch('destinationId');

  useEffect(() => {
    async function loadData() {
      try {
        const [points, officeRoutes] = await Promise.all([
          getAssemblyPoints(),
          office?.id ? getRoutesByOffice(office.id) : Promise.resolve([]),
        ]);
        setAssemblyPoints(points);
        setRoutes(officeRoutes as RouteData[]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [office?.id]);

  useEffect(() => {
    if (routes.length > 0) {
      enableNext();
    } else {
      disableNext();
    }
  }, [routes.length, enableNext, disableNext]);

  const onSubmit = async (data: RouteFormData) => {
    if (!office?.id) return;

    try {
      const routeData = {
        ...data,
        officeId: office.id,
      };

      if (editingRoute) {
        const updated = await updateRoute(editingRoute.id, routeData);
        if (updated) {
          setRoutes((prev) =>
            prev.map((r) => (r.id === editingRoute.id ? (updated as RouteData) : r))
          );
        }
      } else {
        const created = await createRoute(routeData);
        if (created) {
          setRoutes((prev) => [...prev, created as RouteData]);
        }
      }

      setIsDialogOpen(false);
      setEditingRoute(null);
      reset();
    } catch (error) {
      console.error('Error saving route:', error);
    }
  };

  const handleEdit = (route: RouteData) => {
    setEditingRoute(route);
    reset({
      originId: route.originId,
      destinationId: route.destinationId,
      basePrice: route.basePrice,
      duration: route.duration,
      distance: route.distance || undefined,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (routeId: number) => {
    try {
      await deleteRoute(routeId);
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    } catch (error) {
      console.error('Error deleting route:', error);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingRoute(null);
    reset();
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Route className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Define your routes</h1>
          <p className="text-muted-foreground">
            Set up the routes you operate. Each route connects two assembly
            points with a base price and estimated duration.
          </p>
        </div>

        <div className="flex-1 space-y-6">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" onClick={() => handleDialogClose()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Route
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingRoute ? 'Edit Route' : 'Add New Route'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Origin *</Label>
                  <Select
                    value={originId?.toString()}
                    onValueChange={(value) =>
                      setValue('originId', parseInt(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select origin" />
                    </SelectTrigger>
                    <SelectContent>
                      {assemblyPoints
                        .filter((p) => p.id !== destinationId)
                        .map((point) => (
                          <SelectItem key={point.id} value={point.id.toString()}>
                            {point.name} ({point.city})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.originId && (
                    <p className="text-sm text-destructive">
                      {errors.originId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Destination *</Label>
                  <Select
                    value={destinationId?.toString()}
                    onValueChange={(value) =>
                      setValue('destinationId', parseInt(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {assemblyPoints
                        .filter((p) => p.id !== originId)
                        .map((point) => (
                          <SelectItem key={point.id} value={point.id.toString()}>
                            {point.name} ({point.city})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.destinationId && (
                    <p className="text-sm text-destructive">
                      {errors.destinationId.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePrice">Base Price (SDG) *</Label>
                    <Input
                      id="basePrice"
                      type="number"
                      {...register('basePrice', { valueAsNumber: true })}
                      placeholder="e.g., 3500"
                    />
                    {errors.basePrice && (
                      <p className="text-sm text-destructive">
                        {errors.basePrice.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes) *</Label>
                    <Input
                      id="duration"
                      type="number"
                      {...register('duration', { valueAsNumber: true })}
                      placeholder="e.g., 180"
                    />
                    {errors.duration && (
                      <p className="text-sm text-destructive">
                        {errors.duration.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="distance">Distance (km)</Label>
                  <Input
                    id="distance"
                    type="number"
                    {...register('distance', { valueAsNumber: true })}
                    placeholder="e.g., 250"
                  />
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
                    {editingRoute ? 'Save Changes' : 'Add Route'}
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
          ) : routes.length > 0 ? (
            <div className="space-y-3">
              {routes.map((route) => (
                <div
                  key={route.id}
                  className="p-4 rounded-lg border bg-background"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {route.origin.city}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {route.destination.city}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDuration(route.duration)}
                        {route.distance && ` • ${route.distance} km`}
                      </p>
                      <p className="text-sm font-medium text-primary mt-1">
                        {route.basePrice.toLocaleString()} SDG
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(route)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(route.id)}
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
              <Route className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No routes added yet</p>
              <p className="text-sm mt-1">
                Add at least one route to continue
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoutesPage;
