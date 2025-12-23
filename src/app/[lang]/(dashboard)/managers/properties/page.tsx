"use client";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

import Card from "@/components/Card";
import Header from "@/components/Header";
import Loading from "@/components/Loading";
import { getAuthUser } from "@/lib/actions/user-actions";
import { getHostListings } from "@/components/host/actions";
import type { Property } from "@prisma/client";
import React, { useEffect, useState } from "react";

const Properties = () => {
  const [authUser, setAuthUser] = useState<any>(null);
  const [managerProperties, setManagerProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Get authenticated user first
        const user = await getAuthUser();
        setAuthUser(user);
        
        // Then get their properties
        if (user?.id) {
          const properties = await getHostListings(user.id);
          setManagerProperties(properties);
        }
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message || "Error loading manager properties");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="dashboard-container">
      <Header
        title="My Properties"
        subtitle="View and manage your property listings"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {managerProperties?.map((property) => (
          <Card
            key={property.id}
            property={property}
            isFavorite={false}
            onFavoriteToggle={() => {}}
            showFavoriteButton={false}
            propertyLink={`/managers/properties/${property.id}`}
          />
        ))}
      </div>
      {(!managerProperties || managerProperties.length === 0) && (
        <p>You don&lsquo;t manage any properties</p>
      )}
    </div>
  );
};

export default Properties;
