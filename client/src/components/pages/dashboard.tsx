import { apiFetch } from "@/lib/api";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  FileText, FlaskConical, BookOpen, CheckCircle,
  Package, Settings, Loader2, ChevronDown, ChevronUp, X, Download, AlertTriangle,
  Search, ChevronLeft, ChevronRight,
  TrendingUp, Receipt, Wallet, Users, AlertCircle, BarChart3,
} from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import { QuickNav } from "@/components/shared/quick-nav";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pktToday, pktFormatted } from "@/lib/pkt-date";
import { useDashboardMetrics } from "@/hooks/queries";
import { downloadAllExcelPaged, type Col } from "@/lib/download-excel";

const quickLinks = [
  { label: "Add a Sale / Expense", page: "daily-entry", icon: FileText },
  { label: "Build a Custom Mix Bill", page: "custom-mix", icon: FlaskConical },
  { label: "Check Customer's Khata", page: "customer-khata", icon: BookOpen },
  { label: "Reconcile the Day", page: "reconciliation", icon: CheckCircle },
  { label: "Record a Purchase", page: "purchases-stock", icon: Package },
  { label: "Manage Products & Rates", page: "manage-products", icon: Settings },
];

function formatRs(n: number) {
  return n.toLocaleString("en-PK");
}

interface Metrics {
  salesTodayCount: number;
  billedToday: number;
  cashCollectedToday: number;
  expensesToday: number;
  totalCustomers: number;
  totalOutstanding: number;
  overCreditLimitCount: number;
}

const defaultMetrics: Metrics = {
  salesTodayCount: 0, billedToday: 0, cashCollectedToday: 0, expensesToday: 0,
  totalCustomers: 0, totalOutstanding: 0, overCreditLimitCount: 0,
};

type CardKey = "sales-today" | "billed-today" | "cash-collected" | "expenses-today" | "customers" | "outstanding" | "over-credit";

/* ─── Column definitions for each card type ─── */

const columnsMap: Record<CardKey, Col[]> = {
  "sales-today": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "rate", label: "Rate", align: "right", fmt: (v) => formatRs(v) },
    { key: "fare", label: "Fare", align: "right", fmt: (v) => formatRs(v) },
    { key: "amount", label: "Amount", align: "right", fmt: (v) => formatRs(v) },
  ],
  "billed-today": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "bill", label: "Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash_paid", label: "Cash Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-collected": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "cash", label: "Cash (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
  "expenses-today": [
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount", align: "right", fmt: (v) => formatRs(v) },
  ],
  "customers": [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "phone", label: "Phone" },
    { key: "active", label: "Status", fmt: (v) => v ? "Active" : "Inactive" },
    { key: "credit_limit", label: "Credit Limit", align: "right", fmt: (v) => v ? formatRs(v) : "N/A" },
    { key: "since", label: "Since" },
  ],
  "outstanding": [
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "type", label: "Type" },
    { key: "total_bill", label: "Total Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "paid", label: "Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance Due", align: "right", fmt: (v) => formatRs(v) },
  ],
  "over-credit": [
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "credit_limit", label: "Limit", align: "right", fmt: (v) => formatRs(v) },
    { key: "total_bill", label: "Total Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "paid", label: "Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance Due", align: "right", fmt: (v) => formatRs(v) },
  ],
};

