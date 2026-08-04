import { apiFetch } from "@/lib/api";

import { useMemo, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Scale,
  AlertCircle,
  Loader2,
  ChevronDown,
  FileText,
  X,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Expense } from "@/types";
import { pktToday } from "@/lib/pkt-date";
import { useReconciliation } from "@/hooks/queries";
import { downloadAllExcelPaged, type Col } from "@/lib/download-excel";

function formatRs(n: number) {
  return n.toLocaleString("en-PK");
}

/* ─── Types ─── */
type ReconcileCardKey = "bags-sold" | "total-billed" | "cash-received" | "credit-customers" | "cash-customers" | "expenses" | "cash-in" | "cash-out";

interface Reconciliation {
  total_bags_sold: number;
  total_billed: number;
  cash_received: number;
  from_credit_customers: number;
  from_cash_customers: number;
  total_expenses: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_cash_in_hand: number;
  expenses: Expense[];
}

/* ─── Column definitions ─── */

const columnsMap: Record<ReconcileCardKey, Col[]> = {
  "bags-sold": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "rate", label: "Rate/Bag", align: "right", fmt: (v) => formatRs(v) },
  ],
  "total-billed": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "bill", label: "Bill (Rs.)", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash_paid", label: "Cash Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-received": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "bill", label: "Bill (Rs.)", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash", label: "Cash (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
  "credit-customers": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "bill", label: "Bill (Rs.)", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash_paid", label: "Cash Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-customers": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "bill", label: "Bill (Rs.)", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash_paid", label: "Cash Paid", align: "right", fmt: (v) => formatRs(v) },
  ],
  "expenses": [
    { key: "date", label: "Date" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-in": [
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "bill", label: "Bill (Rs.)", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash", label: "Cash (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-out": [
    { key: "date", label: "Date" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
};

/* ─── Color mapping ─── */
const cardColors: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  blue: { border: "border-t-blue-500", text: "text-blue-600", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  purple: { border: "border-t-purple-500", text: "text-purple-600", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-700" },
  green: { border: "border-t-green-500", text: "text-green-600", bg: "bg-green-50", badge: "bg-green-100 text-green-700" },
  orange: { border: "border-t-orange-500", text: "text-orange-600", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-700" },
};

/* ─── Card label lookup ─── */
const cardLabels: Record<ReconcileCardKey, string> = {
  "bags-sold": "Total Bags Sold",
  "total-billed": "Total Billed",
  "cash-received": "Cash Actually Received",
  "credit-customers": "From Credit Customers",
  "cash-customers": "From Cash Customers",
  "expenses": "Total Expenses",
  "cash-in": "Total Cash In",
  "cash-out": "Total Cash Out / Expenses",
};

/* ─── Excel download helper (dynamically imports xlsx only when invoked) ─── */
/* Removed: now using shared `downloadAllExcelPaged` from @/lib/download-excel */

/* ─── Which cards search by customer name vs description ─── */
const cardSearchField: Record<ReconcileCardKey, "customer_name" | "description" | null> = {
  "bags-sold": "customer_name",
  "total-billed": "customer_name",
  "cash-received": "customer_name",
  "credit-customers": "customer_name",
  "cash-customers": "customer_name",
  "expenses": "description",
  "cash-in": "customer_name",
  "cash-out": "description",
};

const PAGE_SIZE = 10;

/* ─── API type mapping (some cards share same API type) ─── */
const apiTypeMap: Record<ReconcileCardKey, string> = {
  "bags-sold": "bags-sold",
  "total-billed": "total-billed",
  "cash-received": "cash-received",
  "credit-customers": "credit-customers",
  "cash-customers": "cash-customers",
  "expenses": "expenses",
  "cash-in": "cash-received",   // same data as cash-received
  "cash-out": "expenses",        // same data as expenses
};

export default function DayReconciliation() {
  const today = pktToday();
  const [mode, setMode] = useState<"single" | "range">("single");
  const [singleDate, setSingleDate] = useState(today);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  // Detail panel state
  const [activeCard, setActiveCard] = useState<ReconcileCardKey | null>(null);
  const [detailRows, setDetailRows] = useState<Record<string, any>[]>([]);
  const [detailLabel, setDetailLabel] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Detail panel — server-side search + pagination
  const [detailSearchInput, setDetailSearchInput] = useState("");
  const [detailSearchDebounced, setDetailSearchDebounced] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailTotalPages, setDetailTotalPages] = useState(1);
  const [detailDownloading, setDetailDownloading] = useState(false);

  const dateRange = useMemo(() => {
    if (mode === "single") return { from: singleDate, to: singleDate };
    return { from: rangeFrom, to: rangeTo };
  }, [mode, singleDate, rangeFrom, rangeTo]);

  // React Query hook — replaces useEffect + fetch + setState
  const { data, isLoading: loading } = useReconciliation(dateRange.from, dateRange.to);

  // Debounce search input + reset to page 1 on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setDetailSearchDebounced(detailSearchInput);
      setDetailPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [detailSearchInput]);

  // Fetch detail rows for a card
  const fetchDetails = useCallback(async (cardKey: ReconcileCardKey) => {
    if (activeCard === cardKey) {
      setActiveCard(null);
      setDetailRows([]);
      setDetailLabel("");
      setDetailSearchInput("");
      setDetailSearchDebounced("");
      setDetailPage(1);
      setDetailTotal(0);
      setDetailTotalPages(1);
      setDetailError("");
      return;
    }

    setActiveCard(cardKey);
    setDetailSearchInput("");
    setDetailSearchDebounced("");
    setDetailPage(1);
    setDetailLoading(true);
    setDetailRows([]);
    setDetailError("");
    setDetailLabel(cardLabels[cardKey] || cardKey);

    try {
      const apiType = apiTypeMap[cardKey];
      const params = new URLSearchParams({
        type: apiType,
        from: dateRange.from,
        to: dateRange.to,
        page: "1",
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiFetch(`/api/reports/reconciliation/details?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setDetailRows(d.rows || []);
        setDetailTotal(d.total ?? 0);
        setDetailTotalPages(d.totalPages ?? 1);
        if (d.label) setDetailLabel(d.label);
      } else {
        const err = await res.json().catch(() => ({}));
        const errMsg = typeof err?.error === 'string' ? err.error : err?.error?.message || err?.detail || "Failed to load records";
        setDetailError(errMsg);
      }
    } catch {
      setDetailRows([]);
      setDetailError("Network error — check your connection");
    } finally {
      setDetailLoading(false);
    }
  }, [activeCard, dateRange]);

  // Refetch when search term or page changes (only if panel is open)
  useEffect(() => {
    if (!activeCard) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const apiType = apiTypeMap[activeCard];
        const params = new URLSearchParams({
          type: apiType,
          from: dateRange.from,
          to: dateRange.to,
          page: String(detailPage),
          pageSize: String(PAGE_SIZE),
        });
        const searchField = cardSearchField[activeCard];
        if (searchField && detailSearchDebounced.trim()) {
          params.set(searchField, detailSearchDebounced.trim());
        }
        const res = await apiFetch(`/api/reports/reconciliation/details?${params.toString()}`);
        if (cancelled) return;
        if (res.ok) {
          const d = await res.json();
          setDetailRows(d.rows || []);
          setDetailTotal(d.total ?? 0);
          setDetailTotalPages(d.totalPages ?? 1);
          if (d.label) setDetailLabel(d.label);
        } else {
          const err = await res.json().catch(() => ({}));
          const errMsg = typeof err?.error === 'string' ? err.error : err?.error?.message || err?.detail || "Failed to load records";
          setDetailError(errMsg);
          setDetailRows([]);
        }
      } catch {
        if (!cancelled) {
          setDetailRows([]);
          setDetailError("Network error — check your connection");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCard, detailPage, detailSearchDebounced, dateRange]);

  // Download ALL records as Excel — walks server-side pages transparently
  const handleDownloadAllExcel = async () => {
    if (!activeCard) return;
    setDetailDownloading(true);
    try {
      const apiType = apiTypeMap[activeCard];
      const baseParams: Record<string, string> = {
        type: apiType,
        from: dateRange.from,
        to: dateRange.to,
      };
      // Intentionally DO NOT include the search filter — user wants every
      // record in the workbook, not just the current search.
      await downloadAllExcelPaged(
        "/api/reports/reconciliation/details",
        baseParams,
        cols,
        detailLabel,
      );
    } catch (err: any) {
      console.error("Excel download failed:", err);
      toast.error(err?.message || "Excel download failed. Please try again.");
    } finally {
      setDetailDownloading(false);
    }
  };

  const totalBagsSold = data?.total_bags_sold ?? 0;
  const totalBilled = data?.total_billed ?? 0;
  const cashReceived = data?.cash_received ?? 0;
  const fromCreditCustomers = data?.from_credit_customers ?? 0;
  const fromCashCustomers = data?.from_cash_customers ?? 0;
  const totalExpenses = data?.total_expenses ?? 0;
  const totalCashIn = data?.total_cash_in ?? 0;
  const totalCashOut = data?.total_cash_out ?? 0;
  const expectedCashInHand = data?.expected_cash_in_hand ?? 0;

  // Build card definitions
  const incomeCards: { key: ReconcileCardKey; label: string; value: string; color: string }[] = [
    { key: "bags-sold", label: "Total Bags Sold", value: `${formatRs(totalBagsSold)} bags`, color: "blue" },
    { key: "total-billed", label: "Total Billed", value: `Rs. ${formatRs(totalBilled)}`, color: "purple" },
    { key: "cash-received", label: "Cash Actually Received", value: `Rs. ${formatRs(cashReceived)}`, color: "green" },
  ];

  const breakdownCards: { key: ReconcileCardKey; label: string; value: string; color: string }[] = [
    { key: "credit-customers", label: "From Credit Customers", value: `Rs. ${formatRs(fromCreditCustomers)}`, color: "orange" },
    { key: "cash-customers", label: "From Cash Customers", value: `Rs. ${formatRs(fromCashCustomers)}`, color: "green" },
  ];

  const expenseCards: { key: ReconcileCardKey; label: string; value: string; color: string }[] = [
    { key: "expenses", label: "Total Expenses", value: `Rs. ${formatRs(totalExpenses)}`, color: "orange" },
  ];

  const netCards: { key: ReconcileCardKey; label: string; value: string; color: string }[] = [
    { key: "cash-in", label: "Total Cash In", value: `Rs. ${formatRs(totalCashIn)}`, color: "green" },
    { key: "cash-out", label: "Total Cash Out / Expenses", value: `Rs. ${formatRs(totalCashOut)}`, color: "orange" },
  ];

  const cols = activeCard ? columnsMap[activeCard] : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <PageHeader
          title="Day Reconciliation"
          subtitle="End-of-day cash summary for Danish Cattle Feed — Daily Register"
        />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-period", label: "Select Period", icon: CalendarDays },
            { id: "section-income", label: "Income Summary", icon: TrendingUp, iconColor: "text-green-600" },
            { id: "section-breakdown", label: "Credit vs Cash", icon: CreditCard },
            { id: "section-expenses", label: "Expenses Summary", icon: TrendingDown, iconColor: "text-orange-500" },
            { id: "section-net", label: "Net Cash Position", icon: Scale },
            { id: "section-detail", label: "Records Detail", icon: FileText, iconColor: "text-emerald-600" },
          ]}
        />

        {/* ── 1. Select Period ── */}
        <section id="section-period" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 scroll-mt-24">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Select Period
          </h2>

          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "single" | "range")}
            className="flex flex-wrap gap-4 mb-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="single" id="mode-single" />
              <Label htmlFor="mode-single" className="cursor-pointer">Single Day</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="range" id="mode-range" />
              <Label htmlFor="mode-range" className="cursor-pointer">Date Range</Label>
            </div>
          </RadioGroup>

          <div className="flex flex-wrap gap-4">
            {mode === "single" ? (
              <div className="space-y-1.5">
                <Label htmlFor="single-date" className="text-xs text-slate-500">Date</Label>
                <Input id="single-date" type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="w-48" />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="range-from" className="text-xs text-slate-500">From</Label>
                  <Input id="range-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="w-48" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="range-to" className="text-xs text-slate-500">To</Label>
                  <Input id="range-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="w-48" />
                </div>
              </>
            )}
          </div>
        </section>

        {loading ? (
          <div className="space-y-8">
            {/* Income skeleton */}
            <div>
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-7 w-28" />
                  </div>
                ))}
              </div>
            </div>
            {/* Expense skeleton */}
            <div>
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-7 w-28" />
                  </div>
                ))}
              </div>
            </div>
            {/* Balance skeleton */}
            <div>
              <Skeleton className="h-4 w-32 mb-3" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── 2. Income Summary ── */}
            <section id="section-income" className="scroll-mt-24">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Income Summary
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {incomeCards.map((card) => (
                  <ReconcileCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
                ))}
              </div>
            </section>

            {/* ── 3. Credit vs Cash Breakdown ── */}
            <section id="section-breakdown" className="scroll-mt-24">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Credit vs Cash Breakdown
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {breakdownCards.map((card) => (
                  <ReconcileCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
                ))}
              </div>
            </section>

            {/* ── 4. Expenses Summary ── */}
            <section id="section-expenses" className="scroll-mt-24">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Expenses Summary
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {expenseCards.map((card) => (
                  <ReconcileCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
                ))}
              </div>
            </section>

            {/* ── 5. Net Cash Position ── */}
            <section id="section-net" className="scroll-mt-24">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Net Cash Position
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {netCards.map((card) => (
                  <ReconcileCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
                ))}
                {/* Expected Cash in Hand — non-clickable summary card */}
                <div className={cn(
                  "bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] shadow-sm",
                  expectedCashInHand >= 0 ? "border-t-blue-500" : "border-t-orange-500"
                )}>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Expected Cash in Hand
                  </div>
                  <div className={cn("text-2xl font-extrabold text-slate-900 mt-1", expectedCashInHand >= 0 ? "text-blue-600" : "text-orange-600")}>
                    Rs. {formatRs(expectedCashInHand)}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Detail Panel (same pattern as Dashboard) ── */}
            {activeCard && (
              <div id="section-detail" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 scroll-mt-24">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-8 rounded-full", cardColors[
                      [...incomeCards, ...breakdownCards, ...expenseCards, ...netCards].find(c => c.key === activeCard)?.color || "blue"
                    ]?.bg)} />
                    <div>
                      <h3 className="text-base font-bold text-slate-800">{detailLabel}</h3>
                      <p className="text-xs text-slate-400">
                        {detailTotal > 0
                          ? `${detailTotal} record${detailTotal === 1 ? "" : "s"}`
                          : "—"}
                        {detailSearchDebounced.trim() && detailTotal > 0
                          ? ` matching "${detailSearchDebounced.trim()}"`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Download Excel (ALL records) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadAllExcel}
                      disabled={detailDownloading}
                      className="shrink-0"
                    >
                      {detailDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {detailDownloading ? "Downloading..." : "Download Excel (All)"}
                    </Button>
                    <button
                      onClick={() => {
                        setActiveCard(null);
                        setDetailRows([]);
                        setDetailSearchInput("");
                        setDetailSearchDebounced("");
                        setDetailPage(1);
                        setDetailTotal(0);
                        setDetailTotalPages(1);
                        setDetailError("");
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/30">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={detailSearchInput}
                      onChange={(e) => setDetailSearchInput(e.target.value)}
                      placeholder={
                        cardSearchField[activeCard] === "description"
                          ? "Search by description..."
                          : "Search by customer name..."
                      }
                      className="pl-8 h-9"
                    />
                    {detailSearchInput && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                        onClick={() => setDetailSearchInput("")}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                  {detailLoading && (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                      <span className="ml-2 text-sm text-slate-400">Loading...</span>
                    </div>
                  )}
                  {!detailLoading && detailRows.length === 0 && !detailError && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <FileText className="w-10 h-10 mb-2 opacity-40" />
                      <p className="text-sm font-medium">
                        {detailSearchDebounced.trim()
                          ? (cardSearchField[activeCard] === "description"
                              ? `No record found for "${detailSearchDebounced.trim()}".`
                              : `No record for the customer "${detailSearchDebounced.trim()}".`)
                          : "No records found"}
                      </p>
                    </div>
                  )}
                  {!detailLoading && detailError && (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-red-500">
                      <AlertCircle className="w-8 h-8 mb-2 opacity-60" />
                      <p className="text-sm font-medium">{detailError}</p>
                    </div>
                  )}
                  {!detailLoading && !detailError && detailRows.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          {cols.map((col) => (
                            <TableHead
                              key={col.key}
                              className={cn(
                                "text-xs uppercase text-slate-500 font-semibold",
                                col.align === "right" ? "text-right" : "text-left"
                              )}
                            >
                              {col.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRows.map((row, idx) => (
                          <TableRow key={row.id || idx} className="text-sm">
                            {cols.map((col) => (
                              <TableCell
                                key={col.key}
                                className={cn(
                                  "text-slate-700",
                                  col.align === "right" ? "text-right font-medium" : "",
                                  col.key === "balance" && row.balance > 0 ? "text-red-600 font-semibold" : "",
                                  col.key === "balance" && row.balance <= 0 ? "text-green-600" : "",
                                )}
                              >
                                {col.fmt ? col.fmt(row[col.key], row) : String(row[col.key] ?? "—")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Pagination controls */}
                {!detailLoading && detailTotal > 0 && (
                  <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                    <span className="text-xs text-slate-500">
                      Page {detailPage} of {detailTotalPages}
                      {" · "}
                      {detailTotal} record{detailTotal === 1 ? "" : "s"}
                      {detailSearchDebounced.trim() ? ` matching "${detailSearchDebounced.trim()}"` : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detailPage <= 1}
                        onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detailPage >= detailTotalPages}
                        onClick={() => setDetailPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Note ── */}
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/60 rounded-2xl p-4 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <p>
                <span className="font-semibold">Note:</span>{" "}
                &apos;Cash Received&apos; only counts money actually collected.
                Credit sales not yet paid stay on the customer&apos;s Khata balance.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Clickable Reconcile Card (same pattern as Dashboard) ─── */
function ReconcileCard({
  card,
  isActive,
  onClick,
}: {
  card: { key: string; label: string; value: string; color: string };
  isActive: boolean;
  onClick: () => void;
}) {
  const colors = cardColors[card.color] || cardColors.blue;

  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] shadow-sm text-left w-full transition-all duration-200 cursor-pointer group",
        colors.border,
        isActive
          ? "ring-2 ring-emerald-400 ring-offset-1 shadow-md scale-[1.02]"
          : "hover:shadow-md hover:scale-[1.01]"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-600 transition-colors truncate">
            {card.label}
          </div>
          <div className={cn("text-2xl font-extrabold text-slate-900 mt-1 truncate", colors.text)}>
            {card.value}
          </div>
        </div>
        <div className={cn(
          "flex-shrink-0 ml-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200",
          isActive ? "bg-emerald-100 text-emerald-600 rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-500"
        )}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {isActive && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", colors.badge)}>
            Showing details
          </span>
        </div>
      )}
    </button>
  );
}