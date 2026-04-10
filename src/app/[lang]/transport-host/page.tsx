import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import TransportHostContent from "./content";

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "مضيف النقل" : "Transport Host",
    description:
      lang === "ar"
        ? "إدارة مكاتب النقل والحجوزات"
        : "Manage your transport offices and bookings",
    locale: lang,
    path: "/transport-host",
  });
}

export default function TransportHostPage() {
  return <TransportHostContent />;
}
