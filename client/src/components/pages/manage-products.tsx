import { apiFetch } from "@/lib/api";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import ConfirmAction from "@/components/shared/confirm-action";
import type { Product, ProductStock } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PackagePlus,
  Save,
  CheckCircle2,
  Info,
  BoxesIcon,
  Loader2,
  Trash2,
  RotateCcw,
  Ban,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { fetchCached, invalidateCache, apiError, extractApiError } from "@/store";

export default function ManageProducts() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [locationId, setLocationId] = useState<number>(2); // default Shop
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());
  const [updating, setUpdating] = useState<Set<number>>(new Set());

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);

  // Confirm dialog (shared by both soft-delete and permanent-delete)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [confirmMode, setConfirmMode] = useState<"soft" | "permanent">("soft");
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    let pList: Product[] = [], sList: ProductStock[] = [];
    const failed: string[] = [];
    try { pList = await fetchCached<Product>("products", "/api/products", "rows"); }
    catch { failed.push("products"); }
    try { sList = await fetchCached<ProductStock>("stock", "/api/stock", "rows"); }
    catch { failed.push("stock"); }
    setProducts(pList);
    setStockData(sList);
    if (failed.length > 0) toast.error(`Failed to load: ${failed.join(", ")}`);
    else {
      const initial: Record<number, string> = {};
      pList.forEach((p: Product) => { initial[p.id] = String(p.default_rate); });
      setEditedRates(initial);
    }

  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const handleRateChange = useCallback((id: number, value: string) => {
    if (value === "" || /^\d*$/.test(value)) {
      setEditedRates((prev) => ({ ...prev, [id]: value }));
      setUpdatedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const handleUpdateRate = useCallback(
    async (id: number) => {
      const rateValue = Number(editedRates[id]);
      if (!rateValue || rateValue <= 0) {
        toast.error("Please enter a valid rate greater than 0.");
        return;
      }

      setUpdating((prev) => new Set(prev).add(id));
      try {
        const res = await apiFetch(`/api/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default_rate: rateValue }),
        });
        if (!res.ok) throw new Error(await apiError(res, "Failed to update rate"));
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, default_rate: rateValue } : p))
        );
        setUpdatedIds((prev) => new Set(prev).add(id));
        invalidateCache("products");
        toast.success("Rate updated successfully!", {
          description: `New rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
        });
      } catch {
        toast.error("Failed to update rate");
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [editedRates]
  );

  const handleAddProduct = useCallback(async () => {
    const trimmedName = newName.trim();
    const rateValue = Number(newRate);

    if (!trimmedName) {
      toast.error("Product name is required.");
      return;
    }
    if (!rateValue || rateValue <= 0) {
      toast.error("Please enter a valid starting rate greater than 0.");
      return;
    }
    if (products.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase() && !p.deleted_at)) {
      toast.error("A product with this name already exists.");
      return;
    }

    setAdding(true);
    try {
      const res = await apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, default_rate: rateValue }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Failed to create product"));
      const data = await res.json();
      const newProduct = data;
      if (!newProduct?.id) throw new Error("Invalid response from server");
      setProducts((prev) => [...prev, newProduct]);
      setEditedRates((prev) => ({ ...prev, [newProduct.id]: String(rateValue) }));
      setNewName("");
      setNewRate("");
      invalidateCache("products");
      toast.success(`"${trimmedName}" added successfully!`, {
        description: `Starting rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to add product");
    } finally {
      setAdding(false);
    }
  }, [newName, newRate, products]);

  // ─── Soft-delete (deactivate) ───
  const askSoftDelete = useCallback((product: Product) => {
    setConfirmProduct(product);
    setConfirmMode("soft");
    setConfirmOpen(true);
  }, []);

  // ─── Permanent delete (tombstone) ───
  const askPermanentDelete = useCallback((product: Product) => {
    setConfirmProduct(product);
    setConfirmMode("permanent");
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmProduct) return;
    setDeleting(true);
    try {
      const isPermanent = confirmMode === "permanent";
      const url = isPermanent
        ? `/api/products/${confirmProduct.id}/permanent`
        : `/api/products/${confirmProduct.id}`;
      const res = await apiFetch(url, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiError(err, "Failed to delete product"));
      }
      const data = await res.json();
      invalidateCache("products");
      invalidateCache("stock");

      if (isPermanent) {
        // Permanent delete → remove from local state entirely.
        // Historical sales/purchases keep their product_id link and the
        // product name will still render on old receipts because the
        // row is tombstoned (deleted_at set), not physically removed.
        setProducts((prev) => prev.filter((p) => p.id !== confirmProduct.id));
        setStockData((prev) => prev.filter((s) => s.product_id !== confirmProduct.id));
        toast.success(`"${confirmProduct.name}" permanently deleted`, {
          description:
            "Product sabhi dropdowns aur Manage Products list se hata diya gaya. Historical sales/purchases records safe hain — purani receipts par product name abhi bhi dikhega.",
          duration: 7000,
        });
      } else if (data.soft) {
        // Soft-delete → mark inactive in local state, keep visible in Inactive section
        setProducts((prev) =>
          prev.map((p) => (p.id === confirmProduct.id ? { ...p, is_active: false } : p))
        );
        toast.success(`"${confirmProduct.name}" deactivated`, {
          description:
            "Product inactive ho gaya. Nai sales/purchases me use nahi hoga. Agar chahein to neeche 'Inactive Products' section se restore ya permanently delete kar sakte hain.",
          duration: 6000,
        });
      } else {
        // No references → API hard-deleted (rare path for soft-delete flow)
        setProducts((prev) => prev.filter((p) => p.id !== confirmProduct.id));
        setStockData((prev) => prev.filter((s) => s.product_id !== confirmProduct.id));
        toast.success(`"${confirmProduct.name}" deleted`, {
          description: "Product database se remove ho gaya — koi historical records nahi the.",
        });
      }
      setConfirmOpen(false);
      setConfirmProduct(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  }, [confirmProduct, confirmMode]);

  const handleRestore = useCallback(async (product: Product) => {
    try {
      const res = await apiFetch(`/api/products/${product.id}/restore`, { method: "PUT" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiError(err, "Failed to restore product"));
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: true } : p))
      );
      invalidateCache("products");
      toast.success(`"${product.name}" restored`, {
        description: "Product dobara active ho gaya. Nai sales/purchases me use kar sakte hain.",
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to restore product");
    }
  }, []);

  // ─── Download Excel helper ───
  // Builds an XLSX workbook from a list of products with stock info merged in,
  // then triggers a browser download. Filename includes a date stamp so
  // repeated exports don't overwrite each other.
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const downloadProductsExcel = useCallback(
    async (list: Product[], kind: "active" | "inactive") => {
      if (list.length === 0) {
        toast.error(`No ${kind} products to download.`);
        return;
      }
      setDownloadingExcel(true);
      try {
        const { downloadExcel } = await import("@/lib/download-excel");
        const rows = list.map((p) => {
          const stockEntry = stockData.find(
            (s) => s.product_id === p.id && s.location_id === locationId
          );
          return {
            id: p.id,
            name: p.name,
            default_rate: p.default_rate,
            stock_bags: stockEntry?.stock_quantity ?? 0,
            is_active: p.is_active ? "Yes" : "No",
            created_at: p.created_at,
          };
        });
        await downloadExcel(rows, [
          { key: "id", label: "ID" },
          { key: "name", label: "Product Name" },
          { key: "default_rate", label: "Rate (Rs./bag)", align: "right" },
          { key: "stock_bags", label: "Stock (bags)", align: "right" },
          { key: "is_active", label: "Active" },
          { key: "created_at", label: "Created At" },
        ], `${kind}-products`);
        toast.success(`${kind === "active" ? "Active" : "Inactive"} products Excel downloaded`, {
          description: `${rows.length} product(s) exported.`,
        });
      } catch (e: any) {
        toast.error(e?.message || "Excel download failed");
      } finally {
        setDownloadingExcel(false);
      }
    },
    [stockData, locationId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Tombstoned products (deleted_at set) are NEVER returned by GET /api/products
  // (filtered server-side), so we don't need to filter them again here.
  // The lists below show only living products: active + soft-deleted (inactive).
  const activeProducts = products.filter((p) => p.is_active);
  const inactiveProducts = products.filter((p) => !p.is_active);

  const confirmTitle =
    confirmMode === "permanent"
      ? `Permanently delete "${confirmProduct?.name ?? ""}"?`
      : `Deactivate "${confirmProduct?.name ?? ""}"?`;

  const confirmDescription =
    confirmMode === "permanent"
      ? "Ye product sabhi dropdowns, sale/purchase forms, aur is list se hamesha ke liye hata diya jayega. Lekin is product ki purani sales aur purchases records SAFE rahengi — purani receipts par product name abhi bhi dikhega. Ye action reverse nahi hoga."
      : "Ye product inactive ho jayega (nai sales/purchases me use nahi hoga) lekin is list ke 'Inactive Products' section me dikhayi dega. Wahan se aap isko Restore ya Permanently Delete kar sakte hain. Historical records safe rahenge.";

  const confirmLabel =
    confirmMode === "permanent"
      ? (deleting ? "Deleting..." : "Yes, Permanently Delete")
      : (deleting ? "Deactivating..." : "Yes, Deactivate");

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmProduct(null); }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        variant="danger"
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />

      <PageHeader title="Manage Products & Rates" subtitle="Add products, set default selling rates, deactivate, or permanently delete." />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-active", label: "Active Products", icon: BoxesIcon, iconColor: "text-emerald-600" },
          ...(inactiveProducts.length > 0 ? [{ id: "section-inactive", label: "Inactive Products", icon: Ban }] : []),
          { id: "section-add-new", label: "Add New Product", icon: PackagePlus },
        ]}
      />

      {/* ───────────── LOCATION FILTER ───────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">Stock Location:</Label>
        <LocationSelect value={locationId} onChange={setLocationId} />
        <span className="text-xs text-slate-500">Stock column below reflects the selected location.</span>
      </div>

      {/* ───────────── ACTIVE PRODUCTS ───────────── */}
      <section id="section-active" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden scroll-mt-24" aria-label="Active products">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BoxesIcon className="size-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Active Products</h2>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {activeProducts.length}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadProductsExcel(activeProducts, "active")}
            disabled={activeProducts.length === 0 || downloadingExcel}
            className="gap-1.5 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 self-start sm:self-auto"
            title="Download active products as Excel"
          >
            {downloadingExcel ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {downloadingExcel ? "Downloading..." : "Download Excel"}
          </Button>
        </div>

        <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 text-sm text-amber-800">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>Rates here are just the starting suggestion shown when entering a sale — you can always override the rate for any individual sale. Trash icon product ko inactive kar dega (soft-delete). Permanently delete karne ke liye neeche <strong>Inactive Products</strong> section me jayein.</p>
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">#</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Product Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">Rate (Rs./bag)</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Stock (bags)</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeProducts.map((product, index) => {
                const isUpdated = updatedIds.has(product.id);
                const isUpdating = updating.has(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="text-center text-slate-400 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">{product.name}</TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editedRates[product.id] ?? ""}
                        onChange={(e) => handleRateChange(product.id, e.target.value)}
                        className={cn(
                          "w-28 mx-auto text-center h-8 text-sm font-mono tabular-nums",
                          isUpdated && "border-emerald-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-200"
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const entry = stockData.find(
                          (s) => s.product_id === product.id && s.location_id === locationId
                        );
                        const stock = entry?.stock_quantity ?? 0;
                        return (
                          <span className={cn("inline-flex items-center gap-1 text-sm font-medium px-2.5 py-0.5 rounded-full", stock > 0 ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50")}>
                            {stock} bags
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant={isUpdated ? "ghost" : "outline"}
                          onClick={() => handleUpdateRate(product.id)}
                          disabled={isUpdating}
                          className={cn("gap-1.5 text-xs font-semibold transition-all", isUpdated && "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50")}
                        >
                          {isUpdating ? <Loader2 className="size-3.5 animate-spin" /> : isUpdated ? <><CheckCircle2 className="size-3.5" /> Saved</> : <><Save className="size-3.5" /> Update</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => askSoftDelete(product)}
                          disabled={isUpdating}
                          className="gap-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          title="Deactivate product (soft delete)"
                        >
                          <Ban className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                    No active products yet — add one below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ───────────── INACTIVE PRODUCTS ───────────── */}
      {inactiveProducts.length > 0 && (
        <section id="section-inactive" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden scroll-mt-24" aria-label="Inactive products">
          <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ban className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">Inactive Products</h2>
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {inactiveProducts.length}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadProductsExcel(inactiveProducts, "inactive")}
              disabled={downloadingExcel}
              className="gap-1.5 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 self-start sm:self-auto"
              title="Download inactive products as Excel"
            >
              {downloadingExcel ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {downloadingExcel ? "Downloading..." : "Download Excel"}
            </Button>
          </div>

          <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200/60 px-4 py-3 text-sm text-blue-800">
            <Info className="size-4 mt-0.5 shrink-0" />
            <p>
              Yahan <strong>Restore</strong> se product dobara active kar sakte hain, ya <strong>Delete Permanently</strong> se hamesha ke liye hata sakte hain. Permanently delete karne ke baad bhi is product ki <strong>historical sales/purchases records safe rahengi</strong> — purani receipts par name abhi bhi dikhega. Bas nai sales/purchases me yeh product available nahi hoga.
            </p>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Product Name</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Last Rate (Rs./bag)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Stock (bags)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveProducts.map((product, index) => (
                  <TableRow key={product.id} className="bg-slate-50/40">
                    <TableCell className="text-center text-slate-400 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>{product.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                          Inactive
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600 font-mono tabular-nums">
                      Rs. {(product.default_rate ?? 0).toLocaleString("en-PK")}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const entry = stockData.find(
                          (s) => s.product_id === product.id && s.location_id === locationId
                        );
                        const stock = entry?.stock_quantity ?? 0;
                        return (
                          <span className="text-sm text-slate-500 font-medium">
                            {stock} bags
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(product)}
                          className="gap-1.5 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                          title="Reactivate product"
                        >
                          <RotateCcw className="size-3.5" /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => askPermanentDelete(product)}
                          className="gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Permanently delete (historical records stay safe)"
                        >
                          <Trash2 className="size-3.5" /> Delete Permanently
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* ───────────── ADD NEW PRODUCT ───────────── */}
      <section id="section-add-new" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 scroll-mt-24" aria-label="Add a new product">
        <div className="flex items-center gap-2 mb-5">
          <PackagePlus className="size-5 text-slate-700" />
          <h2 className="text-lg font-bold text-slate-900">Add a New Product</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full space-y-1.5">
            <Label htmlFor="new-product-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</Label>
            <Input id="new-product-name" placeholder="e.g. Barley (Jau)" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label htmlFor="new-product-rate" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Starting Rate (Rs./bag)</Label>
            <Input id="new-product-rate" type="text" inputMode="numeric" placeholder="e.g. 3000" value={newRate} onChange={(e) => { if (e.target.value === "" || /^\d*$/.test(e.target.value)) setNewRate(e.target.value); }} className="h-10 font-mono tabular-nums" />
          </div>
          <Button onClick={handleAddProduct} className="h-10 px-6 gap-2 font-semibold shrink-0" disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />} Add Product
          </Button>
        </div>
      </section>
    </div>
  );
}
