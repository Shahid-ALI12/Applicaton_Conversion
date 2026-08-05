import { create } from "zustand";
import type { CartItem, MixIngredient } from "@/types";
import { pktToday } from "@/lib/pkt-date";
import { api } from "@/lib/api";

// ─── Shared API error helper ───
// Backend returns errors in TWO possible shapes:
//   1) { error: "string message" }              (older / Next.js-style routes)
//   2) { error: { code, message, fields? } }    (Applicaton_Conversion Express backend)
// Also accept { detail: "..." } and { message: "..." } for robustness.
// Always returns a STRING — never an object — so `throw new Error(await apiError(...))`
// never produces "[object Object]".
export async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const json: any = await res.json();
    return extractApiError(json, fallback);
  } catch {
    return fallback;
  }
}

// Synchronous variant: extract a human-readable error message from an
// already-parsed JSON body. Use this when the caller has already consumed
// `res.json()` and holds the raw object.
export function extractApiError(obj: any, fallback: string): string {
  if (!obj) return fallback;
  // Shape 2: { error: { message } }
  if (obj.error && typeof obj.error === 'object') {
    if (typeof obj.error.message === 'string' && obj.error.message) return obj.error.message;
  }
  // Shape 1: { error: "string" }
  if (typeof obj.error === 'string' && obj.error) return obj.error;
  // { detail: "..." }
  if (typeof obj.detail === 'string' && obj.detail) return obj.detail;
  // { message: "..." }
  if (typeof obj.message === 'string' && obj.message) return obj.message;
  return fallback;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (index) => set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  clearCart: () => set({ items: [] }),
  getTotal: () => get().items.reduce((sum, i) => sum + i.amount, 0),
}));

interface MixStore {
  targetWeight: number | null;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  locationId: number | null;
  driverName: string;
  driverRent: number;
  ingredients: MixIngredient[];
  startOrder: (name: string, type: "credit" | "cash", date: string, target: number, opts?: { driverNameCust?: string; driverRent?: number; locationId?: number | null }) => void;
  addIngredient: (ing: MixIngredient) => void;
  removeIngredient: (index: number) => void;
  reset: () => void;
  getUsedWeight: () => number;
  getTotalAmount: () => number;
  getTotalBagAmount: () => number;
}

export const useMixStore = create<MixStore>((set, get) => ({
  targetWeight: null,
  customerName: "",
  customerType: "credit",
  orderDate: pktToday(),
  locationId: null,
  driverName: "",
  driverRent: 0,
  ingredients: [],
  startOrder: (name, type, date, target, opts = {}) =>
    set({
      targetWeight: target,
      customerName: name,
      customerType: type,
      orderDate: date,
      locationId: opts.locationId ?? null,
      driverName: opts.driverNameCust ?? "",
      driverRent: opts.driverRent ?? 0,
      ingredients: [],
    }),
  addIngredient: (ing) => set((s) => ({ ingredients: [...s.ingredients, ing] })),
  removeIngredient: (index) => set((s) => ({ ingredients: s.ingredients.filter((_, i) => i !== index) })),
  reset: () => set({ targetWeight: null, customerName: "", customerType: "credit", orderDate: pktToday(), locationId: null, driverName: "", driverRent: 0, ingredients: [] }),
  getUsedWeight: () => get().ingredients.reduce((sum, i) => sum + i.weight_kg, 0),
  getTotalAmount: () => get().ingredients.reduce((sum, i) => sum + i.amount, 0),
  getTotalBagAmount: () => get().ingredients.reduce((sum, i) => sum + (i.bag_amount ?? 0), 0),
}));

interface AppStore {
  activePage: string;
  setActivePage: (page: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePage: "about",
  setActivePage: (page) => set({ activePage: page }),
}));

// ─── Master Data Cache ───

interface CachedData<T> { data: T; fetchedAt: number }
const CACHE_TTL = 60_000;

interface MasterDataCache {
  products: CachedData<any[]> | null;
  customers: CachedData<any[]> | null;
  suppliers: CachedData<any[]> | null;
  stock: CachedData<any[]> | null;
}

const masterCache: MasterDataCache = {
  products: null, customers: null, suppliers: null, stock: null,
};

export { masterCache };

function isStale(entry: CachedData<any> | null): boolean {
  return !entry || Date.now() - entry.fetchedAt > CACHE_TTL;
}

export async function fetchCached<T>(
  key: keyof MasterDataCache,
  url: string,
  unwrapKey: string
): Promise<T[]> {
  if (!isStale(masterCache[key])) {
    return masterCache[key]!.data as T[];
  }
  try {
    const data = await api.get<any>(url);
    const arr = data[unwrapKey] ?? [];
    masterCache[key] = { data: arr, fetchedAt: Date.now() };
    return arr as T[];
  } catch (err: any) {
    // On auth errors, re-throw so pages can redirect
    if (err?.status === 401 || err?.status === 403) {
      throw err;
    }
    // For other errors, return stale cache if available, otherwise throw
    if (masterCache[key]) return masterCache[key]!.data as T[];
    throw err;
  }
}

export function invalidateCache(key?: keyof MasterDataCache) {
  if (key) { masterCache[key] = null; return; }
  Object.keys(masterCache).forEach((k) => { masterCache[k as keyof MasterDataCache] = null; });
}
