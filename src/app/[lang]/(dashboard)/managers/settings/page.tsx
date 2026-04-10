"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import SettingsForm from "@/components/SettingsForm";
import { getAuthUser, updateManagerSettings } from "@/lib/actions/user-actions";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";

const ManagerSettings = () => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const [authUser, setAuthUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getAuthUser();
        setAuthUser(user);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) return <>{isAr ? "جاري التحميل..." : "Loading..."}</>;
  if (error) return <div className="text-red-500">{isAr ? "خطأ" : "Error"}: {error}</div>;

  const initialData = {
    name: authUser?.userInfo?.name,
    email: authUser?.userInfo?.email,
    phoneNumber: authUser?.userInfo?.phoneNumber,
  };

  const handleSubmit = async (data: typeof initialData) => {
    if (!authUser?.id) return;
    
    try {
      await updateManagerSettings(authUser.id, {
        username: data.name,
        email: data.email,
      });
      // Optionally show success message
    } catch (error) {
      console.error("Failed to update settings:", error);
      // Optionally show error message
    }
  };

  return (
    <SettingsForm
      initialData={initialData}
      onSubmit={handleSubmit}
      userType="manager"
    />
  );
};

export default ManagerSettings;
