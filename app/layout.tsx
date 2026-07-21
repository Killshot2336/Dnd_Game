import type { Metadata, Viewport } from 'next';
import AIEchoBridge from '@/components/AIEchoBridge';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voidline',
  description: 'Private couch-coop tabletop for Aden, Edward, and Jamie.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#120c08',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AIEchoBridge />
        {children}
      </body>
    </html>
  );
}
