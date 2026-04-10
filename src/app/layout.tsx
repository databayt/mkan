import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
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