/* ─── Color mapping ─── */
const cardColors: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  blue: { border: "border-t-blue-500", text: "text-blue-600", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  purple: { border: "border-t-purple-500", text: "text-purple-600", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-700" },
  green: { border: "border-t-green-500", text: "text-green-600", bg: "bg-green-50", badge: "bg-green-100 text-green-700" },
  orange: { border: "border-t-orange-500", text: "text-orange-600", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-700" },
};

/* ─── Card label lookup (outside component to avoid reference issues) ─── */
const cardLabels: Record<CardKey, string> = {
  "sales-today": "Sales Today",
  "billed-today": "Billed Today",
  "cash-collected": "Cash Collected",
  "expenses-today": "Expenses Today",
  "customers": "Customers",
  "outstanding": "Total Outstanding / Khata",
  "over-credit": "Over Credit Limit",
};

/* ─── Which cards search by customer name vs description ─── */
const cardSearchField: Record<CardKey, "customer_name" | "description" | null> = {
  "sales-today": "customer_name",
  "billed-today": "customer_name",
  "cash-collected": "customer_name",
  "expenses-today": "description",
  "customers": "customer_name",
  "outstanding": "customer_name",
  "over-credit": "customer_name",
};

const PAGE_SIZE = 10;

export default function Dashboard() {
  const setActivePage = useAppStore((s) => s.setActivePage);
  // React Query hook — replaces useEffect + fetch + setState
  const { data: metrics, isLoading: loading } = useDashboardMetrics();

  // Detail panel state
  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
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

  // Use PKT date — matches server-side pktToday()
  const pktDate = useMemo(() => pktToday(), []);

  const metricsData: Metrics = metrics ?? defaultMetrics;

  // Debounce search input + reset to page 1 on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setDetailSearchDebounced(detailSearchInput);
      setDetailPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [detailSearchInput]);

  const fetchDetails = useCallback(async (cardKey: CardKey) => {
    // If same card clicked, close panel
    if (activeCard === cardKey) {
      setActiveCard(null);
      setDetailRows([]);
      setDetailLabel("");
      setDetailSearchInput("");
      setDetailSearchDebounced("");
      setDetailPage(1);
      setDetailTotal(0);
      setDetailTotalPages(1);
      return;
    }

    setActiveCard(cardKey);
    setDetailSearchInput("");
    setDetailSearchDebounced("");
    setDetailPage(1);
    setDetailLoading(true);
    setDetailRows([]);
    setDetailError("");
    // Set label immediately from card definition (not API) to prevent stale label
    setDetailLabel(cardLabels[cardKey] || cardKey);
    try {
      const params = new URLSearchParams({
        type: cardKey,
        date: pktDate,
        page: "1",
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiFetch(`/api/reports/dashboard/details?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDetailRows(data.rows || []);
        setDetailTotal(data.total ?? 0);
        setDetailTotalPages(data.totalPages ?? 1);
        if (data.label) setDetailLabel(data.label);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Dashboard details API error:", err);
        const errMsg = typeof err.error === 'string' ? err.error : err.error?.message || err.detail || "Failed to load records";
        setDetailError(errMsg);
      }
    } catch (err) {
      console.error("Dashboard details fetch error:", err);
      setDetailRows([]);
      setDetailError("Network error — check your connection");
    } finally {
      setDetailLoading(false);
    }
  }, [activeCard, pktDate]);

  // Refetch when search term or page changes (only if panel is open)
  useEffect(() => {
    if (!activeCard) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const params = new URLSearchParams({
          type: activeCard,
          date: pktDate,
          page: String(detailPage),
          pageSize: String(PAGE_SIZE),
        });
        const searchField = cardSearchField[activeCard];
        if (searchField && detailSearchDebounced.trim()) {
          params.set(searchField, detailSearchDebounced.trim());
        }
        const res = await apiFetch(`/api/reports/dashboard/details?${params.toString()}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setDetailRows(data.rows || []);
          setDetailTotal(data.total ?? 0);
          setDetailTotalPages(data.totalPages ?? 1);
          if (data.label) setDetailLabel(data.label);
        } else {
          const err = await res.json().catch(() => ({}));
          const errMsg = typeof err.error === 'string' ? err.error : err.error?.message || err.detail || "Failed to load records";
          setDetailError(errMsg);
          setDetailRows([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Dashboard details refetch error:", err);
          setDetailRows([]);
          setDetailError("Network error — check your connection");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCard, detailPage, detailSearchDebounced, pktDate]);

  // Download ALL records as Excel — walks server-side pages transparently
  const handleDownloadAllExcel = async () => {
    if (!activeCard) return;
    setDetailDownloading(true);
    try {
      const baseParams: Record<string, string> = {
        type: activeCard,
        date: pktDate,
      };
      const searchField = cardSearchField[activeCard];
      // For download, intentionally DO NOT include the search filter — user wants
      // every record for the date in the workbook, not just the current search.
      await downloadAllExcelPaged(
        "/api/reports/dashboard/details",
        baseParams,
        cols,
        detailLabel,
      );
    } catch (err: any) {
      console.error("Excel download failed:", err);
      alert(err?.message || "Excel download failed. Please try again.");
    } finally {
      setDetailDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          {/* Header skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          {/* Primary metrics skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] border-t-slate-200 shadow-sm">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-7 w-32" />
              </div>
            ))}
          </div>
          {/* Secondary metrics skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] border-t-slate-200 shadow-sm">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-7 w-32" />
              </div>
            ))}
          </div>
          {/* Quick links skeleton */}
          <div>
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-11 w-11 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cards: { key: CardKey; label: string; value: string; color: string }[] = [
    { key: "sales-today", label: "Sales Today", value: `${metricsData.salesTodayCount} txns`, color: "blue" },
    { key: "billed-today", label: "Billed Today", value: formatRs(metricsData.billedToday), color: "purple" },
    { key: "cash-collected", label: "Cash Collected", value: formatRs(metricsData.cashCollectedToday), color: "green" },
    { key: "expenses-today", label: "Expenses Today", value: formatRs(metricsData.expensesToday), color: "orange" },
    { key: "customers", label: "Customers", value: `${metricsData.totalCustomers}`, color: "blue" },
    { key: "outstanding", label: "Total Outstanding / Khata", value: formatRs(metricsData.totalOutstanding), color: "purple" },
    { key: "over-credit", label: "Over Credit Limit", value: `${metricsData.overCreditLimitCount} cust.`, color: "orange" },
  ];

  const cols = activeCard ? columnsMap[activeCard] : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              Daily Register — {pktFormatted(new Date(), { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-primary-metrics", label: "Today's Summary", icon: BarChart3 },
            { id: "section-secondary-metrics", label: "Customers & Khata", icon: Users },
            { id: "section-detail-panel", label: "Records Detail", icon: Receipt, iconColor: "text-emerald-600" },
            { id: "section-quick-actions", label: "Quick Actions", icon: FileText },
          ]}
        />

        {/* ── Primary Metrics ── */}
        <div id="section-primary-metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 scroll-mt-24">
          {cards.slice(0, 4).map((card) => (
            <DashboardCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
          ))}
        </div>

        {/* ── Secondary Metrics ── */}
        <div id="section-secondary-metrics" className="grid grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-24">
          {cards.slice(4).map((card) => (
            <DashboardCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
          ))}
        </div>

        {/* ── Detail Panel ── */}
        {activeCard && (
          <div id="section-detail-panel" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 scroll-mt-24">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-8 rounded-full", cardColors[cards.find(c => c.key === activeCard)?.color || "blue"]?.bg)} />
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

            {/* Panel Body */}
            <div className="max-h-[420px] overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="ml-2 text-sm text-slate-400">Loading...</span>
                </div>
              ) : detailRows.length === 0 && !detailError ? (
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
              ) : detailError ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-red-500">
                  <AlertTriangle className="w-8 h-8 mb-2 opacity-60" />
                  <p className="text-sm font-medium">{detailError}</p>
                </div>
              ) : (
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

        {/* ── Quick Links ── */}
        <section id="section-quick-actions" className="scroll-mt-24">
          <h2 className="text-lg font-bold text-slate-700 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.page}
                  onClick={() => setActivePage(link.page)}
                  className="group flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-200
                             hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer text-left w-full"
                >
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-50 group-hover:bg-primary/10 transition-colors shrink-0">
                    <Icon className="w-5 h-5 text-slate-500 group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{link.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Clickable Metric Card ─── */
function DashboardCard({
  card,
  isActive,
  onClick,
}: {
  card: { key: CardKey; label: string; value: string; color: string };
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