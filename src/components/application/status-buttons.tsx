"use client";

import { updateApplicationStatus } from "@/lib/actions/application-actions";
import { ApplicationStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface ApplicationStatusButtonsProps {
  applicationId: number;
  currentStatus: ApplicationStatus;
}

export function ApplicationStatusButtons({ 
  applicationId, 
  currentStatus 
}: ApplicationStatusButtonsProps) {
  const dict = useDictionary();
  const t = (dict.application as unknown as { statusButtons?: Record<string, string> })?.statusButtons;
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleStatusChange = async (status: ApplicationStatus) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateApplicationStatus(applicationId, status);
      toast.success(
        status === "Approved"
          ? (t?.approvedSuccess ?? "Application approved successfully!")
          : (t?.deniedSuccess ?? "Application denied successfully!")
      );
      router.refresh();
    } catch (error) {
      console.error("Error updating application status:", error);
      toast.error(t?.updateError ?? "Failed to update application status");
    } finally {
      setIsUpdating(false);
    }
  };

  if (currentStatus === "Pending") {
    return (
      <>
        <button
          className="px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-500 disabled:opacity-50"
          onClick={() => handleStatusChange("Approved")}
          disabled={isUpdating}
        >
          {isUpdating ? (t?.updating ?? "Updating...") : (t?.approve ?? "Approve")}
        </button>
        <button
          className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50"
          onClick={() => handleStatusChange("Denied")}
          disabled={isUpdating}
        >
          {isUpdating ? (t?.updating ?? "Updating...") : (t?.deny ?? "Deny")}
        </button>
      </>
    );
  }

  if (currentStatus === "Denied") {
    return (
      <button
        className={`bg-gray-800 text-white py-2 px-4 rounded-md flex items-center
        justify-center hover:bg-secondary-500 hover:text-primary-50`}
      >
        {t?.contactUser ?? "Contact User"}
      </button>
    );
  }

  return null;
} 