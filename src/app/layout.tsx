import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/metadata';
import './globals.css';

export const metadata: Metadata = {
  // Resolves every relative metadata URL (OG images, alternates) against the
  // canonical origin instead of the per-deployment *.vercel.app host.
  metadataBase: new URL(SITE_URL),
  title: 'Mkan - Rental Marketplace',
  description: 'Connect with property managers and find your perfect rental home',
  icons: {
    icon: '/favicon.ico',
  },
};

// Root layout - just a wrapper, actual html/body defined in [lang]/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
