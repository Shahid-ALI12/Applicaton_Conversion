import { apiFetch } from "@/lib/api";
import { extractApiError } from "@/store";

import { useState, useMemo, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  Download,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  FileJson,
  CheckCircle2,
  Upload,
  FileUp,
  ArrowRight,
  Terminal,
  HardDrive,
  RefreshCw,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import { cn } from "@/lib/utils";

interface DatabaseInfo {
  path: string;
  size: number;
  sizeFormatted: string;
  lastModified: string;
  counts: Record<string, number>;
}

const TABLE_LABELS: Record<string, string> = {
  products: "Products",
  customers: "Customers",
  sales: "Sales",
  expenses: "Expenses",
  purchases: "Purchases",
  cash_ledger: "Cash Ledger Entries",
  mix_orders: "Mix Orders",
};

export default function DatabaseManagementPage() {
  const [downloading, setDownloading] = useState(false);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  // ─── Restore state ───
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    ok: boolean;
    message: string;
    safetyBackup?: string;
    newDbSize?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = pktToday();

  // Fetch current DB info on mount
  const fetchInfo = async () => {
    setInfoLoading(true);
    try {
      const res = await apiFetch("/api/database/info");
      if (res.ok) {
        const data = await res.json();
        setDbInfo(data);
      }
    } catch {
      // silent fail — info is non-critical
    } finally {
      setInfoLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      toast.loading("Creating database backup…", { id: "backup-dl" });

      const res = await apiFetch("/api/database/backup");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiError(err, "Failed to generate backup"));
      }

      // Read response as blob and trigger download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `danishcattlefeed-backup-${today}.db`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeHeader = res.headers.get("X-Backup-Size") || "";
      toast.success(
        `Backup downloaded successfully!${sizeHeader ? ` (${sizeHeader})` : ""}`,
        { id: "backup-dl", duration: 5000 }
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to download backup", { id: "backup-dl" });
    } finally {
      setDownloading(false);
    }
  };

  // ─── Restore handlers ───

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setRestoreResult(null);
    if (!file) {
      setRestoreFile(null);
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".db") && !name.endsWith(".sqlite") && !name.endsWith(".sqlite3")) {
      toast.error("Please select a .db backup file");
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast.error("File too large. Max 500 MB.");
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setRestoreFile(file);
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast.error("Pick a .db backup file first");
      return;
    }
    setRestoring(true);
    setRestoreResult(null);
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);

      toast.loading("Restoring database…", { id: "restore-dl" });

      const res = await apiFetch("/api/database/restore", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = extractApiError(data, "Failed to restore database");
        throw new Error(msg);
      }

      setRestoreResult({
        ok: true,
        message: data.message || "Database restored successfully.",
        safetyBackup: data.safetyBackup,
        newDbSize: data.newDbSize,
      });
      toast.success(
        "Database restored! Please RESTART the app to load the new data.",
        { id: "restore-dl", duration: 10000 }
      );

      // Refresh info
      fetchInfo();
    } catch (e: any) {
      setRestoreResult({
        ok: false,
        message: e.message || "Failed to restore database",
      });
      toast.error(e.message || "Failed to restore database", { id: "restore-dl" });
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
            { id: "section-db-info", label: "Current Database", icon: HardDrive, iconColor: "text-blue-600" },
            { id: "section-backup-download", label: "Download Backup", icon: Download, iconColor: "text-emerald-600" },
            { id: "section-restore", label: "Restore Section", icon: Upload, iconColor: "text-amber-600" },
            { id: "section-restore-choose", label: "1. Select File", icon: FileUp },
            { id: "section-restore-action", label: "2. Restore", icon: ShieldCheck },
            { id: "section-how-to", label: "How to Use", icon: Info },
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
                <h3 className="text-sm font-bold text-slate-900">Backup & Restore — Local SQLite Database</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This software stores all your business data in a local SQLite database file (`.db`) on your computer.
                  You can download a full snapshot of this file anytime and restore it later if data is lost or corrupted.
                  No cloud, no Supabase — everything stays on your machine.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Database Info */}
        <Card id="section-db-info" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <HardDrive className="size-5 text-slate-600" /> Current Database
            </CardTitle>
            <CardDescription>
              Live snapshot of your currently active database file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {infoLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" /> Loading database info…
              </div>
            ) : dbInfo ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">File Size</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">{dbInfo.sizeFormatted}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Last Modified</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {new Date(dbInfo.lastModified).toLocaleString("en-PK", {
                        timeZone: "Asia/Karachi",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">File Path</div>
                    <div className="text-xs font-mono text-slate-700 mt-1 truncate" title={dbInfo.path}>
                      {dbInfo.path}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Records by Table
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {Object.entries(dbInfo.counts).map(([table, count]) => (
                      <div
                        key={table}
                        className="rounded-lg border border-slate-200/60 px-3 py-2 bg-white"
                      >
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide truncate">
                          {TABLE_LABELS[table] || table}
                        </div>
                        <div className="text-base font-bold text-slate-900">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchInfo}
                  disabled={infoLoading}
                  className="gap-2"
                >
                  <RefreshCw className={cn("size-4", infoLoading && "animate-spin")} />
                  Refresh
                </Button>
              </>
            ) : (
              <div className="text-sm text-slate-500">Failed to load database info.</div>
            )}
          </CardContent>
        </Card>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* BACKUP DOWNLOAD                                              */}
        {/* ─────────────────────────────────────────────────────────── */}

        <Card id="section-backup-download" className="rounded-2xl border-emerald-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download className="size-5 text-emerald-600" /> Download Database Backup
            </CardTitle>
            <CardDescription>
              Click below to download a complete snapshot of your current database as a <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">.db</code> file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-300 bg-blue-50 text-blue-800">
              <Info className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">What you get:</span> A single <code className="px-1 bg-blue-100 rounded text-xs">.db</code> file
                containing the entire database — products, customers, sales, expenses, cash, stock, everything.
                Save this file somewhere safe (USB drive, cloud folder, etc.).
              </AlertDescription>
            </Alert>

            <Alert className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="size-4 text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">Heads up:</span> The download may take a few seconds
                depending on database size. Keep this file safe — anyone with access to it
                can read your full business history.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">
                  Filename: <span className="text-emerald-700 font-mono">danishcattlefeed-backup-{today}.db</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Generated from live database with consistency snapshot
                </div>
              </div>

              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 min-w-[200px]"
                size="lg"
              >
                {downloading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> Download .db Backup
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* RESTORE SECTION                                             */}
        {/* ─────────────────────────────────────────────────────────── */}

        <div id="section-restore" className="pt-4 border-t border-slate-200/60 scroll-mt-24">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="size-5 text-amber-600" />
            <h2 className="text-xl font-bold text-slate-900">Restore from Backup</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Upload a previously downloaded <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">.db</code> file
            to replace the current database. A safety backup of your current database is automatically created
            before restore, so you can always roll back if something goes wrong.
          </p>
        </div>

        {/* Step 1 — pick file */}
        <Card id="section-restore-choose" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileUp className="size-5 text-slate-600" /> 1. Select Backup File
            </CardTitle>
            <CardDescription>
              Choose the <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">.db</code> file you
              previously downloaded from this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Backup File (.db)
                </Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
              </div>
              <div className="text-xs text-slate-500 sm:pb-2.5">
                Max size: 500 MB
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

        {/* Step 2 — restore action */}
        <Card id="section-restore-action" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="size-5 text-slate-600" /> 2. Restore Database
            </CardTitle>
            <CardDescription>
              The current database will be replaced with the uploaded file. A safety backup is created automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-300 bg-blue-50 text-blue-800">
              <ShieldCheck className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">Safety guarantee:</span> Before restore, the system
                automatically creates a timestamped backup of your <span className="font-semibold">current</span> database
                in the <code className="px-1 bg-blue-100 rounded text-xs">backups/</code> folder. If restore fails or
                anything goes wrong, your data is still safe.
              </AlertDescription>
            </Alert>

            <Alert className="border-red-300 bg-red-50 text-red-800">
              <AlertTriangle className="size-4 text-red-600" />
              <AlertDescription>
                <span className="font-semibold">Important:</span> After restore, you must <span className="font-semibold">RESTART</span> the
                application to load the new database. The running app still holds the old database in memory.
                Close the app completely and reopen it.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">
                  Mode: <span className="text-amber-700">Full Replace</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {restoreFile
                    ? `Ready to restore: ${restoreFile.name}`
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
                    <Loader2 className="size-4 animate-spin" /> Restoring…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" /> Restore Database
                  </>
                )}
              </Button>
            </div>

            {restoreResult && (
              <Alert
                className={
                  restoreResult.ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }
              >
                {restoreResult.ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="size-4 text-red-600" />
                )}
                <AlertDescription>
                  <div className="font-semibold">
                    {restoreResult.ok ? "Restore successful!" : "Restore failed"}
                  </div>
                  <div className="text-xs mt-1">{restoreResult.message}</div>
                  {restoreResult.safetyBackup && (
                    <div className="text-xs mt-1">
                      <span className="font-semibold">Safety backup:</span>{" "}
                      <code className="px-1 bg-white/60 rounded">{restoreResult.safetyBackup}</code>
                    </div>
                  )}
                  {restoreResult.newDbSize && (
                    <div className="text-xs mt-1">
                      <span className="font-semibold">New DB size:</span> {restoreResult.newDbSize}
                    </div>
                  )}
                  {restoreResult.ok && (
                    <div className="text-xs mt-2 font-semibold">
                      ⚠️ Please close and restart the application now.
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Step 3 — how to use (informational) */}
        <Card id="section-how-to" className="rounded-2xl border-slate-200/60 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Info className="size-4 text-blue-600" /> How to Use Backup &amp; Restore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-bold text-emerald-700 mb-2 flex items-center gap-2">
                  <Download className="size-4" /> Backup (Save Data)
                </h4>
                <ol className="text-xs text-slate-700 leading-relaxed space-y-1.5 list-decimal list-inside">
                  <li>Click <span className="font-semibold">"Download .db Backup"</span> button above.</li>
                  <li>Save the file somewhere safe — USB drive, cloud folder (Google Drive, OneDrive), etc.</li>
                  <li>Recommended: take a backup every week or before any major change.</li>
                  <li>The file is a complete snapshot — nothing is left out.</li>
                </ol>
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">
                  <Upload className="size-4" /> Restore (Recover Data)
                </h4>
                <ol className="text-xs text-slate-700 leading-relaxed space-y-1.5 list-decimal list-inside">
                  <li>Select the <code className="px-1 bg-slate-100 rounded">.db</code> file you want to restore.</li>
                  <li>Click <span className="font-semibold">"Restore Database"</span> button.</li>
                  <li>A safety backup of your current DB is created automatically.</li>
                  <li>After success message, <span className="font-semibold">CLOSE the app completely</span>.</li>
                  <li>Reopen the app — restored data will appear.</li>
                </ol>
              </div>
            </div>

            <Alert className="mt-4 border-blue-300 bg-blue-50 text-blue-800">
              <Terminal className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">Automatic backups:</span> The software also creates
                automatic backups every 12 hours in the <code className="px-1 bg-blue-100 rounded text-xs">backups/</code> folder
                inside the app data directory. So even if you forget to take a manual backup, you have
                recent automatic ones to fall back on.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
