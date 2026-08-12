'use client';

import { useFormStatus } from 'react-dom';

export default function ConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
