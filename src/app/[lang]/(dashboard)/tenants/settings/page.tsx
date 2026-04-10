"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import SettingsForm from "@/components/SettingsForm";
import {
  useGetAuthUserQuery,
  useUpdateTenantSettingsMutation,
} from "@/state/api";
import { usePathname } from "next/navigation";
import React from "react";

const TenantSettings = () => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const { data: authUser, isLoading } = useGetAuthUserQuery();
  const [updateTenant] = useUpdateTenantSettingsMutation();

  if (isLoading) return <>{isAr ? "جاري التحميل..." : "Loading..."}</>;

  const initialData = {
    name: authUser?.userInfo?.name ?? "",
    email: authUser?.userInfo?.email ?? "",
    phoneNumber: authUser?.userInfo?.phoneNumber ?? "",
  };

  const handleSubmit = async (data: typeof initialData) => {
    if (!authUser?.id) return;
    await updateTenant({
      userId: authUser.id,
      ...data,
    });
  };

  return (
    <SettingsForm
      initialData={initialData}
      onSubmit={handleSubmit}
      userType="tenant"
    />
  );
};

export default TenantSettings;
