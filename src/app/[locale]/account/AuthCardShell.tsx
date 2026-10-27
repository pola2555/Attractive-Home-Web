import type { ReactNode } from 'react';

// Shared frame for the small auth cards (sign in, sign up, forgot/reset
// password, verify). Centralised so every one of them sits in exactly the
// same place. The navbar is fixed over the top of the page, so the card is
// centred in a full-height band with extra top padding: on desktop that drops
// it to the optical middle of the viewport (below the navbar) rather than
// floating high, and on short screens the padding still clears the navbar.
export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-screen items-center justify-center bg-bg px-4 pt-28 pb-16 sm:pt-32 sm:pb-24">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-line bg-surface p-8">
        {children}
      </div>
    </section>
  );
}
