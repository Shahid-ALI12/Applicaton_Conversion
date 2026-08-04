
import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { fetchCached, invalidateCache } from "@/store";
import type { Product, ProductStock, Location } from "@/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const fmt = (n: number) => n.toLocaleString("en-PK");

interface AvailableStockProps {
  /**
   * Increment this number to force a stock refresh from the parent.
   * Typical usage: parent keeps a `saleCount` state and increments it
   * after every sale/mix-order/purchase completes. The component
   * watches this prop in a useEffect and refetches whenever it changes.
   */
  refreshTrigger?: number;
  /** Optional className for the wrapping Card (e.g. to tweak spacing). */
  className?: string;
  /**
   * If true, hides the bottom summary cards row. Useful when the parent
   * already shows summary metrics and we want to avoid duplication.
   */
  hideSummary?: boolean;
}

/**
 * AvailableStock — reusable panel that shows live stock at every location
 * (Farmhouse + Shop) for every active product.
 *
 * Self-contained: fetches its own products, locations, and stock via the
 * shared master cache (60s TTL). Has a manual Refresh button that bypasses
 * the cache for instant updates.
 *
 * Auto-refresh: pass a `refreshTrigger` prop and bump it from the parent
 * whenever a sale / mix order / purchase is completed. The component will
 * refetch stock automatically.
 *
 * Usage:
 *   <AvailableStock />                                   // standalone
 *   <AvailableStock refreshTrigger={saleCount} />        // auto-refresh
 *   <AvailableStock refreshTrigger={n} hideSummary />    // compact
 */
