'use client';

import { useCallback, useSyncExternalStore, type ReactNode } from 'react';

// The dashboard chrome: a collapsible left sidebar + the page content. Collapsing
// hands the width back to the page — the tree canvas especially wants the room.
// The choice is remembered per browser (localStorage) and read through
// useSyncExternalStore, so it stays hydration-safe (server renders expanded, the
// client switches after mount) without a setState-in-effect.
const KEY = 'ah-dash-collapsed';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}
function getSnapshot() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode / blocked storage */
  }
  listeners.forEach((l) => l());
}

export default function DashboardShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );
  const toggle = useCallback(() => setCollapsed(!getSnapshot()), []);

  return (
    <div className="min-h-screen flex">
      <aside
        className={`${collapsed ? 'w-12' : 'w-56'} shrink-0 bg-bg-deep border-e border-line flex flex-col transition-[width] duration-200`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-end'} p-2`}>
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-line-strong text-muted hover:text-ink hover:border-accent text-sm"
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        {!collapsed && (
          <div className="px-6 pb-6 flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto">{sidebar}</div>
        )}
      </aside>
      <main className="flex-1 min-w-0 p-8 overflow-x-auto">{children}</main>
    </div>
  );
}
