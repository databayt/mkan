"use client";

import Navbar from "@/components/template/header-airbnb/header";
import SiteFooter from "@/components/template/footer-airbnb/site-footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import Sidebar from "@/components/AppSidebar";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

type UserType = "manager" | "tenant" | "office";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);

  // Determine user type from pathname
  const getUserTypeFromPath = (): UserType => {
    if (pathname.includes('/offices')) return 'office';
    if (pathname.includes('/managers')) return 'manager';
    return 'tenant';
  };

  useEffect(() => {
    if (status !== "loading") {
      if (session?.user) {
        const userRole = session.user.role?.toLowerCase();

        // Redirect users to appropriate dashboard sections based on role
        // Allow office routes for any authenticated user
        if (pathname.includes('/offices')) {
          setIsLoading(false);
        } else if (
          (userRole === "manager" && pathname.startsWith("/tenants")) ||
          (userRole === "tenant" && pathname.startsWith("/managers"))
        ) {
          router.push(
            userRole === "manager"
              ? "/managers/properties"
              : "/tenants/favorites",
            { scroll: false }
          );
        } else {
          setIsLoading(false);
        }
      } else {
        // No session, redirect to login
        router.push("/login");
      }
    }
  }, [session, status, router, pathname]);

  if (status === "loading" || isLoading) return <>Loading...</>;
  if (!session?.user) return null;

  const userType = getUserTypeFromPath();

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-primary-100">
        <Navbar />
        <div style={{ marginTop: `${NAVBAR_HEIGHT}px` }}>
          <main className="flex">
            <Sidebar userType={userType} />
            <div className="flex-grow transition-all duration-300">
              {children}
            </div>
          </main>
        </div>
        <SiteFooter />
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
