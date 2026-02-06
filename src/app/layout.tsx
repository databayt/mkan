import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mkan - Rental Marketplace',
  description: 'Connect with property managers and find your perfect rental home',
  icons: {
    icon: '/favicon.ico',
  },
};

// Root layout required by Next.js App Router
// The [lang] layout will override html/body for localized pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
