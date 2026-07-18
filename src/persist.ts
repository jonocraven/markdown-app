/**
 * Persistence helper: uses @tauri-apps/plugin-store in Tauri mode,
 * falls back to localStorage in browser mode. Async hydration on startup.
 */

import { isTauri } from "./ipc";

type StoreValue = string | number | boolean | object;

interface PersistenceAdapter {
  get(key: string): Promise<StoreValue | null>;
  set(key: string, value: StoreValue): Promise<void>;
}

// Browser adapter using localStorage
const localStorageAdapter: PersistenceAdapter = {
  get: async (key: string) => {
    const v = localStorage.getItem(key);
    return v === null ? null : JSON.parse(v);
  },
  set: async (key: string, value: StoreValue) => {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

// Tauri adapter using LazyStore
let tauriAdapter: PersistenceAdapter | null = null;

async function getTauriAdapter(): Promise<PersistenceAdapter> {
  if (tauriAdapter) return tauriAdapter;

  // Dynamically import only in Tauri context
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore("markdown-reader-settings.json");

  tauriAdapter = {
    get: async (key: string) => {
      try {
        const val = await store.get(key);
        return val ?? null;
      } catch {
        return null;
      }
    },
    set: async (key: string, value: StoreValue) => {
      await store.set(key, value);
      await store.save();
    },
  };

  return tauriAdapter;
}

let adapter: PersistenceAdapter | null = null;

export async function initPersist(): Promise<void> {
  if (isTauri()) {
    adapter = await getTauriAdapter();
  } else {
    adapter = localStorageAdapter;
  }
}

export async function persistGet<T = unknown>(
  key: string,
  fallback: T
): Promise<T> {
  if (!adapter) await initPersist();
  const val = await adapter!.get(key);
  return (val as T) ?? fallback;
}

export async function persistSet<T extends StoreValue>(
  key: string,
  value: T
): Promise<void> {
  if (!adapter) await initPersist();
  await adapter!.set(key, value);
}
