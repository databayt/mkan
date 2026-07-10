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
import { useTransportOffice } from '@/context/travel-office-context';
import HostStepLayout from '@/components/host/host-step-layout';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

const OfficeInfoPage = () => {
  const router = useRouter();
  const params = useParams();
  const idStr = params.id as string;
  const lang = (params.lang as string) ?? 'en';

  const { enableNext, disableNext, setCustomNavigation } = useTransportHostValidation();
  const { office, updateOfficeData, createNewOffice, isLoading } = useTransportOffice();
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
        bankName: z.string().optional(),
        bankAccount: z.string().optional(),
        bankHolder: z.string().optional(),
        momoNumber: z.string().optional(),
        momoProvider: z.string().optional(),
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
      bankName: '',
      bankAccount: '',
      bankHolder: '',
      momoNumber: '',
      momoProvider: '',
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
        bankName: office.bankName || '',
        bankAccount: office.bankAccount || '',
        bankHolder: office.bankHolder || '',
        momoNumber: office.momoNumber || '',
        momoProvider: office.momoProvider || '',
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
          bankName: watchedValues.bankName || '',
          bankAccount: watchedValues.bankAccount || '',
          bankHolder: watchedValues.bankHolder || '',
          momoNumber: watchedValues.momoNumber || '',
          momoProvider: watchedValues.momoProvider || '',
        });
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [watchedValues, office, isValid, updateOfficeData]);

  useEffect(() => {
    if (idStr === 'new') {
      setCustomNavigation({
        onNext: async () => {
          try {
            const formValues = watch();
            const newId = await createNewOffice({
              name: formValues.name,
              nameAr: formValues.nameAr || null,
              phone: formValues.phone,
              email: formValues.email,
              description: formValues.description || null,
              descriptionAr: formValues.descriptionAr || null,
              licenseNumber: formValues.licenseNumber || null,
            });
            if (newId) {
              const { updateTransportOffice } = await import('@/lib/actions/travel-actions');
              await updateTransportOffice(newId, {
                bankName: formValues.bankName || '',
                bankAccount: formValues.bankAccount || '',
                bankHolder: formValues.bankHolder || '',
                momoNumber: formValues.momoNumber || '',
                momoProvider: formValues.momoProvider || '',
              });
              router.push(`/${lang}/travel-host/${newId}/assembly-point`);
            } else {
              toast.error('Failed to create office');
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create office');
          }
        }
      });
    } else {
      setCustomNavigation(undefined);
    }
    return () => setCustomNavigation(undefined);
  }, [idStr, setCustomNavigation, createNewOffice, watch, router, lang]);

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

          {/* Payment instructions surfaced on the booking checkout. Leaving a
              section blank hides that payment rail for this office. */}
          <div className="space-y-4 border-t pt-6">
            <div>
              <h4 className="font-medium">{t?.paymentTitle ?? "Payment details"}</h4>
              <p className="text-sm text-muted-foreground">
                {t?.paymentSubtitle ??
                  "Travelers paying by bank transfer or mobile money send to these accounts. Leave blank to hide a method."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">{t?.bankNameLabel ?? "Bank name"}</Label>
                <Input id="bankName" {...register('bankName')} placeholder={t?.bankNamePlaceholder ?? "e.g., Bank of Khartoum"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount">{t?.bankAccountLabel ?? "Account number"}</Label>
                <Input id="bankAccount" {...register('bankAccount')} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankHolder">{t?.bankHolderLabel ?? "Account holder name"}</Label>
              <Input id="bankHolder" {...register('bankHolder')} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="momoProvider">{t?.momoProviderLabel ?? "Mobile money provider"}</Label>
                <Input id="momoProvider" {...register('momoProvider')} placeholder={t?.momoProviderPlaceholder ?? "e.g., Bankak, MTN MoMo"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="momoNumber">{t?.momoNumberLabel ?? "Wallet number"}</Label>
                <Input id="momoNumber" {...register('momoNumber')} dir="ltr" />
              </div>
            </div>
          </div>
      </div>
    </HostStepLayout>
  );
};

export default OfficeInfoPage;
