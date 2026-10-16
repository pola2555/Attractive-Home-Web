import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listQuotes, QUOTE_STATUSES, QUOTE_STATUS_LABELS, trashDaysLeft } from '@/lib/quotesAdmin';
import NewQuoteButton from './NewQuoteButton';
import QuoteRowActions from './QuoteRowActions';

// The quote inbox. Prices here are internal only — `quotes.read` is deliberately
// separate from `catalog.write` so the data-entry role cannot reach cost basis.
export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; trash?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('quotes.read')) redirect('/dashboard');
  const canWrite = permissions.has('quotes.write');

  const { status, q, page, trash: trashParam } = await searchParams;
  const trash = trashParam === '1';
  const {
    rows,
    total,
    pageCount,
    page: current,
  } = await listQuotes({
    status,
    q,
    trash,
    page: Number(page) || 1,
  });

  const filterHref = (next?: string) =>
    next ? `/dashboard/quotes?status=${next}` : '/dashboard/quotes';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">Quotes</h1>
        {canWrite && <NewQuoteButton />}
      </div>

      <form className="mb-4" action="/dashboard/quotes">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search reference, title or lead…"
          className="w-full max-w-sm px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {trash ? (
          <Link
            href="/dashboard/quotes"
            className="px-3 py-1 rounded-full text-sm border border-line text-ink hover:border-accent/60"
          >
            ← Back to inbox
          </Link>
        ) : (
          <>
            <Link
              href={filterHref()}
              className={`px-3 py-1 rounded-full text-sm border ${!status ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
            >
              All
            </Link>
            {QUOTE_STATUSES.map((s) => (
              <Link
                key={s}
                href={filterHref(s)}
                className={`px-3 py-1 rounded-full text-sm border ${status === s ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
              >
                {QUOTE_STATUS_LABELS[s]}
              </Link>
            ))}
          </>
        )}
        <Link
          href="/dashboard/quotes?trash=1"
          className={`px-3 py-1 rounded-full text-sm border ms-auto ${trash ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-muted hover:border-accent/60'}`}
        >
          Trash
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">
          {trash
            ? 'Trash is empty. Deleted quotes appear here and are kept for 30 days.'
            : `No quotes yet. ${canWrite ? 'Create one to start assembling configured products into a cart.' : ''}`}
        </p>
      ) : (
        <>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Reference</th>
                <th className="text-start py-2 pe-4">Title</th>
                <th className="text-start py-2 pe-4">Lead</th>
                <th className="text-start py-2 pe-4">Status</th>
                <th className="text-start py-2 pe-4">Items</th>
                <th className="text-start py-2 pe-4">Assigned</th>
                <th className="text-start py-2 pe-4">{trash ? 'Deleted' : 'Created'}</th>
                {canWrite && <th className="text-end py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => (
                <tr key={quote.id} className="border-b border-line/50 hover:bg-surface/60">
                  <td className="py-2 pe-4 whitespace-nowrap">
                    <Link
                      href={`/dashboard/quotes/${quote.id}`}
                      className="text-accent hover:underline"
                    >
                      {quote.reference}
                    </Link>
                  </td>
                  <td className="py-2 pe-4">{quote.title ?? '—'}</td>
                  <td className="py-2 pe-4">{quote.lead?.name ?? '—'}</td>
                  <td className="py-2 pe-4">
                    {QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS] ??
                      quote.status}
                  </td>
                  <td className="py-2 pe-4">{quote._count.items}</td>
                  <td className="py-2 pe-4">{quote.assignee?.name ?? '—'}</td>
                  <td className="py-2 pe-4 whitespace-nowrap text-muted">
                    {(trash ? quote.deletedAt : quote.createdAt)?.toISOString().slice(0, 10) ?? '—'}
                  </td>
                  {canWrite && (
                    <td className="py-2 text-end">
                      <QuoteRowActions
                        quoteId={quote.id}
                        trash={trash}
                        daysLeft={
                          trash && quote.deletedAt ? trashDaysLeft(quote.deletedAt) : undefined
                        }
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center gap-3 mt-4 text-sm">
              <span className="text-muted">
                {total} quotes · page {current} of {pageCount}
              </span>
              {current > 1 && (
                <Link
                  href={`/dashboard/quotes?page=${current - 1}${status ? `&status=${status}` : ''}`}
                  className="text-accent hover:underline"
                >
                  Previous
                </Link>
              )}
              {current < pageCount && (
                <Link
                  href={`/dashboard/quotes?page=${current + 1}${status ? `&status=${status}` : ''}`}
                  className="text-accent hover:underline"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
