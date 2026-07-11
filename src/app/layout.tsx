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
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
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
