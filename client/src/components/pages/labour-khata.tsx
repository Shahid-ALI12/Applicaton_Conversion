import { apiFetch } from "@/lib/api";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { LocationSelect } from "@/components/shared/location-select";
import { apiError } from "@/store";
import type {
  Labour,
  LabourPayment,
  LabourPaymentType,
  LabourDailyWage,
  LabourMonthlySummary,
  LabourPaymentStatus,
  Location,
} from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  HardHat,
  Plus,
  Loader2,
  UserPlus,
  Wallet,
  TrendingDown,
  Trash2,
  Phone,
  Briefcase,
  Users,
  Calendar,
  IndianRupee,
  AlertCircle,
  Save,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  BarChart3,
  Download,
  Search as SearchIcon,
  Pencil,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import { cn } from "@/lib/utils";

// ─── Constants ───

const PAYMENT_TYPES: { value: LabourPaymentType; label: string; color: string }[] = [
  { value: "salary",  label: "Salary",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "advance", label: "Advance", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expense", label: "Expense", color: "bg-blue-100 text-blue-700 border-blue-200" },
];

const ROLE_PRESETS = ["Mazdoor", "Driver", "Loader", "Packing", "Guard", "Other"];

// Project-wide default location = Shop (id=2). Kept in sync with
// src/lib/data/locations.ts → DEFAULT_LOCATION_ID.
const DEFAULT_LOCATION_ID = 2;

// ─── Helpers ───

const fmt = (n: number) => Number(n || 0).toLocaleString("en-PK");

const typeBadge = (t: LabourPaymentType) =>
  PAYMENT_TYPES.find((p) => p.value === t) || PAYMENT_TYPES[0];

/** Build YYYY-MM month string from a YYYY-MM-DD date. */
const monthOf = (dateStr: string): string => (dateStr || "").slice(0, 7);

/** Current PKT month as YYYY-MM. */
const currentMonth = (): string => monthOf(pktToday());

// ─── Page ───

export default function LabourKhataPage() {
  const today = pktToday();

  // ─── Locations state ───
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  // ─── Labours state ───
  const [labours, setLabours] = useState<Labour[]>([]);
  const [loadingLabours, setLoadingLabours] = useState(true);

  // ─── New labour form ───
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newWage, setNewWage] = useState("");
  // Default to Shop (project-wide default). Pre-set here so the
  // location select shows the right value on first paint.
  const [newLocationId, setNewLocationId] = useState<number>(DEFAULT_LOCATION_ID);
  const [savingLabour, setSavingLabour] = useState(false);

  // ─── Edit labour dialog ───
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editWage, setEditWage] = useState("");
  const [editLocationId, setEditLocationId] = useState<number>(DEFAULT_LOCATION_ID);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Payment form ───
  const [payLabourId, setPayLabourId] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(today);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payType, setPayType] = useState<LabourPaymentType>("salary");
  const [payDesc, setPayDesc] = useState<string>("");
  const [savingPayment, setSavingPayment] = useState(false);

  // ─── Payments state ───
  const [payments, setPayments] = useState<LabourPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  // ─── Filter state (payments history) ───
  const [filterLabourId, setFilterLabourId] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  // Labours list filter — 0 means "All Locations"
  const [filterLocationId, setFilterLocationId] = useState<number>(0);
  // Payments history location filter — 0 means "All Locations"
  const [filterPaymentLocationId, setFilterPaymentLocationId] = useState<number>(0);

  // ─── Locations loader ───
  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const res = await apiFetch("/api/locations");
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load locations");
        throw new Error(detail);
      }
      const data = await res.json();
      const locs: Location[] = data.locations || [];
      setLocations(locs);
      // Make sure the new-labour default matches a real location id.
      if (locs.length > 0 && !locs.some((l) => l.id === newLocationId)) {
        setNewLocationId(locs[0].id);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load locations");
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  // ─── Payment History text search (client-side, debounced) ───
  const [paymentSearchInput, setPaymentSearchInput] = useState("");
  const [paymentSearchDebounced, setPaymentSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPaymentSearchDebounced(paymentSearchInput), 350);
    return () => clearTimeout(t);
  }, [paymentSearchInput]);

  // ─── Daily wage entry state ───
  const [wageEntryDate, setWageEntryDate] = useState<string>(today);
  // Per-labour wage amount input (string because user can clear/empty it).
  // labour_id → { amount: string, notes: string }
  const [wageEntries, setWageEntries] = useState<Record<number, { amount: string; notes: string }>>({});
  const [loadingWagesForDate, setLoadingWagesForDate] = useState(false);
  const [savingWages, setSavingWages] = useState(false);

  // ─── Monthly summary state ───
  const [summaryMonth, setSummaryMonth] = useState<string>(currentMonth());
  const [monthlySummaries, setMonthlySummaries] = useState<Array<LabourMonthlySummary & { labour: Labour }>>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // ─── Excel download state (Payment History) ───
  const [downloadingPaymentsExcel, setDownloadingPaymentsExcel] = useState(false);

  // ─── Excel download handler (Payment History) ───
  // Fetches /api/labour-payments with current filters and produces an .xlsx
  // workbook of every matching record.
  const handleDownloadPaymentsExcel = useCallback(async () => {
    setDownloadingPaymentsExcel(true);
    try {
      const { downloadExcel } = await import("@/lib/download-excel");
      const params = new URLSearchParams();
      if (filterLabourId && filterLabourId !== "all") {
        params.set("labour_id", filterLabourId);
      }
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      params.set("include_labour", "true");
      const res = await apiFetch(`/api/labour-payments?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch payments");
      const body = await res.json();
      const all: Record<string, any>[] = Array.isArray(body?.payments) ? body.payments : [];
      if (all.length === 0) {
        toast.error("No payments to download for the current filters");
        return;
      }
      // Build a labour id→name map so we can render the labour name column
      // even for rows where the API didn't include the joined labours object.
      const labourNameMap = new Map<number, string>(
        labours.map((l) => [l.id, l.name]),
      );
      await downloadExcel(all, [
        { key: "payment_date", label: "Date" },
        {
          key: "labour_id",
          label: "Labour",
          fmt: (_v: any, row: any) =>
            row.labours?.name ||
            labourNameMap.get(row.labour_id) ||
            `#${row.labour_id}`,
        },
        { key: "payment_type", label: "Type" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount (Rs.)", align: "right" },
        { key: "entered_by", label: "Entered By" },
        { key: "created_at", label: "Created At" },
      ], "labour-payments");
      toast.success(`Labour payments Excel downloaded (${all.length} records)`);
    } catch (e: any) {
      toast.error(e?.message || "Excel download failed");
    } finally {
      setDownloadingPaymentsExcel(false);
    }
  }, [filterLabourId, filterFrom, filterTo, labours]);

  // ─── Data loaders ───

  const loadLabours = useCallback(async () => {
    setLoadingLabours(true);
    try {
      // Always include location join so the table can render the
      // location column without an extra round-trip.
      const params = new URLSearchParams();
      params.set("include_location", "true");
      if (filterLocationId && filterLocationId > 0) {
        params.set("location_id", String(filterLocationId));
      }
      const res = await apiFetch(`/api/labours?${params.toString()}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load labours");
        throw new Error(detail);
      }
      const data = await res.json();
      setLabours(data.labours || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load labours");
    } finally {
      setLoadingLabours(false);
    }
  }, [filterLocationId]);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams();
      if (filterLabourId && filterLabourId !== "all") {
        params.set("labour_id", filterLabourId);
      }
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo)   params.set("to", filterTo);
      if (filterPaymentLocationId && filterPaymentLocationId > 0) {
        params.set("location_id", String(filterPaymentLocationId));
      }
      params.set("include_labour", "true");

      const res = await apiFetch(`/api/labour-payments?${params.toString()}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load payments");
        throw new Error(detail);
      }
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load payments");
    } finally {
      setLoadingPayments(false);
    }
  }, [filterLabourId, filterFrom, filterTo, filterPaymentLocationId]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  /**
   * Load any existing daily-wage entries for the selected wage entry date.
   * Pre-fills the input fields so the user can review/edit rather than
   * accidentally create duplicates. For labours with no entry on that
   * date, fall back to their default `daily_wage` (so the user can just
   * click "Save All" without re-typing everyday).
   */
  const loadWagesForDate = useCallback(async (date: string, fallbackLabours: Labour[]) => {
    if (!date) return;
    setLoadingWagesForDate(true);
    try {
      const res = await apiFetch(`/api/labour-daily-wages?wage_date=${date}&include_labour=true`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load existing wages");
        throw new Error(detail);
      }
      const data = await res.json();
      const existing: LabourDailyWage[] = data.wages || [];
      const map: Record<number, { amount: string; notes: string }> = {};
      // Start with default daily_wage for ALL labours (so empty dates don't
      // show blank inputs — user can save defaults directly or override).
      fallbackLabours.forEach((l) => {
        map[l.id] = {
          amount: l.daily_wage > 0 ? String(l.daily_wage) : "",
          notes: "",
        };
      });
      // Then overwrite with any existing entries for this date
      existing.forEach((w) => {
        map[w.labour_id] = {
          amount: String(w.amount ?? ""),
          notes: w.notes || "",
        };
      });
      setWageEntries(map);
    } catch (e: any) {
      // Non-fatal — user can still type fresh values
      console.error(e);
    } finally {
      setLoadingWagesForDate(false);
    }
  }, []);

  const loadMonthlySummary = useCallback(async (month: string) => {
    if (!month) return;
    setLoadingSummary(true);
    try {
      const res = await apiFetch(`/api/labour-monthly-summary?month=${month}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load monthly summary");
        throw new Error(detail);
      }
      const data = await res.json();
      setMonthlySummaries(data.summaries || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load monthly summary");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadLabours();
  }, [loadLabours]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // When wageEntryDate OR labours list changes, reload wage entries for that
  // date. On a fresh date with no existing entries, labours' default
  // daily_wage is used as the pre-fill (handled inside loadWagesForDate).
  useEffect(() => {
    loadWagesForDate(wageEntryDate, labours);
  }, [wageEntryDate, labours, loadWagesForDate]);

  useEffect(() => {
    loadMonthlySummary(summaryMonth);
  }, [summaryMonth, loadMonthlySummary]);

  // ─── Derived ───

  const activeLabours = useMemo(
    () => labours.filter((l) => l.is_active),
    [labours]
  );

  const laboursById = useMemo(() => {
    const m = new Map<number, Labour>();
    labours.forEach((l) => m.set(l.id, l));
    return m;
  }, [labours]);

  // Total paid per labour (from filtered payments — same as before)
  const totalPaidByLabour = useMemo(() => {
    const m = new Map<number, number>();
    payments.forEach((p) => {
      m.set(p.labour_id, (m.get(p.labour_id) || 0) + Number(p.amount));
    });
    return m;
  }, [payments]);

  // Map location_id → location name (for cheap lookups in render)
  const locationsById = useMemo(() => {
    const m = new Map<number, Location>();
    locations.forEach((l) => m.set(l.id, l));
    return m;
  }, [locations]);

  // Resolve a labour's location name from either the joined row or the
  // locations map. Returns "—" if no location is set.
  const labourLocationName = useCallback(
    (labour: Labour | undefined | null): string => {
      if (!labour) return "—";
      // Prefer the joined row from the API
      if (labour.locations?.name) return labour.locations.name;
      if (labour.location_id != null) {
        return locationsById.get(labour.location_id)?.name || "—";
      }
      return "—";
    },
    [locationsById]
  );

  const grandTotal = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );

  // ── Filtered payments (text search across labour name / description / type / date) ──
  const filteredPayments = useMemo(() => {
    if (!paymentSearchDebounced.trim()) return payments;
    const q = paymentSearchDebounced.trim().toLowerCase();
    return payments.filter((p) => {
      const labourName = p.labours?.name || laboursById.get(p.labour_id)?.name || "";
      return [
        labourName,
        p.payment_date ?? "",
        p.payment_type ?? "",
        p.description ?? "",
        p.entered_by ?? "",
        String(p.amount),
      ].some((s) => s.toLowerCase().includes(q));
    });
  }, [payments, paymentSearchDebounced, laboursById]);

  const filteredGrandTotal = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    [filteredPayments]
  );

  const todaysTotal = useMemo(
    () =>
      payments
        .filter((p) => p.payment_date === today)
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payments, today]
  );

  // Monthly summary aggregates (for the metrics row)
  const monthEarnedTotal = useMemo(
    () => monthlySummaries.reduce((s, x) => s + x.total_earned, 0),
    [monthlySummaries]
  );
  const monthPaidTotal = useMemo(
    () => monthlySummaries.reduce((s, x) => s + x.total_paid, 0),
    [monthlySummaries]
  );
  const monthBalanceTotal = useMemo(
    () => monthlySummaries.reduce((s, x) => s + x.balance_due, 0),
    [monthlySummaries]
  );

  // ─── Handlers ───

  const handleAddLabour = async () => {
    if (!newName.trim()) {
      toast.error("Labour name is required");
      return;
    }
    const wage = newWage ? Number(newWage) : 0;
    if (newWage && (!Number.isFinite(wage) || wage < 0)) {
      toast.error("Daily wage must be a non-negative number");
      return;
    }
    if (!newLocationId || newLocationId <= 0) {
      toast.error("Please select a location (Shop / Farmhouse)");
      return;
    }
    setSavingLabour(true);
    try {
      const res = await apiFetch("/api/labours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          role: newRole.trim() || null,
          daily_wage: wage,
          location_id: newLocationId,
        }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to register labour");
        throw new Error(detail);
      }
      toast.success(`Registered: ${newName.trim()}`);
      setNewName("");
      setNewPhone("");
      setNewRole("");
      setNewWage("");
      // Keep newLocationId as-is so the user can quickly register
      // another labour at the same location.
      await loadLabours();
      await loadMonthlySummary(summaryMonth);
    } catch (e: any) {
      toast.error(e.message || "Failed to register labour");
    } finally {
      setSavingLabour(false);
    }
  };

  // Open the edit dialog pre-filled with the labour's current values.
  const openEdit = (labour: Labour) => {
    setEditId(labour.id);
    setEditName(labour.name || "");
    setEditPhone(labour.phone || "");
    setEditRole(labour.role || "");
    setEditWage(labour.daily_wage != null ? String(labour.daily_wage) : "");
    setEditLocationId(labour.location_id ?? DEFAULT_LOCATION_ID);
    setEditActive(!!labour.is_active);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (editId == null) return;
    if (!editName.trim()) {
      toast.error("Labour name is required");
      return;
    }
    const wage = editWage ? Number(editWage) : 0;
    if (editWage && (!Number.isFinite(wage) || wage < 0)) {
      toast.error("Daily wage must be a non-negative number");
      return;
    }
    if (!editLocationId || editLocationId <= 0) {
      toast.error("Please select a location (Shop / Farmhouse)");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await apiFetch("/api/labours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          name: editName.trim(),
          phone: editPhone.trim() || null,
          role: editRole.trim() || null,
          daily_wage: wage,
          location_id: editLocationId,
          is_active: editActive,
        }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to update labour");
        throw new Error(detail);
      }
      toast.success(`Updated: ${editName.trim()}`);
      setEditOpen(false);
      await loadLabours();
    } catch (e: any) {
      toast.error(e.message || "Failed to update labour");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (labour: Labour) => {
    try {
      const res = await apiFetch("/api/labours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: labour.id, is_active: !labour.is_active }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to update labour");
        throw new Error(detail);
      }
      toast.success(labour.is_active
        ? `${labour.name} deactivated`
        : `${labour.name} re-activated`);
      await loadLabours();
    } catch (e: any) {
      toast.error(e.message || "Failed to update labour");
    }
  };

  const handleAddPayment = async () => {
    if (!payLabourId) {
      toast.error("Select a labour first");
      return;
    }
    if (!payDate) {
      toast.error("Pick a payment date");
      return;
    }
    const amt = Number(payAmount);
    if (!payAmount || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    setSavingPayment(true);
    try {
      const res = await apiFetch("/api/labour-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labour_id: Number(payLabourId),
          payment_date: payDate,
          amount: amt,
          payment_type: payType,
          description: payDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to add payment");
        throw new Error(detail);
      }
      const labour = laboursById.get(Number(payLabourId));
      toast.success(
        `Added Rs. ${fmt(amt)} (${payType}) for ${labour?.name || "labour"}`
      );
      setPayAmount("");
      setPayDesc("");
      await loadPayments();
      // Refresh monthly summary too — paid amount changed
      await loadMonthlySummary(summaryMonth);
    } catch (e: any) {
      toast.error(e.message || "Failed to add payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (id: number) => {
    if (!confirm("Delete this payment? This cannot be undone.")) return;
    try {
      const res = await apiFetch(`/api/labour-payments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to delete payment");
        throw new Error(detail);
      }
      toast.success("Payment deleted");
      await loadPayments();
      await loadMonthlySummary(summaryMonth);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete payment");
    }
  };

  /**
   * Save all daily-wage entries for the selected date in one go.
   * Uses upsert=true so re-submitting a date updates existing rows
   * instead of erroring on the unique (labour_id, wage_date) constraint.
   *
   * Labours with empty/zero amount are SKIPPED (no row created).
   */
  const handleSaveAllWages = async () => {
    if (!wageEntryDate) {
      toast.error("Pick a date first");
      return;
    }
    if (activeLabours.length === 0) {
      toast.error("No active labours to record wages for");
      return;
    }

    // Build the list of entries to save (skip empty/zero)
    const toSave: Array<{ labour_id: number; amount: number; notes: string; labour_name: string }> = [];
    for (const l of activeLabours) {
      const entry = wageEntries[l.id];
      if (!entry) continue;
      const amt = Number(entry.amount);
      if (!entry.amount || !Number.isFinite(amt) || amt <= 0) continue;
      toSave.push({
        labour_id: l.id,
        amount: amt,
        notes: entry.notes?.trim() || "",
        labour_name: l.name,
      });
    }

    if (toSave.length === 0) {
      toast.error("Enter at least one wage amount to save");
      return;
    }

    setSavingWages(true);
    try {
      // Fire all upserts in parallel
      const results = await Promise.allSettled(
        toSave.map((entry) =>
          fetch("/api/labour-daily-wages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              labour_id: entry.labour_id,
              wage_date: wageEntryDate,
              amount: entry.amount,
              notes: entry.notes || null,
              upsert: true,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const detail = await apiError(res, "Failed to save wage");
              throw new Error(detail);
            }
            return res.json();
          })
        )
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.filter((r) => r.status === "rejected").length;

      if (fail === 0) {
        toast.success(`Saved ${ok} wage entr${ok === 1 ? "y" : "ies"} for ${wageEntryDate}`);
      } else if (ok === 0) {
        toast.error(`Failed to save all ${fail} entries`);
      } else {
        toast.warning(`Saved ${ok}, failed ${fail}. Check console for details.`);
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(`Failed for ${toSave[i].labour_name}:`, r.reason);
          }
        });
      }

      // Refresh monthly summary (earned amounts changed)
      await loadMonthlySummary(summaryMonth);
    } catch (e: any) {
      toast.error(e.message || "Failed to save wages");
    } finally {
      setSavingWages(false);
    }
  };

  // ─── Render ───

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labours Khata"
        subtitle="Daily wage entry · Monthly summary · Salary / advance / expense tracking"
      />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-metrics", label: "Overview", icon: BarChart3 },
          { id: "section-register", label: "Register New Labour", icon: UserPlus, iconColor: "text-emerald-600" },
          { id: "section-daily-wage", label: "Daily Wage Entry", icon: CalendarDays, iconColor: "text-blue-600" },
          { id: "section-add-payment", label: "Add Payment", icon: Wallet, iconColor: "text-amber-600" },
          { id: "section-history", label: "Payment History", icon: Calendar },
        ]}
      />

      {/* ─── Metrics row ─── */}
      <div id="section-metrics" className="grid grid-cols-2 md:grid-cols-4 gap-3 scroll-mt-24">
        <MetricCard
          label="Total Labours"
          value={labours.length}
          color="blue"
          icon={Users}
          iconColor="bg-blue-100"
        />
        <MetricCard
          label="Active"
          value={activeLabours.length}
          color="green"
          icon={HardHat}
          iconColor="bg-emerald-100"
        />
        <MetricCard
          label={`Earned (${summaryMonth})`}
          value={`Rs. ${fmt(monthEarnedTotal)}`}
          color="purple"
          icon={CalendarDays}
          iconColor="bg-purple-100"
        />
        <MetricCard
          label={`Balance Due (${summaryMonth})`}
          value={`Rs. ${fmt(monthBalanceTotal)}`}
          color="orange"
          icon={Wallet}
          iconColor="bg-amber-100"
        />
      </div>

      {/* ─── Section 1: Register new labour ─── */}
      <Card id="section-register" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="size-5 text-emerald-600" /> Register New Labour
          </CardTitle>
          <CardDescription>
            Add a new labour to your khata. Pick the location (Shop / Farmhouse)
            this labour works at — you can change it later via Edit. Once
            registered, you can record daily wages and payments for them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. Raza Khan"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Phone
              </Label>
              <Input
                placeholder="03xx-xxxxxxx"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Role / Skill
              </Label>
              <Input
                placeholder="e.g. Mazdoor"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                list="role-presets"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
              <datalist id="role-presets">
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Daily Wage (Rs.)
              </Label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={newWage}
                onChange={(e) => setNewWage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Location <span className="text-red-500">*</span>
              </Label>
              <LocationSelect
                value={newLocationId}
                onChange={setNewLocationId}
                className="w-full"
              />
            </div>
          </div>

          <Button
            onClick={handleAddLabour}
            disabled={savingLabour}
            className="w-full mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {savingLabour ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Plus className="size-4" /> Register Labour
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ─── Section 2: Daily Wage Entry (NEW) ─── */}
      <Card id="section-daily-wage" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="size-5 text-blue-600" /> Daily Wage Entry
          </CardTitle>
          <CardDescription>
            Har labour ka din ka wage likhein. Yeh amount pooray month ke liye
            add hota jaata hai (kharcha side nahi — sirf kamai). Agar kisi labour
            ne kaam nahi kiya, us ka amount khaali chhor dein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeLabours.length === 0 ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertCircle className="size-4 text-amber-600" />
              <AlertDescription>
                No active labours. Register a labour above first.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Date picker */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Wage Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={wageEntryDate}
                    onChange={(e) => setWageEntryDate(e.target.value)}
                    max={today}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWageEntryDate(today)}
                  className="h-9"
                >
                  Today
                </Button>
                {loadingWagesForDate && (
                  <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" /> Loading existing…
                  </span>
                )}
              </div>

              {/* Bulk entry table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase text-slate-500 font-semibold">
                      <th className="px-3 py-2.5">Labour</th>
                      <th className="px-3 py-2.5">Role</th>
                      <th className="px-3 py-2.5 text-right">Default Wage</th>
                      <th className="px-3 py-2.5 text-right">Today&apos;s Wage (Rs.)</th>
                      <th className="px-3 py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeLabours.map((l) => {
                      const entry = wageEntries[l.id] || { amount: "", notes: "" };
                      const isOverridden =
                        entry.amount !== "" &&
                        l.daily_wage > 0 &&
                        Number(entry.amount) !== l.daily_wage;
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {l.name}
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-xs">
                            {l.role || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500 text-xs">
                            Rs. {fmt(l.daily_wage)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="10"
                              placeholder="0"
                              value={entry.amount}
                              onChange={(e) =>
                                setWageEntries((prev) => ({
                                  ...prev,
                                  [l.id]: { ...entry, amount: e.target.value },
                                }))
                              }
                              className={cn(
                                "h-8 text-right font-mono w-28 ml-auto",
                                isOverridden && "border-amber-400 bg-amber-50"
                              )}
                            />
                            {isOverridden && (
                              <div className="text-[10px] text-amber-600 mt-0.5 text-right">
                                overridden
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              placeholder="optional"
                              value={entry.notes}
                              onChange={(e) =>
                                setWageEntries((prev) => ({
                                  ...prev,
                                  [l.id]: { ...entry, notes: e.target.value },
                                }))
                              }
                              className="h-8 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Save all + helper summary */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {(() => {
                    const filled = activeLabours.filter((l) => {
                      const e = wageEntries[l.id];
                      return e && e.amount && Number(e.amount) > 0;
                    }).length;
                    const total = activeLabours.reduce((s, l) => {
                      const e = wageEntries[l.id];
                      return s + (e && e.amount ? Number(e.amount) : 0);
                    }, 0);
                    return (
                      <>
                        <span className="font-semibold text-slate-700">{filled}</span>
                        {" / "}
                        {activeLabours.length} labours ·{" "}
                        <span className="font-semibold text-slate-700">
                          Rs. {fmt(total)}
                        </span>{" "}
                        total for {wageEntryDate}
                      </>
                    );
                  })()}
                </div>
                <Button
                  onClick={handleSaveAllWages}
                  disabled={savingWages}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {savingWages ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="size-4" /> Save All Wages
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 3: All Labours — Monthly Summary (MODIFIED) ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <HardHat className="size-5 text-slate-600" /> All Labours
                <Badge variant="outline" className="ml-1">
                  {labours.length}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Har labour ka mahine ka kamai, adaaigi aur baqi. Status:
                <span className="font-medium text-slate-600"> Not Paid</span> agar
                kuch bhi nahi diya, warna
                <span className="font-medium text-emerald-700"> Paid</span> + amount
                + baki.
              </CardDescription>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Month
              </Label>
              <Input
                type="month"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
                max={currentMonth()}
                className="w-[160px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Location filter row */}
          <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/40">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Filter by Location
              </Label>
              <LocationSelect
                value={filterLocationId}
                onChange={(v) => setFilterLocationId(v)}
                showAllOption
                className="w-48"
              />
            </div>
            {filterLocationId !== 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setFilterLocationId(0)}
              >
                Clear
              </Button>
            )}
            <div className="ml-auto text-xs text-slate-500">
              Showing {labours.length} labour{labours.length === 1 ? "" : "s"}
              {filterLocationId !== 0 && locationsById.get(filterLocationId)
                ? ` at ${locationsById.get(filterLocationId)?.name}`
                : " (all locations)"}
            </div>
          </div>

          {loadingLabours || loadingSummary ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-100">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : labours.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No labours registered yet
              {filterLocationId !== 0 ? " at this location." : "."} Use the form
              above to add your first labour.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-y border-slate-100">
                  <tr className="text-left text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3 text-right">Daily Wage</th>
                    <th className="px-4 py-3 text-right">Earned ({summaryMonth})</th>
                    <th className="px-4 py-3 text-right">Paid ({summaryMonth})</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Balance Due</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labours.map((l) => {
                    // Find the matching summary entry
                    const summary = monthlySummaries.find((s) => s.labour_id === l.id);
                    const earned = summary?.total_earned ?? 0;
                    const paid = summary?.total_paid ?? 0;
                    const balance = summary?.balance_due ?? 0;
                    const status: LabourPaymentStatus = summary?.status ?? "not_paid";
                    const isActive = l.is_active;
                    const total = totalPaidByLabour.get(l.id) || 0;
                    const locName = labourLocationName(l);
                    const hasLocation = locName !== "—";
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "hover:bg-slate-50/50",
                          !isActive && "opacity-50"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{l.name}</div>
                          {l.role && (
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Briefcase className="size-3" /> {l.role}
                              {l.phone && (
                                <>
                                  <span className="mx-1 text-slate-300">·</span>
                                  <Phone className="size-3" /> {l.phone}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasLocation ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "border",
                                locName.toLowerCase() === "shop"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              )}
                            >
                              <MapPin className="size-3 mr-1" /> {locName}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          Rs. {fmt(l.daily_wage)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          Rs. {fmt(earned)}
                          {summary && summary.wage_count > 0 && (
                            <div className="text-[10px] text-slate-400">
                              {summary.wage_count} {summary.wage_count === 1 ? "day" : "days"}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          Rs. {fmt(paid)}
                          {summary && summary.payment_count > 0 && (
                            <div className="text-[10px] text-slate-400">
                              {summary.payment_count} {summary.payment_count === 1 ? "pmt" : "pmts"}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {status === "paid" ? (
                            <Badge className="border bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1">
                              <CircleCheck className="size-3" /> Paid
                            </Badge>
                          ) : (
                            <Badge className="border bg-slate-100 text-slate-600 border-slate-200 inline-flex items-center gap-1">
                              <CircleDashed className="size-3" /> Not Paid
                            </Badge>
                          )}
                          <div
                            className={cn(
                              "text-[10px] mt-0.5",
                              isActive ? "text-emerald-600" : "text-slate-400"
                            )}
                          >
                            {isActive ? "labour active" : "inactive"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          <span
                            className={cn(
                              "font-semibold",
                              balance > 0
                                ? "text-red-600"
                                : balance < 0
                                ? "text-emerald-600"
                                : "text-slate-700"
                            )}
                          >
                            Rs. {fmt(balance)}
                          </span>
                          {balance > 0 && (
                            <div className="text-[10px] text-slate-400">baaqi</div>
                          )}
                          {balance < 0 && (
                            <div className="text-[10px] text-emerald-500">extra diya</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => openEdit(l)}
                            >
                              <Pencil className="size-3.5 mr-1" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => handleToggleActive(l)}
                            >
                              {isActive ? "Deactivate" : "Re-activate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs uppercase text-slate-500 font-semibold">
                      Total ({summaryMonth})
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      Rs. {fmt(monthEarnedTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      Rs. {fmt(monthPaidTotal)}
                    </td>
                    <td />
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      Rs. {fmt(monthBalanceTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 4: Add payment ─── */}
      <Card id="section-add-payment" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="size-5 text-amber-600" /> Add Payment / Salary / Advance
          </CardTitle>
          <CardDescription>
            Labour ko paisa diya (salary, advance, ya expense). Yeh
            <span className="font-medium"> &quot;Paid&quot;</span> amount mein
            add hota hai. Mahine ke baad total earned se total paid minus karke
            baqi nikalta hai.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeLabours.length === 0 ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertCircle className="size-4 text-amber-600" />
              <AlertDescription>
                No active labours. Register a labour above first, then come back here.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Labour <span className="text-red-500">*</span>
                  </Label>
                  <Select value={payLabourId} onValueChange={setPayLabourId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select labour" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLabours.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.name}
                          {l.role ? ` · ${l.role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    max={today}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Amount (Rs.) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    placeholder="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Type
                  </Label>
                  <Select
                    value={payType}
                    onValueChange={(v) => setPayType(v as LabourPaymentType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Notes
                  </Label>
                  <Input
                    placeholder="optional"
                    value={payDesc}
                    onChange={(e) => setPayDesc(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleAddPayment}
                disabled={savingPayment}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
              >
                {savingPayment ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Plus className="size-4" /> Record Payment
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 5: Filter + History ─── */}
      <Card id="section-history" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="size-5 text-slate-600" /> Payment History
              </CardTitle>
              <CardDescription className="mt-1">
                {paymentSearchDebounced.trim()
                  ? `${filteredPayments.length} of ${payments.length} payment(s) match "${paymentSearchDebounced.trim()}" • Total Rs. ${fmt(filteredGrandTotal)}`
                  : `Filter by labour and/or date range. Showing ${payments.length} payment(s) totalling Rs. ${fmt(grandTotal)}.`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPaymentsExcel}
              disabled={downloadingPaymentsExcel || payments.length === 0}
              className="shrink-0 self-start sm:self-auto"
            >
              {downloadingPaymentsExcel ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="size-4 mr-1.5" />
              )}
              {downloadingPaymentsExcel ? "Downloading..." : "Download Excel"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-200/60">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Labour
              </Label>
              <Select value={filterLabourId} onValueChange={setFilterLabourId}>
                <SelectTrigger>
                  <SelectValue placeholder="All labours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All labours</SelectItem>
                  {labours.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                      {l.locations?.name ? ` · ${l.locations.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Location
              </Label>
              <LocationSelect
                value={filterPaymentLocationId}
                onChange={(v) => setFilterPaymentLocationId(v)}
                showAllOption
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                From Date
              </Label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                max={filterTo || today}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                To Date
              </Label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                min={filterFrom}
                max={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Search
              </Label>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={paymentSearchInput}
                  onChange={(e) => setPaymentSearchInput(e.target.value)}
                  placeholder="Name / description / type..."
                  className="pl-8 h-9"
                />
                {paymentSearchInput && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                    onClick={() => setPaymentSearchInput("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Payments table */}
          {loadingPayments ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-100">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-12" />
                </div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No payments found. Adjust filters or record a payment above.
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No record found for &quot;{paymentSearchDebounced.trim()}&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-y border-slate-100">
                  <tr className="text-left text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Labour</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p) => {
                    const badge = typeBadge(p.payment_type);
                    const labour = p.labours || laboursById.get(p.labour_id);
                    const labourName = labour?.name || `#${p.labour_id}`;
                    const locName = labourLocationName(labour);
                    const hasLocation = locName !== "—";
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {p.payment_date}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {labourName}
                        </td>
                        <td className="px-4 py-3">
                          {hasLocation ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "border",
                                locName.toLowerCase() === "shop"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              )}
                            >
                              <MapPin className="size-3 mr-1" /> {locName}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("border", badge.color)}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.description || (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                          Rs. {fmt(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDeletePayment(p.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right text-xs uppercase text-slate-500 font-semibold">
                      {paymentSearchDebounced.trim() ? `Total (filtered)` : `Total`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      Rs. {fmt(paymentSearchDebounced.trim() ? filteredGrandTotal : grandTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit Labour dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-slate-600" /> Edit Labour
            </DialogTitle>
            <DialogDescription>
              Update this labour&apos;s details, including the location (Shop / Farmhouse)
              they work at. Changes save immediately on Save.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Phone
              </Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="03xx-xxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Role / Skill
              </Label>
              <Input
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                list="role-presets-edit"
              />
              <datalist id="role-presets-edit">
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Daily Wage (Rs.)
              </Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={editWage}
                onChange={(e) => setEditWage(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Location <span className="text-red-500">*</span>
              </Label>
              <LocationSelect
                value={editLocationId}
                onChange={setEditLocationId}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 flex items-center gap-3">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Status
              </Label>
              <Select
                value={editActive ? "active" : "inactive"}
                onValueChange={(v) => setEditActive(v === "active")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-slate-500">
                Inactive labours cannot receive new payments.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {savingEdit ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Plus className="size-4" /> Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
