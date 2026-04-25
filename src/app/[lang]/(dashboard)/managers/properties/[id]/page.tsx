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
import { getListing } from "@/components/host/actions";
import { getListingLeases } from "@/lib/actions/user-actions";
import { getLeasePayments } from "@/lib/actions/payment-actions";
import { ArrowDownToLine, ArrowLeft, Check, Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const PropertyTenants = () => {
  const { id } = useParams();
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const dict = useDictionary();
  const propertyId = Number(id);

  const [property, setProperty] = useState<any>(null);
  const [leases, setLeases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const propertyData = await getListing(propertyId);
        setProperty(propertyData);

        // Pull every lease for this listing then fan out to fetch each
        // lease's payments. The host/manager-only authorization is enforced
        // server-side; this page just renders what comes back.
        const leasesData = await getListingLeases(propertyId);
        setLeases(leasesData);

        if (leasesData.length > 0) {
          const allPayments = await Promise.all(
            leasesData.map((lease) => getLeasePayments(lease.id)),
          );
          setPayments(allPayments.flat());
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [propertyId]);

  if (isLoading) return <Loading />;

  const getCurrentMonthPaymentStatus = (leaseId: number) => {
    const currentDate = new Date();
    const currentMonthPayment = payments?.find(
      (payment) =>
        payment.leaseId === leaseId &&
        new Date(payment.dueDate).getMonth() === currentDate.getMonth() &&
        new Date(payment.dueDate).getFullYear() === currentDate.getFullYear()
    );
    return currentMonthPayment?.paymentStatus || dict.dashboard.common.notPaid;
  };

  return (
    <div className="dashboard-container">
      {/* Back to properties page */}
      <Link
        href={isAr ? "/ar/managers/properties" : "/en/managers/properties"}
        className="flex items-center mb-4 hover:text-primary-500"
        scroll={false}
      >
        <ArrowLeft className="w-4 h-4 me-2 rtl:rotate-180" />
        <span>{dict.dashboard.common.backToProperties}</span>
      </Link>

      <Header
        title={property?.name || dict.dashboard.propertyManagement.myProperty}
        subtitle={dict.dashboard.propertyManagement.subtitle}
      />

      <div className="w-full space-y-6">
        <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">{dict.dashboard.propertyManagement.tenantsOverview}</h2>
              <p className="text-sm text-gray-500">
                {dict.dashboard.propertyManagement.tenantsOverviewSubtitle}
              </p>
            </div>
            <div>
              <button
                className={`bg-white border border-gray-300 text-gray-700 py-2
              px-4 rounded-md flex items-center justify-center hover:bg-primary-700 hover:text-primary-50`}
              >
                <Download className="w-5 h-5 me-2" />
                <span>{dict.dashboard.common.downloadAll}</span>
              </button>
            </div>
          </div>
          <hr className="mt-4 mb-1" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dict.dashboard.propertyManagement.tenant}</TableHead>
                  <TableHead>{dict.dashboard.propertyManagement.leasePeriod}</TableHead>
                  <TableHead>{dict.dashboard.propertyManagement.monthlyRent}</TableHead>
                  <TableHead>{dict.dashboard.propertyManagement.currentMonthStatus}</TableHead>
                  <TableHead>{dict.dashboard.propertyManagement.contact}</TableHead>
                  <TableHead>{dict.dashboard.propertyManagement.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases?.map((lease) => (
                  <TableRow key={lease.id} className="h-24">
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Image
                          src="/landing-i1.png"
                          alt={lease.tenant?.name || lease.tenantCognitoId}
                          width={40}
                          height={40}
                          className="rounded-full"
                        />
                        <div>
                          <div className="font-semibold">
                            {lease.tenant?.name || lease.tenantCognitoId}
                          </div>
                          <div className="text-sm text-gray-500">
                            {lease.tenant?.email || dict.dashboard.common.emailNotAvailable}
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
                          <Check className="w-4 h-4 inline-block me-1" />
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
                        <ArrowDownToLine className="w-4 h-4 me-1" />
                        {dict.dashboard.common.downloadAgreement}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyTenants;
