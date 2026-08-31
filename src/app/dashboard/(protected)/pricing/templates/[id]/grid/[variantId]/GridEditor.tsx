'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveGridCells, type FormState } from '../../../../actions';

// Step 4 of the editor walkthrough: the screen that mirrors the supplier's own
// table, so the numbers can be typed straight off it.
//
// A BLANK BOX MEANS NOT SOLD. That is the dash in the price list, and it is a
// different fact from a cell nobody has reached yet — the counter below keeps
// the two apart, because one is the supplier's answer and the other is a hole
// in our data.

const cellCls =
  'w-24 px-2 py-1.5 bg-surface text-ink rounded border border-line-strong text-sm text-end tabular-nums focus:outline-none focus:ring-2 focus:ring-accent';

export type GridAxis = {
  groupCode: string;
  name: string;
  values: { code: string; name: string }[];
};

export default function GridEditor({
  templateId,
  variantId,
  axes,
  initialCells,
  currency,
}: {
  templateId: string;
  variantId: string;
  axes: GridAxis[];
  /** Key -> stored value. `null` means the editor marked it not sold. */
  initialCells: Record<string, number | null>;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveGridCells, {});

  // "Paste the supplier's table straight in" (walkthrough §5.1). The editor is
  // looking at exactly the spreadsheet the grid below mirrors, so let them copy
  // the numeric block and drop it in rather than retyping. Position-based: the
  // paste maps onto the SAME rows and columns rendered here, top-left first.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');

  // The last axis becomes columns; everything before it becomes rows. That is
  // how the supplier laid the sheet out, and matching it means the editor can
  // read across rather than translate.
  const columnAxis = axes[axes.length - 1];
  const rowAxes = axes.slice(0, -1);

  const rows = useMemo(() => {
    let combos: Record<string, string>[] = [{}];
    for (const axis of rowAxes) {
      const next: Record<string, string>[] = [];
      for (const combo of combos) {
        for (const value of axis.values) next.push({ ...combo, [axis.groupCode]: value.code });
      }
      combos = next;
    }
    return combos;
  }, [rowAxes]);

  const [cells, setCells] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(initialCells)) {
      out[key] = value === null ? '' : String(value);
    }
    return out;
  });

  function keyFor(rowCombo: Record<string, string>, columnCode: string): string {
    return axes
      .map((axis) =>
        axis.groupCode === columnAxis.groupCode ? columnCode : rowCombo[axis.groupCode],
      )
      .join('|');
  }

  const allKeys = rows.flatMap((row) => columnAxis.values.map((c) => keyFor(row, c.code)));
  const priced = allKeys.filter((k) => (cells[k] ?? '').trim() !== '').length;
  const touched = allKeys.filter((k) => Object.hasOwn(cells, k)).length;
  const notEntered = allKeys.length - touched;

  // Map a pasted spreadsheet block onto the grid by position: line -> row,
  // tab-separated cell -> column, in the exact order shown above. A dash or an
  // empty cell is the supplier's "not sold", so it saves as touched-but-blank
  // (not left "not entered"). Numbers keep only their digits and point, so a
  // "$1,050.00" pasted from a styled sheet still lands as 1050.00. Nothing is
  // persisted until Save grid, so a wrong paste is just re-pasted or edited.
  function applyPaste() {
    const matrix = pasteText
      .replace(/\r/g, '')
      .replace(/\n+$/, '')
      .split('\n')
      .map((line) => line.split('\t'));
    const updates: Record<string, string> = {};
    rows.forEach((row, r) => {
      const cols = matrix[r];
      if (!cols) return;
      columnAxis.values.forEach((column, c) => {
        if (c >= cols.length) return;
        const raw = (cols[c] ?? '').trim();
        const key = keyFor(row, column.code);
        if (raw === '' || raw === '—' || raw === '–' || raw === '-') updates[key] = '';
        else updates[key] = raw.replace(/[^0-9.]/g, '');
      });
    });
    const count = Object.keys(updates).length;
    if (count === 0) {
      setPasteMsg('Nothing recognised — copy just the numeric block (rows and columns) from the sheet.');
      return;
    }
    setCells((prev) => ({ ...prev, ...updates }));
    setPasteMsg(`Filled ${count} cell${count === 1 ? '' : 's'}. Check them against the sheet, then Save grid.`);
    setPasteText('');
    setPasteOpen(false);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="variantId" value={variantId} />
      {/* Every cell in one post: eighteen requests would be silly, and a
          half-saved grid after a closed tab would be worse. */}
      <input
        type="hidden"
        name="cellsJson"
        value={JSON.stringify(Object.fromEntries(allKeys.map((k) => [k, cells[k] ?? ''])))}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-lg border border-line-strong text-ink hover:border-accent/60"
        >
          {pasteOpen ? 'Close paste' : '⧉ Paste from Excel'}
        </button>
        {pasteMsg && <span className="text-xs text-accent">{pasteMsg}</span>}
      </div>

      {pasteOpen && (
        <div className="border border-line rounded-lg p-3 bg-surface/40 space-y-2">
          <p className="text-xs text-muted">
            Copy the numeric block from the supplier&rsquo;s sheet — the same rows and columns shown
            below, top-left first — and paste it here. A blank cell or a dash means &ldquo;not
            sold&rdquo;.
          </p>
          <textarea
            className="w-full h-28 px-3 py-2 bg-surface text-ink rounded border border-line-strong text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'65\t—\t—\n80\t80\t80'}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyPaste}
              className="px-3 py-1.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink text-sm"
            >
              Fill grid
            </button>
            <button
              type="button"
              onClick={() => {
                setPasteText('');
                setPasteMsg('');
                setPasteOpen(false);
              }}
              className="px-3 py-1.5 rounded-lg text-muted hover:text-ink text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong">
              {rowAxes.map((axis) => (
                <th key={axis.groupCode} className="text-start px-3 py-2 text-muted font-medium">
                  {axis.name}
                </th>
              ))}
              {columnAxis.values.map((value) => (
                <th key={value.code} className="text-end px-3 py-2 text-muted font-medium">
                  {value.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-line last:border-0">
                {rowAxes.map((axis) => (
                  <td key={axis.groupCode} className="px-3 py-1.5 text-ink whitespace-nowrap">
                    {axis.values.find((v) => v.code === row[axis.groupCode])?.name ??
                      row[axis.groupCode]}
                  </td>
                ))}
                {columnAxis.values.map((column) => {
                  const key = keyFor(row, column.code);
                  const value = cells[key] ?? '';
                  const notSold = Object.hasOwn(cells, key) && value.trim() === '';
                  return (
                    <td key={column.code} className="px-3 py-1.5 text-end">
                      <input
                        aria-label={`${Object.values(row).join(' ')} ${column.name}`}
                        className={`${cellCls} ${notSold ? 'opacity-50' : ''}`}
                        inputMode="decimal"
                        placeholder="—"
                        value={value}
                        onChange={(e) => setCells((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span>
          {allKeys.length} cells &middot; {priced} priced &middot; {touched - priced} not sold
          {notEntered > 0 && <> &middot; {notEntered} not entered</>}
        </span>
        <span className="text-accent">{currency}</span>
        {notEntered > 0 && (
          <span className="text-amber-300">
            A blank box saves as &ldquo;not sold&rdquo;. Cells never touched stay unfilled and the
            sales screen will say so rather than guessing.
          </span>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Grid saved.</p>}

      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save grid'}
      </button>
    </form>
  );
}
