'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Save, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import Header from '@/components/Header';
import Loading from '@/components/Loading';
import { getAuthUser } from '@/lib/actions/user-actions';
import {
  getMyTransportOffices,
  updateTransportOffice,
  deleteTransportOffice,
} from '@/lib/actions/transport-actions';

const settingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  nameAr: z.string().optional(),
  phone: z.string().min(9, 'Please enter a valid phone number'),
  email: z.string().email('Please enter a valid email'),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  licenseNumber: z.string().optional(),
  isActive: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const OfficeSettingsPage = () => {
  const router = useRouter();
  const [offices, setOffices] = useState<any[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      isActive: true,
    },
  });

  const isActive = watch('isActive');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const user = await getAuthUser();

        if (user?.id) {
          const myOffices = await getMyTransportOffices();
          setOffices(myOffices);

          const firstOffice = myOffices[0];
          if (firstOffice) {
            setSelectedOffice(firstOffice);
            reset({
              name: firstOffice.name,
              nameAr: firstOffice.nameAr || '',
              phone: firstOffice.phone,
              email: firstOffice.email,
              description: firstOffice.description || '',
              descriptionAr: firstOffice.descriptionAr || '',
              licenseNumber: firstOffice.licenseNumber || '',
              isActive: firstOffice.isActive,
            });
          }
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error loading settings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [reset]);

  const handleOfficeChange = (officeId: number) => {
    const office = offices.find((o) => o.id === officeId);
    if (office) {
      setSelectedOffice(office);
      reset({
        name: office.name,
        nameAr: office.nameAr || '',
        phone: office.phone,
        email: office.email,
        description: office.description || '',
        descriptionAr: office.descriptionAr || '',
        licenseNumber: office.licenseNumber || '',
        isActive: office.isActive,
      });
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    if (!selectedOffice) return;

    setIsSaving(true);
    try {
      await updateTransportOffice(selectedOffice.id, {
        name: data.name,
        nameAr: data.nameAr || undefined,
        phone: data.phone,
        email: data.email,
        description: data.description || undefined,
        descriptionAr: data.descriptionAr || undefined,
        licenseNumber: data.licenseNumber || undefined,
      });

      setOffices((prev) =>
        prev.map((o) =>
          o.id === selectedOffice.id ? { ...o, ...data } : o
        )
      );
      setSelectedOffice((prev: any) => ({ ...prev, ...data }));
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOffice) return;

    try {
      await deleteTransportOffice(selectedOffice.id);
      router.push('/offices');
    } catch (err) {
      console.error('Error deleting office:', err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  if (offices.length === 0) {
    return (
      <div className="dashboard-container">
        <Header title="Settings" subtitle="Manage office settings" />
        <p className="text-muted-foreground">No transport office found.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Header title="Office Settings" subtitle="Manage your transport office" />

      {offices.length > 1 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {offices.map((office) => (
            <Button
              key={office.id}
              variant={selectedOffice?.id === office.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleOfficeChange(office.id)}
            >
              {office.name}
            </Button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Office Information
            </CardTitle>
            <CardDescription>
              Update your office details visible to travelers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Office Name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameAr">Office Name (Arabic)</Label>
                <Input id="nameAr" {...register('nameAr')} dir="rtl" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" type="tel" {...register('phone')} />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input id="licenseNumber" {...register('licenseNumber')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register('description')} rows={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriptionAr">Description (Arabic)</Label>
              <Textarea
                id="descriptionAr"
                {...register('descriptionAr')}
                rows={3}
                dir="rtl"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Office Status</CardTitle>
            <CardDescription>Control your office visibility</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Active Status</p>
                <p className="text-sm text-muted-foreground">
                  {isActive
                    ? 'Your office is visible and accepting bookings'
                    : 'Your office is hidden from travelers'}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => setValue('isActive', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Office
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Delete Transport Office
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your
                  office, all buses, routes, and booking history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="submit" disabled={!isDirty || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OfficeSettingsPage;