export function AvailableStock({
  refreshTrigger = 0,
  className,
  hideSummary = false,
}: AvailableStockProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [lastStockUpdate, setLastStockUpdate] = useState<Date | null>(null);
  const [refreshingStock, setRefreshingStock] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Initial load ──
  const loadAll = useCallback(async () => {
    const errors: string[] = [];
    try {
      setProducts(
        await fetchCached<Product>(
          "products",
          "/api/products?active=true",
          "rows"
        )
      );
    } catch {
      errors.push("Products");
    }
    try {
      setStockData(
        await fetchCached<ProductStock>("stock", "/api/stock", "rows")
      );
      setLastStockUpdate(new Date());
    } catch {
      errors.push("Stock");
    }
    // Locations are not cached (small table, we want fresh data)
    try {
      const locData = await api.get<any>("/api/locations");
      if (Array.isArray(locData?.rows)) setLocations(locData.rows);
    } catch {
      /* non-fatal */
    }
    if (errors.length > 0) {
      console.error("AvailableStock: failed to load", errors);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  // ── Manual refresh — bypasses the 60s cache ──
  // Defined before the auto-refresh effect so the effect can depend on it.
  const refreshStock = useCallback(async () => {
    setRefreshingStock(true);
    try {
      invalidateCache("stock");
      const fresh = await fetchCached<ProductStock>(
        "stock",
        "/api/stock",
        "rows"
      );
      setStockData(fresh);
      setLastStockUpdate(new Date());
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh stock");
    } finally {
      setRefreshingStock(false);
    }
  }, []);

  // ── Auto-refresh when parent bumps refreshTrigger ──
  // Skips the very first render (refreshTrigger=0) so we don't double-fetch
  // on mount. Only refetches when the value actually changes from a
  // previous non-zero value.
  const [prevTrigger, setPrevTrigger] = useState(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger === 0) return;
    if (refreshTrigger === prevTrigger) return;
    setPrevTrigger(refreshTrigger);
    // Fire-and-forget refresh (don't block parent)
    void refreshStock();
  }, [refreshTrigger, prevTrigger, refreshStock]);

  // ── Build per-product, per-location matrix ──
  const stockByProduct = useMemo(() => {
    const stockMap = new Map<string, ProductStock>();
    for (const s of stockData) {
      const key = `${s.product_id}:${s.location_id ?? "null"}`;
      stockMap.set(key, s);
    }

    return products
      .filter((p) => p.is_active)
      .map((p) => {
        const byLocation: Record<
          number,
          { bags: number; kg: number; lastBagWeight: number | null }
        > = {};
        let totalBags = 0;
        let totalKg = 0;
        for (const loc of locations) {
          const entry = stockMap.get(`${p.id}:${loc.id}`);
          const bags = entry?.stock_quantity ?? 0;
          const bw = entry?.last_bag_weight_kg ?? null;
          const kg = bw != null ? bags * bw : 0;
          byLocation[loc.id] = { bags, kg, lastBagWeight: bw };
          totalBags += bags;
          totalKg += kg;
        }
        return { product: p, byLocation, totalBags, totalKg };
      })
      .sort((a, b) => b.totalBags - a.totalBags);
  }, [products, stockData, locations]);

  const stockSummary = useMemo(() => {
    let totalProducts = stockByProduct.length;
    let outOfStock = 0;
    let lowStock = 0;
    let totalBags = 0;
    for (const row of stockByProduct) {
      if (row.totalBags === 0) outOfStock++;
      else if (row.totalBags < 10) lowStock++;
      totalBags += row.totalBags;
    }
    return { totalProducts, outOfStock, lowStock, totalBags };
  }, [stockByProduct]);

  // ── Loading state ──
  if (loading) {
    return (
      <Card className={cn("rounded-2xl border-slate-200/60 shadow-sm", className)}>
        <CardContent className="p-6 flex items-center justify-center min-h-[120px]">
          <Loader2 className="size-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-2xl border-slate-200/60 shadow-sm", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Warehouse className="size-5 text-slate-600" /> Available Stock
            </CardTitle>
            <CardDescription className="flex items-center gap-3 flex-wrap">
              <span>Live stock across all locations — updates after every sale.</span>
              {stockSummary.outOfStock > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-semibold">
                  {stockSummary.outOfStock} out of stock
                </span>
              )}
              {stockSummary.lowStock > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
                  {stockSummary.lowStock} low (&lt; 10 bags)
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">
              {lastStockUpdate
                ? `Updated ${lastStockUpdate.toLocaleTimeString("en-PK")}`
                : "Not loaded yet"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStock}
              disabled={refreshingStock}
              className="h-8 gap-1.5"
            >
              {refreshingStock ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stockByProduct.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No products or stock data available.
          </p>
        ) : (
          <>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold sticky top-0 bg-slate-50">
                      Product
                    </TableHead>
                    {locations.map((loc) => (
                      <TableHead
                        key={loc.id}
                        className="text-xs uppercase text-slate-500 font-semibold text-right sticky top-0 bg-slate-50"
                      >
                        {loc.name} (bags)
                      </TableHead>
                    ))}
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right sticky top-0 bg-slate-50">
                      Total (bags)
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right sticky top-0 bg-slate-50 hidden md:table-cell">
                      Total (kg)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockByProduct.map((row) => {
                    const isOut = row.totalBags === 0;
                    const isLow = row.totalBags > 0 && row.totalBags < 10;
                    return (
                      <TableRow
                        key={row.product.id}
                        className={cn(
                          isOut && "bg-red-50/40",
                          isLow && "bg-amber-50/40"
                        )}
                      >
                        <TableCell className="text-sm font-medium">
                          {row.product.name}
                          {isOut && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                              Out
                            </span>
                          )}
                          {isLow && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                              Low
                            </span>
                          )}
                        </TableCell>
                        {locations.map((loc) => {
                          const cell = row.byLocation[loc.id];
                          const bags = cell?.bags ?? 0;
                          const kg = cell?.kg ?? 0;
                          return (
                            <TableCell
                              key={loc.id}
                              className={cn(
                                "text-sm text-right tabular-nums",
                                bags === 0
                                  ? "text-red-600 font-semibold"
                                  : bags < 10
                                  ? "text-amber-700 font-semibold"
                                  : "text-slate-700"
                              )}
                            >
                              {fmt(bags)}
                              {cell?.lastBagWeight != null && bags > 0 && (
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  {fmt(kg)} kg
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell
                          className={cn(
                            "text-sm text-right tabular-nums font-bold",
                            isOut
                              ? "text-red-600"
                              : isLow
                              ? "text-amber-700"
                              : "text-slate-900"
                          )}
                        >
                          {fmt(row.totalBags)}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-slate-500 hidden md:table-cell">
                          {fmt(row.totalKg)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!hideSummary && (
              <div className="mt-3 flex flex-wrap gap-3 pt-2">
                <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                  <div className="text-xs text-slate-500 font-semibold uppercase">
                    Products Tracked
                  </div>
                  <div className="text-lg font-extrabold text-slate-900">
                    {fmt(stockSummary.totalProducts)}
                  </div>
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg bg-red-50 border border-red-200/60 px-3 py-2 text-center">
                  <div className="text-xs text-red-600 font-semibold uppercase">
                    Out of Stock
                  </div>
                  <div className="text-lg font-extrabold text-red-600">
                    {fmt(stockSummary.outOfStock)}
                  </div>
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2 text-center">
                  <div className="text-xs text-amber-700 font-semibold uppercase">
                    Low (&lt; 10 bags)
                  </div>
                  <div className="text-lg font-extrabold text-amber-700">
                    {fmt(stockSummary.lowStock)}
                  </div>
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg bg-emerald-50 border border-emerald-200/60 px-3 py-2 text-center">
                  <div className="text-xs text-emerald-700 font-semibold uppercase">
                    Total Bags
                  </div>
                  <div className="text-lg font-extrabold text-emerald-700">
                    {fmt(stockSummary.totalBags)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
