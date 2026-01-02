'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTransportHostValidation } from '@/context/transport-host-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';

const officeInfoSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  nameAr: z.string().optional(),
  phone: z.string().min(9, 'Please enter a valid phone number'),
  email: z.string().email('Please enter a valid email'),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  licenseNumber: z.string().optional(),
});

type OfficeInfoFormData = z.infer<typeof officeInfoSchema>;

const OfficeInfoPage = () => {
  const { enableNext, disableNext } = useTransportHostValidation();
  const { office, updateOfficeData, isLoading } = useTransportOffice();

  const {
    register,
    watch,
    formState: { errors, isValid },
    reset,
  } = useForm<OfficeInfoFormData>({
    resolver: zodResolver(officeInfoSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      nameAr: '',
      phone: '',
      email: '',
      description: '',
      descriptionAr: '',
      licenseNumber: '',
    },
  });

  useEffect(() => {
    if (office) {
      reset({
        name: office.name || '',
        nameAr: office.nameAr || '',
        phone: office.phone || '',
        email: office.email || '',
        description: office.description || '',
        descriptionAr: office.descriptionAr || '',
        licenseNumber: office.licenseNumber || '',
      });
    }
  }, [office, reset]);

  useEffect(() => {
    if (isValid) {
      enableNext();
    } else {
      disableNext();
    }
  }, [isValid, enableNext, disableNext]);

  const watchedValues = watch();

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (office && isValid) {
        updateOfficeData({
          name: watchedValues.name,
          nameAr: watchedValues.nameAr || null,
          phone: watchedValues.phone,
          email: watchedValues.email,
          description: watchedValues.description || null,
          descriptionAr: watchedValues.descriptionAr || null,
          licenseNumber: watchedValues.licenseNumber || null,
        });
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [watchedValues, office, isValid, updateOfficeData]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Tell us about your office</h1>
          <p className="text-muted-foreground">
            Enter your transport office details. This information will be shown
            to travelers when they search for trips.
          </p>
        </div>

        <div className="flex-1 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Office Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Express Transport"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">Office Name (Arabic)</Label>
            <Input
              id="nameAr"
              {...register('nameAr')}
              placeholder="e.g., النقل السريع"
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                {...register('phone')}
                placeholder="+249 9xxxxxxxx"
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="office@example.com"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="licenseNumber">License Number (Optional)</Label>
            <Input
              id="licenseNumber"
              {...register('licenseNumber')}
              placeholder="Transport license number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Tell travelers about your services, experience, and what makes your office special..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionAr">Description (Arabic)</Label>
            <Textarea
              id="descriptionAr"
              {...register('descriptionAr')}
              placeholder="أخبر المسافرين عن خدماتك..."
              rows={4}
              dir="rtl"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfficeInfoPage;
