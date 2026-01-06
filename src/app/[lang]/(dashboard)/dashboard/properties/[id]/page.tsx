"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import Header from "@/components/Header";
import Loading from "@/components/Loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getListing,
} from "@/components/host/actions";
import { ArrowDownToLine, ArrowLeft, Check, Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

const PropertyManagement = () => {
  const { id } = useParams();
  const propertyId = Number(id);

  const [property, setProperty] = useState<any>(null);
  const [leases, setLeases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Try to fetch property data with fallback
        let propertyData;
        let leasesData: unknown[] = [];
        
        try {
          propertyData = await getListing(propertyId);
        } catch (propError) {
          console.error("Property fetch error:", propError);
          // Create mock property data for testing
          propertyData = {
            id: propertyId,
            name: `Property #${propertyId}`,
            description: "Property details not available",
            location: { address: "Address not available", city: "Unknown", state: "Unknown" }
          };
        }
        
        try {
          // TODO: Implement lease fetching for listings
    // leasesData = await getPropertyLeases(propertyId);
        } catch (leaseError) {
          console.error("Leases fetch error:", leaseError);
          leasesData = []; // Empty array as fallback
        }
        
        setProperty(propertyData);
        setLeases(leasesData);
        
        // TODO: Implement payment fetching when lease system is ready
        // if (leasesData.length > 0) {
        //   try {
        //     const allPayments = await Promise.all(
        //       leasesData.map(async (lease: any) => {
        //         try {
        //           return await getPayments(lease.id);
        //         } catch (paymentError) {
        //           console.error(`Payment fetch error for lease ${lease.id}:`, paymentError);
        //           return [];
        //         }
        //       })
        //     );
        //     setPayments(allPayments.flat());
        //   } catch (paymentError) {
        //     console.error("Payments fetch error:", paymentError);
        //     setPayments([]);
        //   }
        // }
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message || "Error loading property details");
      } finally {
        setIsLoading(false);
      }
    };

    if (propertyId && !isNaN(propertyId)) {
      fetchData();
    } else {
      setError("Invalid property ID");
      setIsLoading(false);
    }
  }, [propertyId]);

  if (isLoading) return <Loading />;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  const getCurrentMonthPaymentStatus = (leaseId: number) => {
    const currentDate = new Date();
    const currentMonthPayment = payments?.find(
      (payment) =>
        payment.leaseId === leaseId &&
        new Date(payment.dueDate).getMonth() === currentDate.getMonth() &&
        new Date(payment.dueDate).getFullYear() === currentDate.getFullYear()
    );
    return currentMonthPayment?.paymentStatus || "Not Paid";
  };

  return (
    <div className="dashboard-container">
      {/* Back to properties page */}
      <Link
        href="/dashboard/properties"
        className="flex items-center mb-4 hover:text-primary-500"
        scroll={false}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        <span>Back to Properties</span>
      </Link>

      <Header
        title={property?.name || "Property Management"}
        subtitle="Manage tenants and leases for this property"
      />

      <div className="w-full space-y-6">
        <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Tenants Overview</h2>
              <p className="text-sm text-gray-500">
                Manage and view all tenants for this property.
              </p>
            </div>
            <div>
              <button
                className={`bg-white border border-gray-300 text-gray-700 py-2
              px-4 rounded-md flex items-center justify-center hover:bg-primary-700 hover:text-primary-50`}
              >
                <Download className="w-5 h-5 mr-2" />
                <span>Download All</span>
              </button>
            </div>
          </div>
          <hr className="mt-4 mb-1" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Lease Period</TableHead>
                  <TableHead>Monthly Rent</TableHead>
                  <TableHead>Current Month Status</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases?.map((lease) => (
                  <TableRow key={lease.id} className="h-24">
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Image
                          src="/landing-i1.png"
                          alt={lease.tenant?.name || lease.tenantId}
                          width={40}
                          height={40}
                          className="rounded-full"
                        />
                        <div>
                          <div className="font-semibold">
                            {lease.tenant?.name || lease.tenantId}
                          </div>
                          <div className="text-sm text-gray-500">
                            {lease.tenant?.email || "Email not available"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {new Date(lease.startDate).toLocaleDateString()} -
                      </div>
                      <div>{new Date(lease.endDate).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>${lease.rent.toFixed(2)}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          getCurrentMonthPaymentStatus(lease.id) === "Paid"
                            ? "bg-green-100 text-green-800 border-green-300"
                            : "bg-red-100 text-red-800 border-red-300"
                        }`}
                      >
                        {getCurrentMonthPaymentStatus(lease.id) === "Paid" && (
                          <Check className="w-4 h-4 inline-block mr-1" />
                        )}
                        {getCurrentMonthPaymentStatus(lease.id)}
                      </span>
                    </TableCell>
                    <TableCell>{lease.tenant?.phoneNumber || "N/A"}</TableCell>
                    <TableCell>
                      <button
                        className={`border border-gray-300 text-gray-700 py-2 px-4 rounded-md flex 
                      items-center justify-center font-semibold hover:bg-primary-700 hover:text-primary-50`}
                      >
                        <ArrowDownToLine className="w-4 h-4 mr-1" />
                        Download Agreement
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {(!leases || leases.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              <p>No leases found for this property.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyManagement; 