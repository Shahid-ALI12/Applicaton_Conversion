import { apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import type { AppCustomer, SubscriptionType } from "@/types";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { pktToday, toPktDate } from "@/lib/pkt-date";
import {
  UserPlus, Users, ShieldCheck, Trash2, Eye, EyeOff,
  Pencil, Ban, UserCheck, Loader2,
} from "lucide-react";

function getSubscriptionEnd(type: SubscriptionType, startDate: string, customDays?: number): string {
  const start = new Date(startDate);
  if (type === "monthly") start.setMonth(start.getMonth() + 1);
  else if (type === "yearly") start.setFullYear(start.getFullYear() + 1);
  else if (type === "custom" && customDays) start.setDate(start.getDate() + customDays);
  return toPktDate(start);
}

// API helpers
async function createCustomerApi(data: Record<string, unknown>): Promise<void> {
  const res = await apiFetch("/api/admin/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create");
}

async function updateCustomerApi(data: Record<string, unknown>): Promise<void> {
  const res = await apiFetch("/api/admin/customers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update");
}

async function deleteCustomerApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/customers?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

export default function AdminCustomerManagement() {
  const [customers, setCustomers] = useState<AppCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [setupMsg, setSetupMsg] = useState("");

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [subType, setSubType] = useState<SubscriptionType>("monthly");
  const [startDate, setStartDate] = useState(pktToday());
  const [customDays, setCustomDays] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // View dialog
  const [viewCustomer, setViewCustomer] = useState<AppCustomer | null>(null);

  // Edit dialog
  const [editCustomer, setEditCustomer] = useState<AppCustomer | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setSetupSql(null);
    try {
      const res = await apiFetch("/api/admin/customers");
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "TABLE_NOT_FOUND") {
          setSetupSql(json.sql);
          setSetupMsg(json.message);
          toast.error("Database table not found. See setup instructions below.");
          setCustomers([]);
          return;
        }
        throw new Error(json.error || "Failed to fetch");
      }
      const data = json.rows.map((c: Record<string, unknown>) => ({
        id: c.id as string, name: c.name as string, email: c.email as string,
        password: c.password as string, subscription_type: c.subscription_type as SubscriptionType,
        subscription_start: c.subscription_start as string, subscription_end: c.subscription_end as string,
        is_active: c.is_active as boolean, created_at: (c.created_at as string) || new Date().toISOString(),
      }));
      setCustomers(data);
    } catch (err) {
      console.error("Load customers error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // ─── Add ───
  const handleAdd = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Name, email and password are required");
      return;
    }
    setSubmitting(true);
    try {
      const end = getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined);
      await createCustomerApi({
        name: name.trim(),
        email: email.trim(),
        password,
        subscription_type: subType,
        subscription_start: startDate,
        subscription_end: end,
      });
      toast.success(`${name} registered successfully!`);
      resetAddForm();
      setAddDialogOpen(false);
      await loadCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register customer");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Edit ───
  const openEditDialog = (c: AppCustomer) => {
    setEditCustomer(c);
    setEditName(c.name);
    setEditEmail(c.email);
    setEditPassword(c.password);
    setShowEditPassword(false);
  };

  const handleEdit = async () => {
    if (!editCustomer) return;
    if (!editName.trim() || !editEmail.trim() || !editPassword.trim()) {
      toast.error("Name, email and password are required");
      return;
    }
    setSubmitting(true);
    try {
      await updateCustomerApi({
        id: editCustomer.id,
        name: editName.trim(),
        email: editEmail.trim(),
        password: editPassword,
      });
      toast.success(`${editName}'s details updated`);
      setEditCustomer(null);
      await loadCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Block/Unblock ───
  const handleToggleBlock = async (c: AppCustomer) => {
    const newActive = !c.is_active;
    if (!newActive && !confirm(`Block ${c.name}? They will not be able to login.`)) return;
    try {
      await updateCustomerApi({ id: c.id, is_active: newActive });
      toast.success(`${c.name} has been ${newActive ? "unblocked" : "blocked"}`);
      await loadCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  // ─── Delete ───
  const handleDelete = async (id: string, customerName: string) => {
    if (!confirm(`Delete ${customerName}?`)) return;
    try {
      await deleteCustomerApi(id);
      toast.success(`${customerName} deleted`);
      await loadCustomers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const resetAddForm = () => {
    setName(""); setEmail(""); setPassword(""); setSubType("monthly");
    setStartDate(pktToday()); setCustomDays("");
  };

  const activeCount = customers.filter((c) => c.is_active && new Date(c.subscription_end) > new Date()).length;
  const blockedCount = customers.filter((c) => !c.is_active || new Date(c.subscription_end) <= new Date()).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customer Management" description="Register new customers, edit their details, and manage access" />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-metrics", label: "Overview", icon: Users },
          { id: "section-all-customers", label: "All Customers", icon: UserCheck, iconColor: "text-emerald-600" },
        ]}
      />

      {/* Setup banner — shown when Supabase table doesn't exist */}
      {setupSql && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-amber-800 flex items-center gap-2">
              <span className="text-xl">⚠️</span> Database Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-700">{setupMsg}</p>
            <ol className="text-sm text-amber-800 list-decimal list-inside space-y-1">
              <li>Open your <strong>Supabase Dashboard</strong></li>
              <li>Go to <strong>SQL Editor</strong> (left sidebar)</li>
              <li>Paste the SQL below and click <strong>Run</strong></li>
              <li>Refresh this page after running</li>
            </ol>
            <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto max-h-64 relative">
              <code>{setupSql}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(setupSql); toast.success("SQL copied!"); }}
                className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded cursor-pointer"
              >Copy</button>
            </pre>
            <Button onClick={loadCustomers} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer">
              <Loader2 className="w-4 h-4 mr-2" />Refresh After Setup
            </Button>
          </CardContent>
        </Card>
      )}

      <div id="section-metrics" className="grid grid-cols-1 sm:grid-cols-3 gap-4 scroll-mt-24">
        <MetricCard title="Total Customers" value={customers.length} icon={Users} color="text-blue-500" />
        <MetricCard title="Active" value={activeCount} icon={ShieldCheck} color="text-emerald-500" />
        <MetricCard title="Blocked/Expired" value={blockedCount} icon={Ban} color="text-red-500" />
      </div>

      <Card id="section-all-customers" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">All Customers</CardTitle>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                <UserPlus className="w-4 h-4 mr-2" />Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white">
              <DialogHeader><DialogTitle>Register New Customer</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="customer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input type={showAddPassword ? "text" : "password"} placeholder="Login password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowAddPassword(!showAddPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                      {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subscription Type</Label>
                  <Select value={subType} onValueChange={(v) => setSubType(v as SubscriptionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly (1 Month)</SelectItem>
                      <SelectItem value="yearly">Yearly (1 Year)</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {subType === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Days</Label>
                    <Input type="number" placeholder="Number of days" value={customDays} onChange={(e) => setCustomDays(e.target.value)} min={1} max={3650} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-medium text-slate-700">Subscription Preview:</div>
                  <div className="flex justify-between"><span className="text-slate-500">Type:</span><span className="font-medium capitalize">{subType}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">End:</span><span className="font-medium text-emerald-600">{getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined)}</span></div>
                </div>
                <Button onClick={handleAdd} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  {submitting ? "Registering..." : "Register Customer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No customers registered yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => {
                    const isExpired = new Date(c.subscription_end) <= new Date();
                    const status = !c.is_active ? "blocked" : isExpired ? "expired" : "active";
                    return (
                      <TableRow key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{c.email}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-xs">{c.subscription_type}</Badge></TableCell>
                        <TableCell className="text-sm text-slate-500">{c.subscription_end}</TableCell>
                        <TableCell>
                          <Badge className={status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : status === "expired" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewCustomer(c)} className="h-8 text-xs cursor-pointer" title="View"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(c)} className="h-8 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer" title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleToggleBlock(c)} className={`h-8 text-xs cursor-pointer ${c.is_active ? "text-orange-500 hover:text-orange-700 hover:bg-orange-50" : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"}`} title={c.is_active ? "Block" : "Unblock"}>
                              {c.is_active ? <Ban className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, c.name)} className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewCustomer} onOpenChange={() => setViewCustomer(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader><DialogTitle>Customer Details</DialogTitle></DialogHeader>
          {viewCustomer && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-slate-500 text-xs">Name</div><div className="font-semibold">{viewCustomer.name}</div></div>
                <div><div className="text-slate-500 text-xs">Email</div><div className="font-semibold">{viewCustomer.email}</div></div>
                <div><div className="text-slate-500 text-xs">Password</div><div className="font-mono font-semibold">{viewCustomer.password}</div></div>
                <div><div className="text-slate-500 text-xs">Status</div><div className="font-semibold">{!viewCustomer.is_active ? <Badge className="bg-red-100 text-red-700">Blocked</Badge> : new Date(viewCustomer.subscription_end) <= new Date() ? <Badge className="bg-amber-100 text-amber-700">Expired</Badge> : <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>}</div></div>
                <div><div className="text-slate-500 text-xs">Subscription</div><div className="font-semibold capitalize">{viewCustomer.subscription_type}</div></div>
                <div><div className="text-slate-500 text-xs">Days Left</div><div className="font-semibold">{new Date(viewCustomer.subscription_end) <= new Date() ? "Expired" : Math.ceil((new Date(viewCustomer.subscription_end).getTime() - Date.now()) / 86400000) + " days"}</div></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={(open) => { if (!open) setEditCustomer(null); }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader><DialogTitle>Edit Customer — {editCustomer?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Full Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input type={showEditPassword ? "text" : "password"} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleEdit} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
                {submitting ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditCustomer(null)} className="flex-1 cursor-pointer">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}