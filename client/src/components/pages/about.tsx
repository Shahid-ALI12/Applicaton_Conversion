import { useState, useEffect, type ReactNode } from "react";
import {
  ShieldCheck, CreditCard, Calendar, Clock, Mail, User as UserIcon,
  TrendingUp, Pencil, Loader2, Phone, Save, X, Store, Info,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface AboutData {
  // License-derived (read-only)
  customer_name: string | null;
  licensed_until: string | null;
  licensed_from: string | null;
  days_left: number;
  state: 'trial' | 'active' | 'expiring' | 'expired' | 'tampered';
  machine_id: string;
  // Admin-editable
  welcome_message: string;
  customer_email: string;
  subscription_plan: string;
  start_date: string;
  support_phone: string;
  support_email: string;
  custom_message: string;
  shop_name: string;
}

interface EditForm {
  about_welcome_message: string;
  about_customer_email: string;
  about_subscription_plan: string;
  about_start_date: string;
  about_support_phone: string;
  about_support_email: string;
  about_custom_message: string;
  about_shop_name: string;
}

export default function About(): ReactNode {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AboutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>({
    about_welcome_message: "Welcome, {name}!",
    about_customer_email: "",
    about_subscription_plan: "Yearly",
    about_start_date: "",
    about_support_phone: "",
    about_support_email: "",
    about_custom_message: "Your account is active. You can access all features and manage your data.",
    about_shop_name: "Danish Cattle Feed",
  });

  useEffect(() => { void loadAbout(); }, []);

  async function loadAbout() {
    setLoading(true);
    try {
      const d = await api.get<AboutData>("/api/about");
      setData(d);
      setForm({
        about_welcome_message: d.welcome_message,
        about_customer_email: d.customer_email,
        about_subscription_plan: d.subscription_plan,
        about_start_date: d.start_date,
        about_support_phone: d.support_phone,
        about_support_email: d.support_email,
        about_custom_message: d.custom_message,
        about_shop_name: d.shop_name,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "About data load nahi hua";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      await api.put("/api/about", form);
      toast.success("About settings update ho gayi");
      setEditOpen(false);
      await loadAbout();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Save fail hua";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        About data load nahi ho paaya.
      </div>
    );
  }

  // Progress calculation
  // Priority: admin-set start_date > license activated_at (licensed_from) > derived from days_left
  let startDate = data.start_date || data.licensed_from || '';
  // Agar koi start date nahi mili, toh days_left se derive karo
  // (assume yearly license = 365 days default, fallback 30 days)
  if (!startDate && data.licensed_until) {
    const end = new Date(data.licensed_until).getTime();
    const now = Date.now();
    // days_left se approximate start calculate karo
    const approxTotalDays = data.days_left > 0 ? Math.max(30, Math.ceil((end - now) / 86_400_000)) : 365;
    const startMs = end - approxTotalDays * 86_400_000;
    startDate = new Date(startMs).toISOString().slice(0, 10);
  }
  let progress = 0;
  let totalDays = 0;
  let elapsedDays = 0;
  if (startDate && data.licensed_until) {
    const start = new Date(startDate).getTime();
    const end = new Date(data.licensed_until).getTime();
    const now = Date.now();
    totalDays = Math.max(1, Math.ceil((end - start) / 86_400_000));
    elapsedDays = Math.max(0, Math.ceil((now - start) / 86_400_000));
    progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  }

  const stateBadge = data.state === "active" || data.state === "trial"
    ? { label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" }
    : data.state === "expiring"
      ? { label: "Expiring Soon", color: "bg-amber-100 text-amber-700 border-amber-200" }
      : { label: "Expired", color: "bg-red-100 text-red-700 border-red-200" };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Green header banner */}
      <div className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white relative">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
                <ShieldCheck className="w-3.5 h-3.5" />
                Subscription Active
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
                {data.welcome_message}
              </h1>
              <p className="text-emerald-50/90 max-w-2xl">{data.custom_message}</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[120px]">
              <div className="text-3xl font-extrabold leading-tight">{data.days_left}</div>
              <div className="text-xs text-emerald-50/80 mt-0.5">Days Left</div>
            </div>
          </div>
          {isAdmin && (
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setEditOpen(true)}
                variant="secondary"
                className="bg-white/95 hover:bg-white text-emerald-700 shadow"
              >
                <Pencil className="w-4 h-4" />
                Edit About
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 4 Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard
          icon={<UserIcon className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Account Name"
          value={data.customer_name ?? "—"}
        />
        <InfoCard
          icon={<CreditCard className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Subscription"
          value={data.subscription_plan || "—"}
        />
        <InfoCard
          icon={<Calendar className="w-5 h-5 text-purple-600" />}
          iconBg="bg-purple-50"
          label="Start Date"
          value={data.start_date || "—"}
        />
        <InfoCard
          icon={<Clock className="w-5 h-5 text-orange-600" />}
          iconBg="bg-orange-50"
          label="Expiry Date"
          value={data.licensed_until || "—"}
        />
      </div>

      {/* Subscription Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Subscription Progress</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{data.start_date || "—"}</span>
            <span>{data.licensed_until || "—"}</span>
          </div>
          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {progress > 0 && progress < 100 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-emerald-600 border-2 border-white rounded-full shadow"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">{progress.toFixed(0)}% elapsed</span>
            <span className="text-slate-600">{data.days_left} days remaining</span>
          </div>
        </div>
      </div>

      {/* Account Details */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Account Details</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailRow
            icon={<Mail className="w-4 h-4 text-slate-400" />}
            label="Email"
            value={data.customer_email || "—"}
          />
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Status</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${stateBadge.color}`}>
                  {stateBadge.label}
                </span>
                <span className="text-sm text-slate-700">Account {stateBadge.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Support + Shop Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SupportCard
          icon={<Store className="w-5 h-5 text-slate-600" />}
          label="Shop"
          value={data.shop_name || "Danish Cattle Feed"}
        />
        <SupportCard
          icon={<Phone className="w-5 h-5 text-slate-600" />}
          label="Support Phone"
          value={data.support_phone || "—"}
        />
        <SupportCard
          icon={<Mail className="w-5 h-5 text-slate-600" />}
          label="Support Email"
          value={data.support_email || "—"}
        />
      </div>

      {/* Machine ID (info only) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3 text-sm">
        <Info className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="text-slate-600">
          <span className="font-medium">Machine ID:</span>{" "}
          <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-xs">
            {data.machine_id}
          </code>
          <span className="ml-2 text-slate-400">— License is bound to this machine.</span>
        </div>
      </div>

      {/* Edit Dialog — admin only */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit About Page</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Shop Name">
                <Input
                  value={form.about_shop_name}
                  onChange={e => setForm({ ...form, about_shop_name: e.target.value })}
                  placeholder="Danish Cattle Feed"
                />
              </Field>
              <Field label="Subscription Plan">
                <Input
                  value={form.about_subscription_plan}
                  onChange={e => setForm({ ...form, about_subscription_plan: e.target.value })}
                  placeholder="Yearly / Monthly / Quarterly"
                />
              </Field>
            </div>

            <Field label="Welcome Message" hint='{name} placeholder ki jagah customer ka naam aa jaayega'>
              <Input
                value={form.about_welcome_message}
                onChange={e => setForm({ ...form, about_welcome_message: e.target.value })}
                placeholder="Welcome, {name}!"
              />
            </Field>

            <Field label="Custom Message" hint="Header ke neeche wala subtext">
              <Textarea
                value={form.about_custom_message}
                onChange={e => setForm({ ...form, about_custom_message: e.target.value })}
                rows={2}
                placeholder="Your account is active. You can access all features."
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Customer Email">
                <Input
                  type="email"
                  value={form.about_customer_email}
                  onChange={e => setForm({ ...form, about_customer_email: e.target.value })}
                  placeholder="customer@example.com"
                />
              </Field>
              <Field label="Start Date">
                <Input
                  type="date"
                  value={form.about_start_date}
                  onChange={e => setForm({ ...form, about_start_date: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Support Phone">
                <Input
                  value={form.about_support_phone}
                  onChange={e => setForm({ ...form, about_support_phone: e.target.value })}
                  placeholder="+92 300 0000000"
                />
              </Field>
              <Field label="Support Email">
                <Input
                  type="email"
                  value={form.about_support_email}
                  onChange={e => setForm({ ...form, about_support_email: e.target.value })}
                  placeholder="support@example.com"
                />
              </Field>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Note:</strong> Account Name, Expiry Date aur Days Left license se aate hain —
              inhein edit karne ke liye naya license code generate karein.
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function InfoCard({ icon, iconBg, label, value }: {
  icon: ReactNode; iconBg: string; label: string; value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold text-slate-900 mt-1 truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: {
  icon: ReactNode; label: string; value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-sm font-medium text-slate-800 truncate">{value}</div>
      </div>
    </div>
  );
}

function SupportCard({ icon, label, value }: {
  icon: ReactNode; label: string; value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-sm font-medium text-slate-800 truncate" title={value}>{value}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
