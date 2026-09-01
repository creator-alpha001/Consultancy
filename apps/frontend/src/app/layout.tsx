import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Sankalp', template: '%s · Sankalp' },
  description:
    'Guidance from verified people, against goals agreed in writing, with the money held until those goals are met.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

/**
 * The root layout sets no colour, no vocabulary and no branding. All
 * three belong to a family pack and are applied per-page by AppShell —
 * which is why this file would be identical for a product that had
 * nothing to do with exams.
 */
export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
