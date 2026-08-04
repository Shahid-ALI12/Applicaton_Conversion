import { apiFetch } from "@/lib/api";

import { Fragment, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { CREDIT_LIMIT } from "@/types";
import type { Customer, Sale, Purchase, Location } from "@/types";
import {
  AlertTriangle,
  Download,
  BookOpen,
  Users,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Truck,
  ShoppingBag,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { shareBillOnWhatsApp } from "@/lib/share-whatsapp";
import { showWhatsAppShareToast } from "@/components/share-whatsapp-toast";
import { numberToWords } from "@/lib/number-to-words";
import {
  useCustomers,
  useCustomersPaginated,
  useCustomerBalance,
  useSalesPaginated,
  useMixOrders,
} from "@/hooks/queries";
import { downloadExcel } from "@/lib/download-excel";

const fmt = (n: number) => n.toLocaleString("en-PK");
const PAGE_SIZE = 10;

/** Small helper: renders Rs. value + English words below */
function AmountWithWords({ amount, className }: { amount: number; className?: string }) {
  if (amount === 0) {
    return <span className={className}>Rs. 0</span>;
  }
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className="tabular-nums font-medium leading-tight">Rs. {fmt(amount)}</span>
      <span className="text-[0.6rem] text-slate-400 leading-tight capitalize">{numberToWords(amount)}</span>
    </span>
  );
}

interface BalanceRow {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  advance_payment?: number;
  balance_due: number;
}

interface CustomerWithBalance extends Customer, BalanceRow {}

export default function CustomerKhataPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [expandedMixOrders, setExpandedMixOrders] = useState<Set<string>>(new Set());

  // ── Section 1: All Customers list (paginated + server-side search) ──
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [customerPage, setCustomerPage] = useState(1);

  // Debounce search input by 350ms so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(searchInput);
      setCustomerPage(1); // reset to page 1 on new search
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Paginated + searchable customers list for Section 1 table
  const customersQ = useCustomersPaginated(
    { activeOnly: false, search: searchDebounced },
    customerPage,
    PAGE_SIZE,
  );

  // All active customers — used for the Section 2 dropdown (small, OK to fetch all)
  const allActiveQ = useCustomers(true);

  // Customer balances map (customerId → BalanceRow) — fetched once
  const balancesQ = useCustomerBalance();
  const balances: Record<number, BalanceRow> = useMemo(() => {
    const d = balancesQ.data;
    if (!d) return {};
    return typeof d === "object" && !Array.isArray(d) ? (d as Record<number, BalanceRow>) : {};
  }, [balancesQ.data]);

  // ── Mix orders lookup: mix_order_id → { driver_name, driver_rent } ──
  // Mix orders store their own driver_name/driver_rent (separate from
  // sales.rickshaw_fare which is 0 for mix-order ingredients). We need
  // this to render driver info in the customer history table for mix orders.
  const mixOrdersQ = useMixOrders();
  const mixMeta: Record<number, { driver_name: string | null; driver_rent: number }> = useMemo(() => {
    const orders: any[] = mixOrdersQ.data?.orders ?? [];
    const map: Record<number, { driver_name: string | null; driver_rent: number }> = {};
    for (const o of orders) {
      map[Number(o.id)] = {
        driver_name: o.driver_name ?? null,
        driver_rent: Number(o.driver_rent) || 0,
      };
    }
    return map;
  }, [mixOrdersQ.data]);

  // ── Section 2: Per-customer sales history (paginated) ──
  const [salesPage, setSalesPage] = useState(1);
  useEffect(() => { setSalesPage(1); }, [selectedCustomerId]);

  // Search filter for the Customer History dropdown (filters by name/phone)
  const [customerSearch, setCustomerSearch] = useState("");

  const salesQ = useSalesPaginated(
    selectedCustomerId ? { customer_id: Number(selectedCustomerId) } : {},
    salesPage,
    PAGE_SIZE,
  );

  // ── Buy-Product records (goods we bought FROM this customer) ──
  // Fetched unpaginated — the per-customer list is usually short.
  const [selectedPurchases, setSelectedPurchases] = useState<Purchase[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  // Load locations (Farmhouse / Shop) once for the purchases table display
  useEffect(() => {
    (async () => {
      try {
        const locRes = await apiFetch("/api/locations");
        if (locRes.ok) {
          const locData = await locRes.json();
          setLocations(locData.locations ?? []);
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Fetch purchases-from-customer whenever the selected customer changes
  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedPurchases([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPurchases(true);
      try {
        const purRaw = await apiFetch(
          `/api/purchases?from_customers_only=true&customer_id=${selectedCustomerId}&page=1&page_size=10000`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (purRaw.ok) {
          const purRes = await purRaw.json();
          setSelectedPurchases(purRes.rows ?? []);
        } else {
          setSelectedPurchases([]);
        }
      } catch {
        if (!cancelled) setSelectedPurchases([]);
      } finally {
        if (!cancelled) setLoadingPurchases(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCustomerId]);

  const [downloadingBill, setDownloadingBill] = useState(false);
  const [downloadingCustomers, setDownloadingCustomers] = useState(false);
  const [downloadingSales, setDownloadingSales] = useState(false);

  // Toggle expand/collapse for a mix order group
  const toggleMixOrder = (mixOrderId: string) => {
    setExpandedMixOrders((prev) => {
      const next = new Set(prev);
      if (next.has(mixOrderId)) next.delete(mixOrderId);
      else next.add(mixOrderId);
      return next;
    });
  };

  // ── Section 1: paginated customers merged with balances ──
  const pagedCustomers: CustomerWithBalance[] = useMemo(() => {
    const list = customersQ.data?.customers ?? [];
    return list.map((c: any) => {
      const b = balances[c.id] ?? {
        opening_balance: c.opening_balance ?? 0,
        total_bill: 0,
        total_cash_paid: 0,
        total_goods_value: 0,
        advance_payment: c.advance_payment ?? 0,
        balance_due: (c.opening_balance ?? 0) - (c.advance_payment ?? 0),
      };
      return { ...c, ...b } as CustomerWithBalance;
    })
    .sort((a, b) => b.balance_due - a.balance_due);
  }, [customersQ.data, balances]);

  // Total outstanding across ALL customers (computed from balances map, not paged list)
  const totalOutstanding = useMemo(
    () => Object.values(balances).reduce((sum, b) => sum + (b?.balance_due ?? 0), 0),
    [balances],
  );

  // ── Section 2: selected customer detail ──
  const allActiveCustomers: Customer[] = useMemo(
    () => (allActiveQ.data?.customers ?? []) as Customer[],
    [allActiveQ.data],
  );

  // Filtered customer list for the Customer History dropdown search
  const filteredActiveCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const list = allActiveCustomers.filter((c) => c.is_active);
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [allActiveCustomers, customerSearch]);

  const selectedCustomer = useMemo(
    () => allActiveCustomers.find((c) => c.id === Number(selectedCustomerId)),
    [allActiveCustomers, selectedCustomerId],
  );

  const selectedBalance = useMemo<BalanceRow | null>(
    () => (selectedCustomerId ? balances[Number(selectedCustomerId)] ?? null : null),
    [selectedCustomerId, balances],
  );

  const pagedSales: Sale[] = useMemo(
    () => (salesQ.data?.sales ?? []) as Sale[],
    [salesQ.data],
  );

  // Group by transaction_group_id for bill numbers
  const groupedSales = useMemo(() => {
    const groupMap = new Map<string, Sale[]>();
    pagedSales.forEach((s) => {
      const key = s.transaction_group_id ?? `solo-${s.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    });

    const sortedGroups: { billNumber: number; groupId: string; sales: Sale[] }[] = [];
    let billNum = 1;
    // Sort groups by earliest sale date in each group (oldest first) for stable bill numbers
    const groupsArr = Array.from(groupMap.entries());
    groupsArr.sort((a, b) => {
      const aDate = a[1][0]?.sale_date ?? "";
      const bDate = b[1][0]?.sale_date ?? "";
      return aDate.localeCompare(bDate);
    });
    for (const [groupId, sales] of groupsArr) {
      sortedGroups.push({ billNumber: billNum, groupId, sales });
      billNum++;
    }

    return { sortedGroups };
  }, [pagedSales]);

  // ── Download Bill Handler (single PDF for selected customer) ──
  const handleDownloadBill = async () => {
    if (!selectedCustomer) {
      toast.error("Select a customer first");
      return;
    }
    setDownloadingBill(true);
    try {
      // Fetch ALL sales for the bill (not just current page) — bill should be complete
      const allSalesRes = await apiFetch(`/api/sales?customer_id=${selectedCustomerId}`);
      if (!allSalesRes.ok) { toast.error("Failed to fetch sales for bill"); return; }
      const allSalesJson = await allSalesRes.json();
      const allSales: Sale[] = allSalesJson.sales ?? [];
      if (allSales.length === 0) {
        toast.error("No sales data to generate bill");
        return;
      }
      const { generateCustomerBillPDF } = await import("@/lib/generate-customer-bill");
      const bal = selectedBalance ?? {
        opening_balance: selectedCustomer?.opening_balance ?? 0,
        total_bill: 0,
        total_cash_paid: 0,
        total_goods_value: 0,
        advance_payment: selectedCustomer?.advance_payment ?? 0,
        balance_due: (selectedCustomer?.opening_balance ?? 0) - (selectedCustomer?.advance_payment ?? 0),
      };
      const billResult = await generateCustomerBillPDF({
        customer: selectedCustomer,
        sales: allSales,
        openingBalance: bal.opening_balance,
        totalBill: bal.total_bill,
        totalCashPaid: bal.total_cash_paid,
        balanceDue: bal.balance_due,
        generatedAt: new Date().toLocaleString("en-PK"),
        // Pass advance_payment so the bill shows it as a separate row
        // in the totals box and subtracts it from Balance Due.
        advancePayment: (bal as any).advance_payment ?? 0,
        // Pass mix-order driver info so the bill shows correct driver rent
        // and driver name for mix-order rows (sale rows have rickshaw_fare=0).
        mixMeta,
        // Pass goods value so Balance Due can be recomputed correctly after
        // we recalculate Total Bill from displayed rows (which include
        // mix-order driver rents that the DB's total_bill field may not).
        totalGoodsValue: bal.total_goods_value,
      });
      toast.success("Bill downloaded successfully!", {
        description: "Share on WhatsApp with the client?",
        action: {
          label: "Share on WhatsApp",
          onClick: () => {
            const result = shareBillOnWhatsApp(billResult);
            showWhatsAppShareToast(result);
          },
        },
        duration: 12000,
      });
    } catch (err) {
      console.error("Bill download error:", err);
      toast.error("Failed to generate bill. Try again.");
    } finally {
      setDownloadingBill(false);
    }
  };

  // ── Download ALL customers + balances as Excel ──
  const handleDownloadAllCustomersExcel = async () => {
    setDownloadingCustomers(true);
    try {
      // Walk all pages of /api/customers (no search filter = all records)
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          page: String(page),
          pageSize: "200",
        });
        const res = await apiFetch(`/api/customers?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch customers");
        const body = await res.json();
        const rows = Array.isArray(body?.customers) ? body.customers : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No customers to download");
        return;
      }
      // Merge with balances map
      const merged = all.map((c) => {
        const b = balances[c.id] ?? {
          opening_balance: c.opening_balance ?? 0,
          total_bill: 0,
          total_cash_paid: 0,
          total_goods_value: 0,
          advance_payment: c.advance_payment ?? 0,
          balance_due: (c.opening_balance ?? 0) - (c.advance_payment ?? 0),
        };
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          phone: c.phone ?? "",
          is_active: c.is_active ? "Yes" : "No",
          opening_balance: b.opening_balance,
          total_bill: b.total_bill,
          total_cash_paid: b.total_cash_paid,
          total_goods_value: b.total_goods_value,
          advance_payment: b.advance_payment ?? 0,
          balance_due: b.balance_due,
          created_at: c.created_at,
        };
      });
      await downloadExcel(merged, [
        { key: "id", label: "ID" },
        { key: "name", label: "Customer" },
        { key: "type", label: "Type" },
        { key: "phone", label: "Phone" },
        { key: "is_active", label: "Active" },
        { key: "opening_balance", label: "Opening Balance (Rs.)", align: "right" },
        { key: "total_bill", label: "Total Billed (Rs.)", align: "right" },
        { key: "total_cash_paid", label: "Cash Paid (Rs.)", align: "right" },
        { key: "total_goods_value", label: "Paid in Goods (Rs.)", align: "right" },
        { key: "advance_payment", label: "Advance Payment (Rs.)", align: "right" },
        { key: "balance_due", label: "Balance Due (Rs.)", align: "right" },
        { key: "created_at", label: "Created At" },
      ], "all-customers-with-balances");
      toast.success(`Customers Excel downloaded (${merged.length} records)`);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err?.message || "Failed to download customers");
    } finally {
      setDownloadingCustomers(false);
    }
  };

  // ── Download ALL sales for selected customer as Excel ──
  const handleDownloadSalesExcel = async () => {
    if (!selectedCustomerId) {
      toast.error("Select a customer first");
      return;
    }
    setDownloadingSales(true);
    try {
      // Walk paginated /api/sales for this customer
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          customer_id: selectedCustomerId,
          page: String(page),
          pageSize: "200",
        });
        const res = await apiFetch(`/api/sales?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch sales");
        const body = await res.json();
        const rows = Array.isArray(body?.sales) ? body.sales : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No sales to download for this customer");
        return;
      }

      // Fetch mix orders to enrich mix-order sale rows with driver info
      // (mix orders store driver_name/driver_rent on the mix_orders table,
      // not on individual sale rows).
      let mixMetaForExcel: Record<number, { driver_name: string | null; driver_rent: number }> = {};
      try {
        const moRes = await apiFetch(`/api/mix-orders`);
        if (moRes.ok) {
          const moBody = await moRes.json();
          const orders: any[] = moBody?.orders ?? [];
          for (const o of orders) {
            mixMetaForExcel[Number(o.id)] = {
              driver_name: o.driver_name ?? null,
              driver_rent: Number(o.driver_rent) || 0,
            };
          }
        }
      } catch (moErr) {
        console.warn("Failed to fetch mix orders for Excel enrichment:", moErr);
      }

      // Enrich each row with driver_name + driver_rent (solo sales use sale fields,
      // mix orders use mix_orders table fields via lookup).
      const enriched = all.map((row) => {
        const mixId = row.mix_order_id ? Number(row.mix_order_id) : null;
        const meta = mixId != null ? mixMetaForExcel[mixId] : null;
        const driverName = mixId != null
          ? (meta?.driver_name ?? "")
          : (row.rickshaw_driver_name ?? "");
        const driverRent = mixId != null
          ? (meta?.driver_rent ?? 0)
          : (Number(row.rickshaw_fare) || 0);
        return {
          ...row,
          _driver_name: driverName,
          _driver_rent: driverRent,
        };
      });

      await downloadExcel(enriched, [
        { key: "sale_date", label: "Date" },
        {
          key: "products",
          label: "Product",
          fmt: (v: any) => v?.name ?? "—",
        },
        { key: "quantity", label: "Qty", align: "right" },
        { key: "unit_type", label: "Unit" },
        { key: "rate_per_bag", label: "Rate", align: "right" },
        { key: "_driver_rent", label: "Driver Rent", align: "right" },
        { key: "_driver_name", label: "Driver Name" },
        {
          key: "_bill",
          label: "Bill",
          align: "right",
          fmt: (_v: any, row: any) => {
            // Bill = (qty * rate) + driver_rent
            // For mix orders, rickshaw_fare is 0 in sale rows; we add driver_rent.
            // For solo sales, rickshaw_fare is the driver rent.
            const rent = row.mix_order_id
              ? (Number(row._driver_rent) || 0)
              : (Number(row.rickshaw_fare) || 0);
            return String(
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) + rent,
            );
          },
        },
        { key: "cash_received", label: "Cash", align: "right" },
        {
          key: "_remaining",
          label: "Remaining",
          align: "right",
          fmt: (_v: any, row: any) => {
            const rent = row.mix_order_id
              ? (Number(row._driver_rent) || 0)
              : (Number(row.rickshaw_fare) || 0);
            const bill =
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) + rent;
            return String(bill - (Number(row.cash_received) || 0));
          },
        },
        { key: "mix_order_id", label: "Mix Order ID" },
        { key: "transaction_group_id", label: "Bill Group" },
        { key: "entered_by", label: "Entered By" },
        { key: "created_at", label: "Created At" },
      ], `customer-${selectedCustomerId}-sales`);
      toast.success(`Sales Excel downloaded (${enriched.length} records)`);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err?.message || "Failed to download sales");
    } finally {
      setDownloadingSales(false);
    }
  };

  const loadingCustomers = customersQ.isLoading && !customersQ.data;
  const loadingSales = salesQ.isLoading && !salesQ.data;
  const isSearchActive = searchDebounced.trim().length > 0;
  const noCustomersMatch = isSearchActive && (customersQ.data?.customers?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Khata"
        subtitle="Running ledger — balances & transaction history"
      />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-overview", label: "All Customers", icon: Users },
          { id: "section-history", label: "Customer History", icon: BookOpen, iconColor: "text-emerald-600" },
        ]}
      />

      {/* ─── Section 1: All Customers Balance Overview ─── */}
      <section id="section-overview" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm scroll-mt-24">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">
                All Customers — Balance Overview
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by customer name or phone..."
                  className="pl-8 w-full sm:w-72 h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllCustomersExcel}
                disabled={downloadingCustomers}
                className="shrink-0"
              >
                {downloadingCustomers ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="size-4 mr-1.5" />
                )}
                {downloadingCustomers ? "Downloading..." : "Download Excel"}
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Customer</th>
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Type</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Opening Balance</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Total Billed</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Cash Paid</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Paid in Goods</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 className="size-5 animate-spin text-slate-400 inline-block mr-2" />
                    <span className="text-slate-400">Loading customers...</span>
                  </td>
                </tr>
              ) : noCustomersMatch ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    <Search className="size-8 mx-auto mb-2 opacity-30" />
                    No record for the customer &quot;{searchDebounced}&quot;.
                  </td>
                </tr>
              ) : pagedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No customers found.
                  </td>
                </tr>
              ) : (
                pagedCustomers.map((c) => {
                  const isOverLimit = c.balance_due >= CREDIT_LIMIT;
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-slate-50 last:border-b-0 transition-colors",
                        isOverLimit ? "bg-red-50 text-red-700" : "hover:bg-slate-50/80",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.type === "credit" ? "default" : "secondary"} className="text-xs">
                          {c.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.opening_balance > 0 ? (
                          <span className="inline-flex flex-col items-end">
                            <span className="tabular-nums font-medium text-amber-700">Rs. {fmt(c.opening_balance)}</span>
                            <span className="text-[0.6rem] text-slate-400 capitalize">{numberToWords(c.opening_balance)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_bill} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_cash_paid} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_goods_value} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.balance_due} className="items-end font-bold" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!noCustomersMatch && (customersQ.data?.total ?? 0) > 0 && (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-500">
                  Total Outstanding Across All Customers
                </span>
                <div className="flex flex-col">
                  <span className="text-xl font-extrabold text-slate-900">
                    Rs. {fmt(totalOutstanding)}
                  </span>
                  <span className="text-[0.65rem] text-slate-400 capitalize">
                    {numberToWords(totalOutstanding)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  Page {customersQ.data?.page ?? 1} of {customersQ.data?.totalPages ?? 1}
                  {" · "}
                  {customersQ.data?.total ?? 0} customers
                  {isSearchActive ? ` matching "${searchDebounced}"` : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(customersQ.data?.page ?? 1) <= 1 || customersQ.isFetching}
                    onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      (customersQ.data?.page ?? 1) >= (customersQ.data?.totalPages ?? 1) ||
                      customersQ.isFetching
                    }
                    onClick={() => setCustomerPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ─── Section 2: Individual Customer History ─── */}
      <section id="section-history" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm scroll-mt-24">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">
                Customer History
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {allActiveCustomers
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedCustomerId && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleDownloadSalesExcel}
                    disabled={downloadingSales}
                  >
                    {downloadingSales ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-1.5" />
                    )}
                    {downloadingSales ? "Downloading..." : "Download Excel"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleDownloadBill}
                    disabled={downloadingBill}
                  >
                    {downloadingBill ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-1.5" />
                    )}
                    {downloadingBill ? "Generating..." : "Download Bill"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Standalone search bar — shows live filtered customer results */}
        <div className="px-4 sm:px-6 pt-4 pb-2 border-b border-slate-100 bg-slate-50/40">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search customer by name or phone..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="pl-9 bg-white"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Live results list — appears below search bar */}
          {customerSearch.trim() && (
            <div className="mt-2 max-w-md">
              {filteredActiveCustomers.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500 bg-white rounded-md border border-slate-200">
                  No customers match <span className="font-semibold">"{customerSearch}"</span>
                </div>
              ) : (
                <div className="bg-white rounded-md border border-slate-200 shadow-sm divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {filteredActiveCustomers.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(String(c.id));
                        setCustomerSearch("");
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2 ${
                        selectedCustomerId === String(c.id) ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                      }`}
                    >
                      <span className="font-medium truncate">
                        {c.name}
                        {c.phone ? <span className="text-slate-500 font-normal"> — {c.phone}</span> : null}
                      </span>
                      {selectedCustomerId === String(c.id) && (
                        <span className="text-xs text-emerald-600 shrink-0">Selected</span>
                      )}
                    </button>
                  ))}
                  {filteredActiveCustomers.length > 20 && (
                    <div className="px-3 py-2 text-xs text-slate-400 text-center bg-slate-50">
                      Showing 20 of {filteredActiveCustomers.length} matches — refine your search to narrow down
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!selectedCustomerId ? (
          <div className="p-12 text-center text-slate-400">
            <BookOpen className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a customer to view their ledger.</p>
          </div>
        ) : loadingSales ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Credit limit alert */}
            {selectedBalance && selectedBalance.balance_due >= CREDIT_LIMIT && (
              <Alert className="border-red-200 bg-red-50 text-red-700">
                <AlertTriangle className="size-4 text-red-600" />
                <AlertDescription className="font-semibold">
                  {selectedCustomer?.name} has crossed the credit limit of
                  Rs. {fmt(CREDIT_LIMIT)} ({numberToWords(CREDIT_LIMIT)}).
                </AlertDescription>
              </Alert>
            )}

            {/* Sales table */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                Sales (charges added to their tab)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Bill #</th>
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Date</th>
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Product</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Qty</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Rate</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Driver Rent</th>
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Driver Name</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Bill Amount</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Cash Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening Balance — first row, highlighted in amber */}
                    {selectedBalance && selectedBalance.opening_balance > 0 && salesPage === 1 && (
                      <tr className="bg-amber-50/70 border-b border-amber-200">
                        <td className="px-3 py-2.5 font-bold text-amber-800 align-top">—</td>
                        <td className="px-3 py-2.5 text-amber-700 align-top italic text-xs">
                          {selectedCustomer?.created_at?.slice(0, 10) ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-amber-900 font-semibold italic">
                          Opening Balance (purana balance)
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex flex-col items-end">
                            <span className="tabular-nums font-bold text-amber-800">Rs. {fmt(selectedBalance.opening_balance)}</span>
                            <span className="text-[0.6rem] text-amber-600 capitalize">{numberToWords(selectedBalance.opening_balance)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-700">—</td>
                      </tr>
                    )}
                    {groupedSales.sortedGroups.map((group, groupIdx) => {
                      const firstSale = group.sales[0];
                      const isMixOrder = group.sales.some((s) => s.mix_order_id);
                      const isLastGroup = groupIdx === groupedSales.sortedGroups.length - 1;

                      // ─── Mix Order: collapsed summary row + expandable sub-rows ───
                      if (isMixOrder) {
                        const mixOrderId = String(firstSale.mix_order_id);
                        const mixOrderIdNum = Number(mixOrderId);
                        const isExpanded = expandedMixOrders.has(mixOrderId);
                        // Mix orders store rickshaw_fare=0 on individual sale rows;
                        // the actual driver rent lives on the mix_orders table.
                        // Look it up via mixMeta (fetched from /api/mix-orders).
                        const mixDriverName = mixMeta[mixOrderIdNum]?.driver_name ?? firstSale.rickshaw_driver_name ?? null;
                        const mixDriverRent = mixMeta[mixOrderIdNum]?.driver_rent ?? 0;
                        const totalBillAmount = group.sales.reduce(
                          (sum, s) => sum + (s.quantity * s.rate_per_bag),
                          0,
                        ) + mixDriverRent;
                        const totalCashReceived = group.sales.reduce((sum, s) => sum + s.cash_received, 0);
                        return (
                          <Fragment key={group.groupId}>
                            <tr
                              className={cn(
                                "border-b border-slate-50 cursor-pointer hover:bg-slate-50/80 transition-colors",
                                !isLastGroup && "border-b-slate-200",
                              )}
                              onClick={() => toggleMixOrder(mixOrderId)}
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-700 align-top">#{group.billNumber}</td>
                              <td className="px-3 py-2.5 text-slate-600 align-top">{firstSale.sale_date}</td>
                              <td className="px-3 py-2.5 text-slate-800">
                                <span className="inline-flex items-center gap-1.5">
                                  <ChevronDown
                                    className={cn(
                                      "size-4 text-slate-400 transition-transform",
                                      isExpanded && "rotate-180",
                                    )}
                                  />
                                  <span className="font-semibold">Mix Order</span>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    MIX
                                  </Badge>
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">—</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">—</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {mixDriverRent > 0 ? fmt(mixDriverRent) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">
                                {mixDriverName ? (
                                  <span className="inline-flex items-center gap-1 text-xs">
                                    <Truck className="size-3.5 text-slate-400" />
                                    <span className="truncate max-w-[140px]">{mixDriverName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <AmountWithWords amount={totalBillAmount} className="items-end" />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {totalCashReceived > 0 ? (
                                  <AmountWithWords amount={totalCashReceived} className="items-end" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                            {isExpanded &&
                              group.sales.map((sale) => {
                                const billAmount = sale.quantity * sale.rate_per_bag;
                                const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
                                return (
                                  <tr key={sale.id} className="border-b border-slate-50 bg-slate-50/40">
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-slate-600">
                                      <span className="inline-flex items-center gap-1.5 pl-6">
                                        <span className="text-slate-300">↳</span>
                                        {sale.products?.name ?? `Product #${sale.product_id}`}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {fmt(sale.quantity)} {unitLabel}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {fmt(sale.rate_per_bag)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">—</td>
                                    <td className="px-3 py-2 text-slate-400">—</td>
                                    <td className="px-3 py-2 text-right">
                                      <AmountWithWords amount={billAmount} className="items-end" />
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-300">—</td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      }

                      // ─── Solo Sale: single row (no expansion) ───
                      const sale = firstSale;
                      const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
                      const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
                      return (
                        <tr
                          key={sale.id}
                          className={cn(
                            "border-b border-slate-50 last:border-b-0",
                            !isLastGroup && "border-b-slate-200",
                          )}
                        >
                          <td className="px-3 py-2.5 font-bold text-slate-700 align-top">#{group.billNumber}</td>
                          <td className="px-3 py-2.5 text-slate-600 align-top">{sale.sale_date}</td>
                          <td className="px-3 py-2.5 text-slate-800">
                            {sale.products?.name ?? `Product #${sale.product_id}`}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {fmt(sale.quantity)} {unitLabel}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {fmt(sale.rate_per_bag)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {sale.rickshaw_fare > 0 ? fmt(sale.rickshaw_fare) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">
                            {sale.rickshaw_driver_name ? (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <Truck className="size-3.5 text-slate-400" />
                                <span className="truncate max-w-[140px]">{sale.rickshaw_driver_name}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <AmountWithWords amount={billAmount} className="items-end" />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {sale.cash_received > 0 ? (
                              <AmountWithWords amount={sale.cash_received} className="items-end" />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {pagedSales.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    {selectedBalance && selectedBalance.opening_balance > 0
                      ? "No sales recorded yet — only opening balance is on this customer's tab."
                      : "No sales recorded for this customer."}
                  </div>
                )}
              </div>

              {/* Pagination controls for sales history */}
              {(salesQ.data?.total ?? 0) > 0 && (
                <div className="mt-3 flex items-center justify-end gap-3">
                  <span className="text-xs text-slate-500">
                    Page {salesQ.data?.page ?? 1} of {salesQ.data?.totalPages ?? 1}
                    {" · "}
                    {salesQ.data?.total ?? 0} sales total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(salesQ.data?.page ?? 1) <= 1 || salesQ.isFetching}
                      onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        (salesQ.data?.page ?? 1) >= (salesQ.data?.totalPages ?? 1) ||
                        salesQ.isFetching
                      }
                      onClick={() => setSalesPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Bought From Customer — individual purchase records (goods we bought FROM this customer) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="size-3.5 text-amber-600" />
                  Bought From Customer (reduces their tab)
                </h3>
                <span className="text-xs text-slate-500">
                  Total: <span className="font-bold text-amber-700">Rs. {fmt(selectedBalance?.total_goods_value ?? 0)}</span>
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-200">
                      <th className="text-left text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">#</th>
                      <th className="text-left text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Date</th>
                      <th className="text-left text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Product</th>
                      <th className="text-right text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Bags</th>
                      <th className="text-right text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Rate / Bag</th>
                      <th className="text-right text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Total Amount</th>
                      <th className="text-center text-xs uppercase text-amber-700 font-semibold px-3 py-2.5">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingPurchases ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center">
                          <Loader2 className="size-5 animate-spin text-slate-400 mx-auto" />
                        </td>
                      </tr>
                    ) : selectedPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-sm">
                          No purchases recorded from this customer.
                        </td>
                      </tr>
                    ) : (
                      selectedPurchases.map((pur, idx) => {
                        const total = (Number(pur.quantity) ?? 0) * (Number(pur.rate_per_bag) ?? 0);
                        const locName = locations.find((l) => l.id === pur.location_id)?.name ?? "—";
                        return (
                          <tr key={pur.id} className="border-b border-slate-50 last:border-b-0 hover:bg-amber-50/30">
                            <td className="px-3 py-2.5 text-slate-500 font-medium">{idx + 1}</td>
                            <td className="px-3 py-2.5 text-slate-600">{pur.purchase_date}</td>
                            <td className="px-3 py-2.5 text-slate-800">
                              {pur.products?.name ?? `Product #${pur.product_id}`}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {Number(pur.quantity).toLocaleString("en-PK")}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              Rs. {Number(pur.rate_per_bag).toLocaleString("en-PK")}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="inline-flex flex-col items-end">
                                <span className="tabular-nums font-bold text-amber-800">Rs. {fmt(total)}</span>
                                <span className="text-[0.6rem] text-slate-400 capitalize">{numberToWords(total)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-slate-600">{locName}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {selectedPurchases.length > 0 && (
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={5} className="px-3 py-3 text-right text-xs uppercase font-bold text-amber-700">
                          Total Bought From Customer
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="inline-flex flex-col items-end">
                            <span className="tabular-nums font-extrabold text-amber-900">Rs. {fmt(selectedBalance?.total_goods_value ?? 0)}</span>
                            <span className="text-[0.6rem] text-amber-700 capitalize">{numberToWords(selectedBalance?.total_goods_value ?? 0)}</span>
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Metric Cards */}
            {selectedBalance && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard label="Opening Balance" value={fmt(selectedBalance.opening_balance)} color="amber" prefix="Rs. " words={numberToWords(selectedBalance.opening_balance)} />
                <MetricCard label="Total Billed" value={fmt(selectedBalance.total_bill)} color="blue" prefix="Rs. " words={numberToWords(selectedBalance.total_bill)} />
                <MetricCard label="Cash Paid" value={fmt(selectedBalance.total_cash_paid)} color="green" prefix="Rs. " words={numberToWords(selectedBalance.total_cash_paid)} />
                <MetricCard label="Paid in Goods" value={fmt(selectedBalance.total_goods_value)} color="purple" prefix="Rs. " words={numberToWords(selectedBalance.total_goods_value)} />
                <MetricCard label="Balance Due" value={fmt(selectedBalance.balance_due)} color="orange" prefix="Rs. " words={numberToWords(selectedBalance.balance_due)} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
