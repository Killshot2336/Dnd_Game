import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voidline',
  description: 'Private couch-coop tabletop for Aden, Edward, and Jamie.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
