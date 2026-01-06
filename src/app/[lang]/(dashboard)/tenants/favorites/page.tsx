"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import Header from "@/components/Header";
import React from "react";

const Favorites = () => {
  // TODO: Implement favorites system with proper tenant-listing relationship
  return (
    <div className="dashboard-container">
      <Header
        title="Favorited Properties"
        subtitle="Browse and manage your saved property listings"
      />
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          You don&apos;t have any favorited properties yet.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Browse listings and click the heart icon to save your favorites.
        </p>
      </div>
    </div>
  );
};

export default Favorites;
