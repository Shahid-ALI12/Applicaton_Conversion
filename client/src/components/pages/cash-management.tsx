import { apiFetch } from "@/lib/api";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Lock,
  BarChart3,
  ArrowRightLeft,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import type { CashAccount, CashTransfer } from "@/types";
import {
  useCashAccounts,
  useCashBalances,
  useCashTransfers,
  useInvalidateAfterMutation,
} from "@/hooks/queries";

const HAND_ACCOUNT_NAME = "Cash In Hand";
const LOCKER_ACCOUNT_NAME = "Cash In Locker";

interface RawTransfer extends CashTransfer {
  from_account?: CashAccount | null;
  to_account?: CashAccount | null;
}

export default function CashManagementPage() {
  // ─── React Query hooks (replace manual fetch + state) ───
  const { data: accountsData, isLoading: accountsLoading } = useCashAccounts();
  const { data: balancesData, isLoading: balancesLoading } = useCashBalances();
  const { data: transfersData, isLoading: transfersLoading } = useCashTransfers();
  const invalidate = useInvalidateAfterMutation();

  const accounts: CashAccount[] = accountsData?.accounts ?? [];
  const balances: Record<string, number> = balancesData?.balances ?? {};
  const transfers: RawTransfer[] = transfersData?.transfers ?? [];

  // Transfer form state
  const [transferDirection, setTransferDirection] = useState<"locker-to-hand" | "hand-to-locker">("locker-to-hand");
  const [transferDate, setTransferDate] = useState(pktToday());
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Table filter
  const [dateFilter, setDateFilter] = useState("");

  // Recent Transfers search (client-side, debounced)
  const [transferSearchInput, setTransferSearchInput] = useState("");
  const [transferSearchDebounced, setTransferSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTransferSearchDebounced(transferSearchInput), 350);
    return () => clearTimeout(t);
  }, [transferSearchInput]);

  // Correction state
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionAccount, setCorrectionAccount] = useState<string>(HAND_ACCOUNT_NAME);
  const [correctionTarget, setCorrectionTarget] = useState("");
  const [correctionName, setCorrectionName] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionSuccess, setCorrectionSuccess] = useState(false);

  // Correction history state
  interface CorrectionRow {
    id: number;
    entry_date: string;
    account_id: number;
    account_name: string;
    direction: "in" | "out";
    amount: number;
    description: string | null;
    entered_by: string | null;
    created_at: string;
  }
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loadingCorrections, setLoadingCorrections] = useState(false);

  // Correction History search (client-side, debounced)
  const [corrSearchInput, setCorrSearchInput] = useState("");
  const [corrSearchDebounced, setCorrSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCorrSearchDebounced(corrSearchInput), 350);
    return () => clearTimeout(t);
  }, [corrSearchInput]);

  // Fetch corrections when the correction section is opened (lazy load)
  useEffect(() => {
    if (!correctionOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingCorrections(true);
      try {
        const res = await apiFetch("/api/cash/correction");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCorrections(data.corrections ?? []);
      } catch {
        // Silent fail — history is non-critical
      } finally {
        if (!cancelled) setLoadingCorrections(false);
      }
    })();
    return () => { cancelled = true; };
  }, [correctionOpen, correctionSuccess]);

  // Saving state for forms (local, since mutations happen here)
  const [submitting, setSubmitting] = useState(false);

  const handBalance = balances[HAND_ACCOUNT_NAME] ?? 0;
  const lockerBalance = balances[LOCKER_ACCOUNT_NAME] ?? 0;
  const totalCash = handBalance + lockerBalance;

  const filteredTransfers = useMemo(() => {
    let list = transfers;
    if (dateFilter) list = list.filter((t) => t.transfer_date === dateFilter);
    if (transferSearchDebounced.trim()) {
      const q = transferSearchDebounced.trim().toLowerCase();
      list = list.filter((t) => {
        const fromName = t.from_account?.name ?? "";
        const toName = t.to_account?.name ?? "";
        return [
          fromName,
          toName,
          t.transfer_date ?? "",
          t.notes ?? "",
          String(t.amount),
        ].some((s) => s.toLowerCase().includes(q));
      });
    }
    return list;
  }, [transfers, dateFilter, transferSearchDebounced]);

  // Filtered corrections (by account name / reason / entered_by / date)
  const filteredCorrections = useMemo(() => {
    if (!corrSearchDebounced.trim()) return corrections;
    const q = corrSearchDebounced.trim().toLowerCase();
    return corrections.filter((c) =>
      [
        c.account_name ?? "",
        c.description ?? "",
        c.entered_by ?? "",
        c.entry_date ?? "",
        c.direction ?? "",
        String(c.amount),
      ].some((s) => s.toLowerCase().includes(q)),
    );
  }, [corrections, corrSearchDebounced]);

  const accountIdByName = (name: string) => accounts.find((a) => a.name === name)?.id;

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const isLockerToHand = transferDirection === "locker-to-hand";
    const fromName = isLockerToHand ? LOCKER_ACCOUNT_NAME : HAND_ACCOUNT_NAME;
    const toName = isLockerToHand ? HAND_ACCOUNT_NAME : LOCKER_ACCOUNT_NAME;

    if ((balances[fromName] ?? 0) < amount) {
      toast.error(`Insufficient balance in ${fromName}`);
      return;
    }

    const fromId = accountIdByName(fromName);
    const toId = accountIdByName(toName);
    if (!fromId || !toId) {
      toast.error("Cash accounts not configured");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/cash/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_account_id: fromId,
          to_account_id: toId,
          amount,
          transfer_date: transferDate,
          notes: transferNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to record transfer");
      }
      setTransferAmount("");
      setTransferNotes("");
      setTransferSuccess(true);
      setTimeout(() => setTransferSuccess(false), 3000);
      // Invalidate React Query cache — server cache is already invalidated by route,
      // but client needs explicit invalidation for instant UI refresh
      invalidate.invalidateCash();
    } catch (e: any) {
      toast.error(e.message || "Failed to record transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(correctionTarget);
    if (isNaN(target) || target < 0) {
      toast.error("Enter a valid target balance");
      return;
    }
    const accId = accountIdByName(correctionAccount);
    if (!accId) {
      toast.error("Account not found");
      return;
    }
    // Name + Reason compulsory (also enforced by API, but check here for instant feedback)
    const trimmedName = correctionName.trim();
    const trimmedReason = correctionReason.trim();
    if (!trimmedName) {
      toast.error("Naam likhna zaroori hai (Name is required)");
      return;
    }
    if (!trimmedReason) {
      toast.error("Reason likhna zaroori hai (Reason is required)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/cash/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accId, target, name: trimmedName, reason: trimmedReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to apply correction");
      }
      setCorrectionTarget("");
      setCorrectionName("");
      setCorrectionReason("");
      setCorrectionSuccess(true);
      setTimeout(() => setCorrectionSuccess(false), 3000);
      invalidate.invalidateCash();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply correction");
    } finally {
      setSubmitting(false);
    }
  };

  const formatRs = (val: number) => val.toLocaleString("en-PK", { minimumFractionDigits: 0 });

  // ─── Loading state: show skeletons instead of blank spinner ───
  const initialLoading = accountsLoading && balancesLoading && transfersLoading;
  if (initialLoading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Cash Management"
            subtitle="Track cash in hand vs cash in locker — transfer & correct balances"
          />
          {/* Skeleton for balance overview */}
          <section className="mb-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                  <Skeleton className="h-3 w-24 mb-3" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          </section>
          {/* Skeleton for transfer form */}
          <section className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
            <Skeleton className="h-6 w-40 mb-4" />
            <div className="space-y-5">
              <Skeleton className="h-10 w-full" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          </section>
          {/* Skeleton for transfers table */}
          <section className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
            <Skeleton className="h-6 w-40 mb-4" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="Cash Management"
          subtitle="Track cash in hand vs cash in locker — transfer & correct balances"
        />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-balances", label: "Balance Overview", icon: Banknote, iconColor: "text-green-600" },
            { id: "section-transfer", label: "Transfer Cash", icon: ArrowRightLeft },
            { id: "section-recent", label: "Recent Transfers", icon: BarChart3 },
            { id: "section-correction", label: "Manual Correction", icon: AlertTriangle, iconColor: "text-amber-500" },
          ]}
        />

        {/* ── 1. Balance Overview ── */}
        <section id="section-balances" className="mb-8 scroll-mt-24" aria-label="Balance overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {balancesLoading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                    <Skeleton className="h-3 w-24 mb-3" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </>
            ) : (
              <>
                <MetricCard label="💵 Cash In Hand" value={`Rs. ${formatRs(handBalance)}`} color="green" />
                <MetricCard label="🔒 Cash In Locker" value={`Rs. ${formatRs(lockerBalance)}`} color="purple" />
                <MetricCard label="📊 Total Cash" value={`Rs. ${formatRs(totalCash)}`} color="blue" />
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400 text-center sm:text-left">
            Total Cash is always Hand + Locker.
          </p>
        </section>

        {/* ── 2. Transfer Cash Form ── */}
        <section id="section-transfer" className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm scroll-mt-24" aria-label="Transfer cash">
          <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
            <ArrowRightLeft className="size-5 text-slate-500" />
            Transfer Cash
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            Move money between Cash In Hand and Cash In Locker.
          </p>

          {transferSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="size-4 shrink-0" />
              Transfer recorded successfully! Balances have been updated.
            </div>
          )}

          <form onSubmit={handleTransferSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Direction</Label>
              <RadioGroup
                value={transferDirection}
                onValueChange={(v) => setTransferDirection(v as "locker-to-hand" | "hand-to-locker")}
                className="flex flex-wrap gap-4 sm:gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="locker-to-hand" id="locker-to-hand" />
                  <Label htmlFor="locker-to-hand" className="text-sm font-normal cursor-pointer">
                    <Lock className="inline size-3.5 mr-1 text-purple-500" />
                    Locker →{" "}
                    <Banknote className="inline size-3.5 mx-1 text-green-500" />
                    Hand
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="hand-to-locker" id="hand-to-locker" />
                  <Label htmlFor="hand-to-locker" className="text-sm font-normal cursor-pointer">
                    <Banknote className="inline size-3.5 mr-1 text-green-500" />
                    Hand →{" "}
                    <Lock className="inline size-3.5 mx-1 text-purple-500" />
                    Locker
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transfer-date" className="text-sm font-medium text-slate-700">Date</Label>
                <Input id="transfer-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="max-w-xs" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-amount" className="text-sm font-medium text-slate-700">Amount (Rs.)</Label>
                <Input id="transfer-amount" type="number" min="1" step="1" placeholder="e.g. 10000" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="max-w-xs" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-notes" className="text-sm font-medium text-slate-700">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input id="transfer-notes" type="text" placeholder="Reason for transfer…" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} className="max-w-md" />
            </div>

            <Button type="submit" className="gap-2" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
              Record Transfer
            </Button>
          </form>
        </section>

        {/* ── 3. Recent Transfers Table ── */}
        <section id="section-recent" className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm scroll-mt-24" aria-label="Recent transfers">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="size-5 text-slate-500" />
              Recent Transfers
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={transferSearchInput}
                  onChange={(e) => setTransferSearchInput(e.target.value)}
                  placeholder="Search by account / notes / date..."
                  className="pl-8 w-full sm:w-64 h-9"
                />
                {transferSearchInput && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                    onClick={() => setTransferSearchInput("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="date-filter" className="sr-only">Filter by date</Label>
                <Input id="date-filter" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} placeholder="Filter by date" className="w-full sm:w-auto h-9" />
              </div>
            </div>
          </div>

          {transfersLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {transferSearchDebounced.trim()
                ? `No transfers found for "${transferSearchDebounced.trim()}"${dateFilter ? ` on ${dateFilter}` : ""}.`
                : "No transfers found for the selected date."}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((t) => {
                    const fromName = t.from_account?.name ?? "—";
                    const toName = t.to_account?.name ?? "—";
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-slate-600">{t.transfer_date}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {fromName === LOCKER_ACCOUNT_NAME ? <Lock className="size-3.5 text-purple-500" /> : <Banknote className="size-3.5 text-green-500" />}
                            {fromName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {toName === LOCKER_ACCOUNT_NAME ? <Lock className="size-3.5 text-purple-500" /> : <Banknote className="size-3.5 text-green-500" />}
                            {toName}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900">
                          Rs. {formatRs(t.amount)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-slate-500 max-w-[200px] truncate">
                          {t.notes || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* ── 4. Manual Correction (Collapsible) ── */}
        <section id="section-correction" className="rounded-2xl border border-slate-200/60 bg-white shadow-sm scroll-mt-24" aria-label="Manual correction">
          <Collapsible open={correctionOpen} onOpenChange={setCorrectionOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between p-6 text-left hover:bg-slate-50/60 transition-colors rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-500" />
                  Manual Correction
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Directly set a cash account balance — use with caution.
                </p>
              </div>
              <ChevronDown className={cn("size-5 text-slate-400 shrink-0 transition-transform duration-200", correctionOpen && "rotate-180")} />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t border-slate-100 px-6 pb-6 pt-5">
                {correctionSuccess && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                    <CheckCircle2 className="size-4 shrink-0" />
                    Balance corrected successfully!
                  </div>
                )}

                <form onSubmit={handleCorrectionSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Account</Label>
                      <Select value={correctionAccount} onValueChange={setCorrectionAccount}>
                        <SelectTrigger className="w-full sm:w-[220px]">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={HAND_ACCOUNT_NAME}>
                            <span className="inline-flex items-center gap-1.5">
                              <Banknote className="size-3.5 text-green-500" />
                              Cash In Hand
                            </span>
                          </SelectItem>
                          <SelectItem value={LOCKER_ACCOUNT_NAME}>
                            <span className="inline-flex items-center gap-1.5">
                              <Lock className="size-3.5 text-purple-500" />
                              Cash In Locker
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Current Balance</Label>
                      <div className="flex items-center h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 w-full sm:w-[220px]">
                        Rs. {formatRs(balances[correctionAccount] ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 max-w-xs">
                    <Label htmlFor="correction-target" className="text-sm font-medium text-slate-700">
                      Target Balance (Rs.) <span className="text-red-500">*</span>
                    </Label>
                    <Input id="correction-target" type="number" min="0" step="1" placeholder="Enter correct balance" value={correctionTarget} onChange={(e) => setCorrectionTarget(e.target.value)} required />
                  </div>

                  {/* Name + Reason — compulsory */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="correction-name" className="text-sm font-medium text-slate-700">
                        Naam (Your Name) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="correction-name"
                        type="text"
                        placeholder="e.g. Shahid, Ali..."
                        value={correctionName}
                        onChange={(e) => setCorrectionName(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="correction-reason" className="text-sm font-medium text-slate-700">
                        Reason <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="correction-reason"
                        type="text"
                        placeholder="e.g. Cash short by Rs.500"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        required
                        maxLength={200}
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800" disabled={submitting}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
                    Apply Correction
                  </Button>
                </form>

                {/* ── Correction History (below the form) ── */}
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                      Correction History
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {corrSearchDebounced.trim()
                          ? `${filteredCorrections.length} of ${corrections.length} record${filteredCorrections.length !== 1 ? "s" : ""}`
                          : (corrections.length > 0 ? `${corrections.length} record${corrections.length === 1 ? "" : "s"}` : "")}
                      </span>
                      <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                        <Input
                          value={corrSearchInput}
                          onChange={(e) => setCorrSearchInput(e.target.value)}
                          placeholder="Search by account / reason / by..."
                          className="pl-8 w-full sm:w-64 h-9"
                        />
                        {corrSearchInput && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                            onClick={() => setCorrSearchInput("")}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {loadingCorrections ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : corrections.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">
                      <AlertTriangle className="size-8 mx-auto mb-2 opacity-30" />
                      No corrections recorded yet.
                    </div>
                  ) : filteredCorrections.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">
                      No record found for &quot;{corrSearchDebounced.trim()}&quot;.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Date</th>
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Account</th>
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Direction</th>
                            <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Amount</th>
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Reason</th>
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">By</th>
                            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCorrections.map((c) => (
                            <tr key={c.id} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60">
                              <td className="px-3 py-2.5 text-slate-600 tabular-nums whitespace-nowrap">{c.entry_date}</td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex items-center gap-1.5">
                                  {c.account_name === HAND_ACCOUNT_NAME ? (
                                    <Banknote className="size-3.5 text-green-500" />
                                  ) : (
                                    <Lock className="size-3.5 text-purple-500" />
                                  )}
                                  <span className="text-slate-800">{c.account_name}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                {c.direction === "in" ? (
                                  <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                                    <ArrowRightLeft className="size-3.5" /> Added
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                    <ArrowRightLeft className="size-3.5 rotate-180" /> Deducted
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                                Rs. {formatRs(c.amount)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 max-w-xs">
                                <span className="line-clamp-2">{c.description || "—"}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">
                                {c.entered_by || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                                {new Date(c.created_at).toLocaleString("en-PK", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
    </main>
  );
}
