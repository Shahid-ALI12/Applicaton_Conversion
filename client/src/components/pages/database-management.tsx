import { apiFetch } from "@/lib/api";

import { useState, useMemo, useRef } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { apiError } from "@/store";
import type { BackupFilter, RestoreMode } from "@/types";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  Download,
  Loader2,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileJson,
  Clock,
  CheckCircle2,
  Upload,
  FileUp,
  ArrowRight,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import { cn } from "@/lib/utils";

const FILTER_OPTIONS: { value: BackupFilter; label: string; description: string }[] = [
  {
    value: "all",
    label: "All Database",
    description: "Everything since the day you started using the app",
  },
  {
    value: "today",
    label: "Today Only",
    description: "Only today's transactions (master data is always included)",
  },
  {
    value: "month",
    label: "This Month",
    description: "From the 1st of this month to today",
  },
  {
    value: "year",
    label: "This Year (Jan–Dec)",
    description: "From January 1st of this year to today",
  },
  {
    value: "custom",
    label: "Custom Range",
    description: "Pick any from/to dates",
  },
];

const INCLUDED_TABLES = [
  { name: "Products", category: "Master", note: "Always included" },
  { name: "Customers (business)", category: "Master", note: "Always included" },
  { name: "Suppliers", category: "Master", note: "Always included" },
  { name: "Cash Accounts", category: "Master", note: "Always included" },
  { name: "Product Stock", category: "Master", note: "Current snapshot — always included" },
  { name: "Sales", category: "Transactional", note: "Date-filtered" },
  { name: "Mix Orders", category: "Transactional", note: "Date-filtered" },
  { name: "Purchases", category: "Transactional", note: "Date-filtered" },
  { name: "Expenses", category: "Transactional", note: "Date-filtered" },
  { name: "Cash Ledger", category: "Transactional", note: "Date-filtered" },
  { name: "Cash Transfers", category: "Transactional", note: "Date-filtered" },
];

const RESTORE_MODES: { value: RestoreMode; label: string; description: string }[] = [
  {
    value: "merge",
    label: "Safe Merge (Recommended)",
    description: "Overwrite existing rows with backup data. Same IDs get updated, new IDs get inserted. Nothing is deleted.",
  },
  {
    value: "append",
    label: "Append Only",
    description: "Only insert rows whose IDs don't already exist. Existing rows stay untouched. Safe if you only want to add missing records.",
  },
];

