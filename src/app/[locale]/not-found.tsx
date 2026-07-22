import Link from 'next/link';

// Rendered inside the [locale] layout for unmatched routes. Labels stay
// bilingual-simple here because the locale isn't reliably available in
// not-found boundaries.
export default function NotFound() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
      <h1 className="text-6xl font-bold text-heading">404</h1>
      <p className="text-ink-soft">Oops! The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="bg-brand-brown hover:bg-brand-brown-hover text-white px-6 py-2 rounded-lg transition-colors"
      >
        Go Home
      </Link>
    </section>
  );
}
