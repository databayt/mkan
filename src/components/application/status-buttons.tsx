"use client";

import { updateApplicationStatus } from "@/lib/actions/application-actions";
import { ApplicationStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface ApplicationStatusButtonsProps {
  applicationId: number;
  currentStatus: ApplicationStatus;
}

export function ApplicationStatusButtons({ 
  applicationId, 
  currentStatus 
}: ApplicationStatusButtonsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleStatusChange = async (status: ApplicationStatus) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateApplicationStatus(applicationId, status);
      toast.success(`Application ${status.toLowerCase()} successfully!`);
      router.refresh();
    } catch (error) {
      console.error("Error updating application status:", error);
      toast.error("Failed to update application status");
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
          {isUpdating ? "Updating..." : "Approve"}
        </button>
        <button
          className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50"
          onClick={() => handleStatusChange("Denied")}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating..." : "Deny"}
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
        Contact User
      </button>
    );
  }

  return null;
} 