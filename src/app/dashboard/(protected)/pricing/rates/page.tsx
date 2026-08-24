import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getLandedSettings } from '@/lib/landed/settings';
import RateForms from './RateForms';
import { deleteFreightRate } from '../actions';

// The offline rate cards. They make landed cost computable today AND define the
// contract a freight/customs API adapter will satisfy — see
// src/lib/landed/providers/README.md.
export default async function RatesPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const [hsCodes, freight, storage, settings] = await Promise.all([
    prisma.hsCode.findMany({ orderBy: { code: 'asc' } }),
    prisma.freightRate.findMany({ orderBy: [{ mode: 'asc' }, { originPort: 'asc' }] }),
    prisma.portStorageRate.findMany({ orderBy: [{ port: 'asc' }] }),
    getLandedSettings(),
  ]);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <Link href="/dashboard/pricing" className="text-sm text-accent hover:underline">
          ← Pricing
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">Rate cards</h1>
        <p className="text-muted text-sm mt-1">
          China to UAE. Providers in use: freight <code>{settings.freightProvider}</code>, customs{' '}
          <code>{settings.customsProvider}</code>, storage <code>{settings.storageProvider}</code>.
          Import VAT is treated as{' '}
          {settings.vatRecoverable ? 'recoverable (reverse-charged)' : 'a real cost'}.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">HS codes</h2>
        <p className="text-muted text-sm mb-3">
          Duty is charged on CIF per HS code per item, and VAT on CIF plus duty. A mixed container
          carries several rates, which is why this is a table rather than a constant.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Description</th>
              <th className="text-end py-2 pe-4">Duty %</th>
              <th className="text-end py-2 pe-4">VAT %</th>
              <th className="text-start py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {hsCodes.map((hs) => (
              <tr key={hs.id} className="border-b border-line/50">
                <td className="py-2 pe-4">{hs.code}</td>
                <td className="py-2 pe-4 text-muted">{hs.description}</td>
                <td className="py-2 pe-4 text-end" dir="ltr">
                  {hs.dutyPercent.toString()}
                </td>
                <td className="py-2 pe-4 text-end" dir="ltr">
                  {hs.vatPercent.toString()}
                </td>
                <td className="py-2 text-muted">{hs.isActive ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Freight rates</h2>
        <p className="text-muted text-sm mb-3">
          The three modes bill in three different units and are never blended: LCL per revenue ton,
          FCL per container, air per chargeable kilo. The volumetric divisor is a carrier contract
          parameter, not a constant — IATA general cargo is 6000, express carriers use 5000.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Mode</th>
                <th className="text-start py-2 pe-4">Lane</th>
                <th className="text-start py-2 pe-4">Box</th>
                <th className="text-start py-2 pe-4">Unit</th>
                <th className="text-end py-2 pe-4">Low</th>
                <th className="text-end py-2 pe-4">Rate</th>
                <th className="text-end py-2 pe-4">High</th>
                <th className="text-end py-2 pe-4">Min</th>
                <th className="text-end py-2 pe-4">Divisor</th>
                <th className="text-end py-2 pe-4">Packing</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {freight.map((rate) => (
                <tr key={rate.id} className="border-b border-line/50">
                  <td className="py-2 pe-4">{rate.mode}</td>
                  <td className="py-2 pe-4 text-muted whitespace-nowrap">
                    {rate.originPort} → {rate.destinationPort}
                  </td>
                  <td className="py-2 pe-4 text-muted">{rate.containerType ?? '—'}</td>
                  <td className="py-2 pe-4 text-muted">{rate.unit}</td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {rate.rateLow?.toString() ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end whitespace-nowrap" dir="ltr">
                    {rate.currency} {rate.rate.toString()}
                  </td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {rate.rateHigh?.toString() ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {rate.minCharge?.toString() ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {rate.volumetricDivisor ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {rate.packagingFactor.toString()}
                  </td>
                  <td className="py-2 text-end">
                    <form action={deleteFreightRate}>
                      <input type="hidden" name="id" value={rate.id} />
                      <button className="text-xs text-red-300 hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Port storage</h2>
        <p className="text-muted text-sm mb-3">
          Only accrues past the free days, and is usually zero. Free days plus a flat per-day rate
          until the client supplies a real terminal tariff.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Port</th>
              <th className="text-start py-2 pe-4">Box</th>
              <th className="text-end py-2 pe-4">Free days</th>
              <th className="text-end py-2 pe-4">Per day</th>
              <th className="text-start py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {storage.map((rate) => (
              <tr key={rate.id} className="border-b border-line/50">
                <td className="py-2 pe-4">{rate.port}</td>
                <td className="py-2 pe-4 text-muted">{rate.containerType ?? 'any / LCL'}</td>
                <td className="py-2 pe-4 text-end" dir="ltr">
                  {rate.freeDays}
                </td>
                <td className="py-2 pe-4 text-end whitespace-nowrap" dir="ltr">
                  {rate.currency} {rate.perDayRate.toString()}
                </td>
                <td className="py-2 text-muted">{rate.isActive ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RateForms />
    </div>
  );
}