export default function DatabaseManagementPage() {
  const [filter, setFilter] = useState<BackupFilter>("all");
  const [from, setFrom] = useState<string>(pktToday());
  const [to, setTo] = useState<string>(pktToday());
  const [downloading, setDownloading] = useState(false);

  // ─── Restore state ───
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCustom = filter === "custom";
  const today = pktToday();

  const rangePreview = useMemo(() => {
    switch (filter) {
      case "all":
        return null;
      case "today":
        return today;
      case "month": {
        const d = new Date(today + "T00:00:00+05:00");
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        return `${first.toISOString().slice(0, 10)} → ${today}`;
      }
      case "year": {
        const d = new Date(today + "T00:00:00+05:00");
        return `${d.getFullYear()}-01-01 → ${today}`;
      }
      case "custom":
        return `${from} → ${to}`;
    }
  }, [filter, today, from, to]);

  const handleDownload = async () => {
    if (isCustom) {
      if (!from || !to) {
        toast.error("Please pick both From and To dates");
        return;
      }
      if (from > to) {
        toast.error("From date must be before or equal to To date");
        return;
      }
    }

    setDownloading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (isCustom) {
        params.set("from", from);
        params.set("to", to);
      }

      toast.loading("Generating backup…", { id: "backup-dl" });

      const res = await apiFetch(`/api/database/backup?${params.toString()}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to generate backup");
        throw new Error(detail);
      }

      // Read response as blob and trigger download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `backup_${today}_${filter}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Backup downloaded successfully!", { id: "backup-dl" });
    } catch (e: any) {
      toast.error(e.message || "Failed to download backup", { id: "backup-dl" });
    } finally {
      setDownloading(false);
    }
  };

  // ─── Restore handlers ───

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setRestoreFile(null);
      return;
    }
    if (!file.name.endsWith(".json")) {
      toast.error("Please select a .json backup file");
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large. Max 50 MB.");
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setRestoreFile(file);
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast.error("Pick a backup file first");
      return;
    }
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);
      fd.append("mode", restoreMode);

      toast.loading("Generating SQL restore script…", { id: "restore-dl" });

      const res = await apiFetch("/api/database/restore", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to build restore script");
        throw new Error(detail);
      }

      // Read SQL as blob and trigger download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `restore_${today}_${restoreMode}.sql`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const rows = res.headers.get("X-Restore-Rows") || "?";
      toast.success(
        `SQL script downloaded (${rows} rows). Run it in Supabase SQL Editor to restore.`,
        { id: "restore-dl", duration: 8000 }
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to build restore script", { id: "restore-dl" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <PageHeader
          title="Database Management"
          subtitle="Danish Cattle Feed — Backup & Restore"
        />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-backup-choose", label: "1. Choose Backup", icon: Calendar },
            { id: "section-backup-inside", label: "2. What's Inside", icon: FileJson },
            { id: "section-backup-download", label: "3. Download", icon: Download, iconColor: "text-emerald-600" },
            { id: "section-restore", label: "Restore Section", icon: Upload, iconColor: "text-amber-600" },
            { id: "section-restore-choose", label: "1. Select File", icon: FileUp },
            { id: "section-restore-mode", label: "2. Restore Mode", icon: ShieldCheck },
            { id: "section-restore-script", label: "3. SQL Script", icon: Terminal },
          ]}
        />

        {/* Info banner — what this is */}
        <Card className="rounded-2xl border-blue-200/60 bg-blue-50/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Database className="size-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Download a backup of your data</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Export all your business data (products, customers, sales, purchases, cash, stock, etc.)
                  into a single JSON file you can save on your laptop. If you ever lose data —
                  accidental delete, bug, or Supabase issue — you can restore from this file
                  by running a SQL script in Supabase SQL Editor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter selection */}
        <Card id="section-backup-choose" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="size-5 text-slate-600" /> 1. Choose What to Backup
            </CardTitle>
            <CardDescription>
              Master data (products, customers, suppliers, etc.) is always included.
              Date filters apply only to transactions (sales, purchases, expenses, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={filter}
              onValueChange={(v) => setFilter(v as BackupFilter)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {FILTER_OPTIONS.map((opt) => {
                const isActive = filter === opt.value;
                return (
                  <label
                    key={opt.value}
                    htmlFor={`bf-${opt.value}`}
                    className={cn(
                      "flex items-start space-x-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors",
                      isActive
                        ? "border-emerald-500 bg-emerald-50/40"
                        : "border-slate-200/60 bg-slate-50/40 hover:bg-slate-50"
                    )}
                  >
                    <RadioGroupItem value={opt.value} id={`bf-${opt.value}`} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{opt.description}</div>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            {/* Custom date range */}
            {isCustom && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-emerald-200/60 bg-emerald-50/20">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    From Date
                  </Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    max={to}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    To Date
                  </Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    min={from}
                    max={today}
                  />
                </div>
              </div>
            )}

            {/* Range preview */}
            {rangePreview && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-100/80 px-4 py-2.5 border border-slate-200/60">
                <Clock className="size-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Date Range:
                </span>
                <span className="text-sm font-mono text-slate-900">{rangePreview}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What's included */}
        <Card id="section-backup-inside" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileJson className="size-5 text-slate-600" /> 2. What's Inside the Backup
            </CardTitle>
            <CardDescription>
              The JSON file contains all 12 business tables. Login passwords are excluded for security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INCLUDED_TABLES.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between rounded-lg border border-slate-200/60 px-3 py-2 bg-slate-50/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {t.category} · {t.note}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-800">
              <ShieldCheck className="size-4 text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">Security note:</span> Login accounts
                (with password hashes) are <span className="font-semibold">NOT</span> included in the backup.
                Supabase Auth handles admin accounts separately — those are managed through the
                Supabase Dashboard, not this export.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Download */}
        <Card id="section-backup-download" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download className="size-5 text-slate-600" /> 3. Download Backup File
            </CardTitle>
            <CardDescription>
              Click below to generate and download a JSON backup file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-300 bg-blue-50 text-blue-800">
              <AlertTriangle className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">Heads up:</span> The download may take a few seconds
                depending on how much data you have. Keep this file safe — anyone with access to it
                can read your full business history.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">
                  Filter: <span className="text-emerald-700 capitalize">{filter}</span>
                </div>
                {rangePreview && (
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">{rangePreview}</div>
                )}
              </div>

              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 min-w-[180px]"
                size="lg"
              >
                {downloading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> Download JSON Backup
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* RESTORE SECTION                                                */}
        {/* ─────────────────────────────────────────────────────────── */}

        <div id="section-restore" className="pt-4 border-t border-slate-200/60 scroll-mt-24">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="size-5 text-amber-600" />
            <h2 className="text-xl font-bold text-slate-900">Restore from Backup</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Upload a previously downloaded backup JSON file. We'll generate a SQL script
            you can review and run in Supabase SQL Editor to restore your data.
            <span className="font-semibold text-slate-800"> This page does not write to your
            database directly</span> — you stay in full control.
          </p>
        </div>

        {/* Step 1 — pick file */}
        <Card id="section-restore-choose" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileUp className="size-5 text-slate-600" /> 1. Select Backup File
            </CardTitle>
            <CardDescription>
              Choose the <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">.json</code> file you
              previously downloaded from this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Backup JSON File
                </Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
              </div>
              <div className="text-xs text-slate-500 sm:pb-2.5">
                Max size: 50 MB
              </div>
            </div>

            {restoreFile && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200/60 px-3 py-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">
                  {restoreFile.name}
                </span>
                <span className="text-xs text-emerald-600 ml-auto">
                  {(restoreFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — pick mode */}
        <Card id="section-restore-mode" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="size-5 text-slate-600" /> 2. Choose Restore Mode
            </CardTitle>
            <CardDescription>
              Pick how conflicts (same IDs already in DB) should be handled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={restoreMode}
              onValueChange={(v) => setRestoreMode(v as RestoreMode)}
              className="grid grid-cols-1 gap-3"
            >
              {RESTORE_MODES.map((opt) => {
                const isActive = restoreMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    htmlFor={`rm-${opt.value}`}
                    className={cn(
                      "flex items-start space-x-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors",
                      isActive
                        ? "border-amber-500 bg-amber-50/40"
                        : "border-slate-200/60 bg-slate-50/40 hover:bg-slate-50"
                    )}
                  >
                    <RadioGroupItem value={opt.value} id={`rm-${opt.value}`} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{opt.description}</div>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="size-4 text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">Important:</span> Neither mode deletes existing rows.
                <span className="font-semibold"> Safe Merge</span> will overwrite matching IDs with backup values;
                <span className="font-semibold"> Append</span> will skip them entirely. Choose Merge if you want
                the database to match the backup exactly (for missing rows you'll need to manually delete).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Step 3 — generate + download SQL */}
        <Card id="section-restore-script" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="size-5 text-slate-600" /> 3. Generate &amp; Download SQL Script
            </CardTitle>
            <CardDescription>
              We'll build a <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">.sql</code> file containing
              all INSERT statements, wrapped in a transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-300 bg-blue-50 text-blue-800">
              <ArrowRight className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">After downloading:</span> Open
                <span className="font-mono text-xs"> Supabase Dashboard → SQL Editor → New query</span>,
                paste the script, review it, then click <span className="font-semibold">Run</span>.
                If anything fails, the transaction rolls back automatically — no half-applied changes.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">
                  Mode: <span className="text-amber-700 capitalize">{restoreMode}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {restoreFile
                    ? `File: ${restoreFile.name}`
                    : "No file selected yet"}
                </div>
              </div>

              <Button
                onClick={handleRestore}
                disabled={!restoreFile || restoring}
                className="gap-2 bg-amber-600 hover:bg-amber-700 min-w-[220px]"
                size="lg"
              >
                {restoring ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating SQL…
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> Generate SQL Script
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step 4 — how to run (informational) */}
        <Card className="rounded-2xl border-slate-200/60 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" /> How to Run the Script
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-xs text-slate-700 leading-relaxed space-y-1.5 list-decimal list-inside">
              <li>Download the <code className="px-1 bg-slate-100 rounded">.sql</code> file using the button above.</li>
              <li>Open <span className="font-semibold">Supabase Dashboard</span> → <span className="font-semibold">SQL Editor</span> → <span className="font-semibold">New query</span>.</li>
              <li>Open the downloaded file in a text editor, select all, copy.</li>
              <li>Paste into the SQL Editor and click <span className="font-semibold">Run</span>.</li>
              <li>If you see any error, the whole script is rolled back — fix the issue and re-run.</li>
              <li>On success, refresh the app — restored data should appear.</li>
            </ol>
            <Alert className="mt-3 border-red-300 bg-red-50 text-red-800">
              <ShieldCheck className="size-4 text-red-600" />
              <AlertDescription>
                <span className="font-semibold">Never</span> run a restore script on the wrong database.
                Always verify you're connected to the correct Supabase project before clicking Run.
                The script does not delete data, but a wrong-database restore can pollute a clean DB
                with stale rows.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
