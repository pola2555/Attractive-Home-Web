'use client';

// Confirm-guarded delete. Takes a bound server action (e.g. deleteProduct.bind(null, id))
// so the client never sees an id it could tamper with beyond what the action allows.
export default function DeleteButton({
  action,
  confirmText,
  label = 'Delete',
  className,
}: {
  action: () => void;
  confirmText: string;
  label?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button
        className={
          className ??
          'px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm'
        }
      >
        {label}
      </button>
    </form>
  );
}
