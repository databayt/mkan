"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTransportHostValidation } from '@/context/onboarding-validation-context';
import { useTransportOffice } from '@/context/transport-office-context';
import HostStepLayout from '@/components/host/host-step-layout';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const OfficeInfoPage = () => {
  const { enableNext, disableNext } = useTransportHostValidation();
  const { office, updateOfficeData, isLoading } = useTransportOffice();
  const dict = useDictionary();
  const t = dict?.transportHost?.officeInfo;

  const officeInfoSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t?.validation?.nameMin ?? 'Name must be at least 2 characters'),
        nameAr: z.string().optional(),
        phone: z.string().min(9, t?.validation?.phoneInvalid ?? 'Please enter a valid phone number'),
        email: z.string().email(t?.validation?.emailInvalid ?? 'Please enter a valid email'),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        licenseNumber: z.string().optional(),
      }),
    [t]
  );

  type OfficeInfoFormData = z.infer<typeof officeInfoSchema>;

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
    <HostStepLayout
      title={<h3>{t?.title ?? "Tell us about your office"}</h3>}
      subtitle={
        t?.subtitle ??
        "Enter your transport office details. This information will be shown to travelers when they search for trips."
      }
    >
      <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t?.nameLabel ?? "Office Name *"}</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder={t?.namePlaceholder ?? "e.g., Express Transport"}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">{t?.nameArLabel ?? "Office Name (Arabic)"}</Label>
            <Input
              id="nameAr"
              {...register('nameAr')}
              placeholder={t?.nameArPlaceholder ?? "e.g., النقل السريع"}
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t?.phoneLabel ?? "Phone Number *"}</Label>
              <Input
                id="phone"
                type="tel"
                {...register('phone')}
                placeholder={t?.phonePlaceholder ?? "+249 9xxxxxxxx"}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t?.emailLabel ?? "Email Address *"}</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder={t?.emailPlaceholder ?? "office@example.com"}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="licenseNumber">{t?.licenseLabel ?? "License Number (Optional)"}</Label>
            <Input
              id="licenseNumber"
              {...register('licenseNumber')}
              placeholder={t?.licensePlaceholder ?? "Transport license number"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t?.descriptionLabel ?? "Description"}</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder={
                t?.descriptionPlaceholder ??
                "Tell travelers about your services, experience, and what makes your office special..."
              }
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionAr">{t?.descriptionArLabel ?? "Description (Arabic)"}</Label>
            <Textarea
              id="descriptionAr"
              {...register('descriptionAr')}
              placeholder={t?.descriptionArPlaceholder ?? "أخبر المسافرين عن خدماتك..."}
              rows={4}
              dir="rtl"
            />
          </div>
      </div>
    </HostStepLayout>
  );
};

export default OfficeInfoPage;
