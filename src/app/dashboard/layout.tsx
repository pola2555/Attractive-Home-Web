import type { Metadata } from 'next';
import '../globals.css';

// The dashboard is its own root layout (English-only admin tool, outside the
// [locale] tree) and is never indexed.
export const metadata: Metadata = {
  title: { default: 'Dashboard | Attractive Home', template: '%s | Dashboard' },
  robots: { index: false, follow: false },
};

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased min-h-screen bg-bg text-ink">{children}</body>
    </html>
  );
}
