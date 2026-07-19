import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voidline VTT',
  description: 'Uncensored multi-user AI tabletop framework for Aden, Edward, and Jamie.',
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
