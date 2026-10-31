'use client';

// "Download PDF" without a PDF dependency: the browser's print dialog offers
// "Save as PDF", and the @media print rules in globals.css strip the site chrome.
export default function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide bg-brand-brown hover:bg-brand-brown-hover text-white px-5 py-2 rounded-lg transition-colors text-sm font-semibold"
    >
      {label}
    </button>
  );
}
