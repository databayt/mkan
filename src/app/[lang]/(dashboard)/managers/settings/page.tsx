"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import SettingsForm from "@/components/SettingsForm";
import { getAuthUser, updateManagerSettings } from "@/lib/actions/user-actions";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const ManagerSettings = () => {
  const pathname = usePathname();
  const dict = useDictionary();
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

  if (isLoading) return <>{dict.dashboard.common.loading}</>;
  if (error) return <div className="text-red-500">{dict.dashboard.common.error}: {error}</div>;

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
