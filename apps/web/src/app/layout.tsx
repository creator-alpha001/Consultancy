import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sankalp',
  description: 'Guidance from verified experts, with a written agenda and money held in escrow.',
};

/**
 * The root layout is deliberately almost empty: it sets no colours, no
 * vocabulary and no branding, because those belong to a family pack and
 * are applied per-page from the resolved domain (see `PackShell`).
 */
export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
