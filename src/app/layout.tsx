import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: 'Next.js D1 Drizzle Cloudflare Pages App',
  description: 'Next.js application with D1, Drizzle, and Cloudflare Pages',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Next.js App',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Next.js App',
    title: 'Next.js D1 Drizzle Cloudflare Pages App',
    description: 'Next.js application with D1, Drizzle, and Cloudflare Pages',
  },
  twitter: {
    card: 'summary',
    title: 'Next.js D1 Drizzle Cloudflare Pages App',
    description: 'Next.js application with D1, Drizzle, and Cloudflare Pages',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
