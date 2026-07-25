'use client';

// Client-side store for the Save (♥) / Compare (⇄) shortlists, backed by
// localStorage — matches the old site's `ahc_short` / `ahc_cmp`. Shared by
// CardActions (per-card toggles) and ShortlistBar (the tray + panels).
// Phase 5 (customer accounts) migrates these into server favorites on login.
import { useSyncExternalStore } from 'react';

export const SAVE_KEY = 'ahc_short';
export const COMPARE_KEY = 'ahc_cmp';
export const COMPARE_MAX = 6;
const STORE_EVENT = 'ahc-store';

const EMPTY: string[] = [];
const setCache = new Map<string, Set<string>>();
const arrCache = new Map<string, string[]>();

function readSet(key: string): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function getSet(key: string): Set<string> {
  let set = setCache.get(key);
  if (!set) {
    set = readSet(key);
    setCache.set(key, set);
  }
  return set;
}

// Cached array snapshot so useSyncExternalStore gets a stable reference.
function getArr(key: string): string[] {
  let arr = arrCache.get(key);
  if (!arr) {
    arr = [...getSet(key)];
    arrCache.set(key, arr);
  }
  return arr;
}

function commit(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
  setCache.delete(key);
  arrCache.delete(key);
  window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(STORE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(STORE_EVENT, callback);
  };
}

export function toggle(key: string, id: string, max?: number): void {
  const set = getSet(key);
  if (set.has(id)) set.delete(id);
  else {
    if (max && set.size >= max) return;
    set.add(id);
  }
  commit(key, set);
}

export function removeId(key: string, id: string): void {
  const set = getSet(key);
  if (set.delete(id)) commit(key, set);
}

export function clearKey(key: string): void {
  commit(key, new Set());
}

export function useMember(key: string, id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSet(key).has(id),
    () => false,
  );
}

export function useIds(key: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getArr(key),
    () => EMPTY,
  );
}
