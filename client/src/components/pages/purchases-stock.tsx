import { apiFetch } from "@/lib/api";

import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { fetchCached, invalidateCache, apiError } from "@/store";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import type { Product, Customer, Purchase, Supplier, ProductStock, Location } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Package,
  ShoppingBag,
  Trash2,
  Save,
  AlertTriangle,
  UserCheck,
  Truck,
  Scale,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle2,
  PackagePlus,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Receipt as ReceiptIcon,
  Search as SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { shareBillOnWhatsApp } from "@/lib/share-whatsapp";
import { showWhatsAppShareToast } from "@/components/share-whatsapp-toast";
import { pktToday } from "@/lib/pkt-date";

const DEFAULT_BAG_WEIGHT = 50;

function fmt(n: number) {
  return n.toLocaleString("en-PK");
}

function stockKey(productId: number, locationId: number | null) {
  return locationId === null ? `p${productId}` : `${productId}-${locationId}`;
}

interface StockRow {
  productId: number;
  productName: string;
  bagWeight: number;
  bags: number;
  totalKg: number;
}

export default function PurchasesStockPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  // Master data
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Purchase History pagination (10 records per page)
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  // Purchase History search (client-side, debounced)
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearchDebounced, setHistorySearchDebounced] = useState("");

  // Section 1: Stock state — single unified table (no more Farm/Shop tabs)
  // (Now per-location: filter by selected location)
  const [stockLocationId, setStockLocationId] = useState<number>(2); // default Shop
  const [purchaseLocationId, setPurchaseLocationId] = useState<number>(2); // default Shop
  const [allStock, setAllStock] = useState<StockRow[]>([]);
  const [savedAllStock, setSavedAllStock] = useState<boolean>(false);
  const [stockSavedAt, setStockSavedAt] = useState<Date | null>(null);

  // Inline Add Product state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductRate, setNewProductRate] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  // Section 2: Purchase form state
  const [purchaseType, setPurchaseType] = useState<"supplier" | "settlement">("supplier");
  const [purchaseUnit, setPurchaseUnit] = useState<"bags" | "kg">("bags");
  const [supplierName, setSupplierName] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("");
  const [bagWeight, setBagWeight] = useState("50");
  const [rate, setRate] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [notes, setNotes] = useState("");

  const today = pktToday();

  const buildStockRows = useCallback((): StockRow[] => {
    return products.map((p) => {
      // Find stock for this product AT THE SELECTED location
      const entry = stockData.find(
        (s) => s.product_id === p.id && s.location_id === stockLocationId
      );
      const bags = entry?.stock_quantity ?? 0;
      const bw = entry?.last_bag_weight_kg ?? DEFAULT_BAG_WEIGHT;
      return {
        productId: p.id,
        productName: p.name,
        bagWeight: Number(bw),
        bags: Number(bags),
        totalKg: Number(bags) * Number(bw),
      };
    });
  }, [products, stockData, stockLocationId]);

  // Load each data source independently — one failure must not block the rest
  const loadAllData = useCallback(async () => {
    const errors: string[] = [];

    // Products
    try {
      const list = await fetchCached<Product>("products", "/api/products", "products");
      setProducts(list);
    } catch (e: any) {
      errors.push("Products: " + (e.message || "unknown error"));
    }

    // Customers
    try {
      const list = await fetchCached<Customer>("customers", "/api/customers?active=true", "customers");
      setCustomers(list);
    } catch (e: any) {
      errors.push("Customers: " + (e.message || "unknown error"));
    }

    // Suppliers
    try {
      const list = await fetchCached<Supplier>("suppliers", "/api/suppliers", "suppliers");
      setSuppliers(list);
    } catch (e: any) {
      errors.push("Suppliers: " + (e.message || "unknown error"));
    }

    // Stock
    try {
      const list = await fetchCached<ProductStock>("stock", "/api/stock", "stock");
      setStockData(list);
    } catch (e: any) {
      errors.push("Stock: " + (e.message || "unknown error"));
    }

    // Purchases (ALL records for history — always fetch fresh)
    try {
      const puRes = await apiFetch(`/api/purchases`);
      if (puRes.ok) {
        const puData = await puRes.json();
        setPurchases(puData.purchases ?? []);
      } else {
        const errDetail = await apiError(puRes, "Failed to fetch purchases");
        errors.push("Purchases: " + errDetail);
      }
    } catch (e: any) {
      errors.push("Purchases: " + (e.message || "unknown error"));
    }

    // Locations (for bill/receipt location name lookup)
    try {
      const locRes = await apiFetch("/api/locations");
      if (locRes.ok) {
        const locData = await locRes.json();
        if (Array.isArray(locData.locations)) setLocations(locData.locations);
      }
    } catch {
      // Non-critical — bill/receipt will fall back to "Farmhouse"
    }

    setLoadErrors(errors);
    if (errors.length > 0 && errors.length < 6) {
      toast.error(`${errors.length} data source(s) failed to load`);
    } else if (errors.length >= 6) {
      toast.error("All data sources failed — check your connection");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAllData();
      setLoading(false);
    })();
  }, [loadAllData]);

  useEffect(() => {
    // Build stock rows whenever products or stock data changes
    // (works even with 0 products — just shows an empty table)
    setAllStock(buildStockRows());
  }, [products, stockData, buildStockRows]);

  const goodsValue = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    return qty * r;
  }, [quantity, rate]);

  const settlementValue = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    return qty * r;
  }, [quantity, rate]);

  const totalCashPaid = useMemo(
    () => purchases.reduce((sum, p) => sum + p.cash_paid, 0),
    [purchases]
  );

  const creditCustomers = useMemo(
    () => customers.filter((c) => c.type === "credit" && c.is_active),
    [customers]
  );

  const selectedProductRate = useMemo(() => {
    const p = products.find((pr) => pr.id === Number(selectedProduct));
    return p?.default_rate ?? 0;
  }, [selectedProduct, products]);

  const updateBags = useCallback(
    (productId: number, newBags: number, bw: number) => {
      setAllStock((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, bags: newBags, totalKg: newBags * bw }
            : row
        )
      );
      setSavedAllStock(false);
    },
    []
  );

  const updateTotalKg = useCallback(
    (productId: number, newTotalKg: number, bw: number) => {
      setAllStock((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, totalKg: newTotalKg, bags: bw > 0 ? Math.round((newTotalKg / bw) * 100) / 100 : 0 }
            : row
        )
      );
      setSavedAllStock(false);
    },
    []
  );

  const updateBagWeight = useCallback(
    (productId: number, newBw: number, currentBags: number) => {
      setAllStock((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, bagWeight: newBw, totalKg: currentBags * newBw }
            : row
        )
      );
      setSavedAllStock(false);
    },
    []
  );

  const handleSaveStock = async () => {
    setSavedAllStock(false);
    try {
      const savedRows: { name: string; bags: number }[] = [];
      for (const row of allStock) {
        const res = await apiFetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: row.productId,
            location_id: stockLocationId,
            stock_quantity: row.totalKg > 0 ? Math.round(row.bags * 100) / 100 : 0,
            last_bag_weight_kg: row.bagWeight,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || err.error || "Failed to update stock");
        }
        savedRows.push({ name: row.productName, bags: row.totalKg > 0 ? Math.round(row.bags * 100) / 100 : 0 });
      }
      await loadAllData();
      const totalProducts = savedRows.length;
      const nonZero = savedRows.filter(r => r.bags > 0).length;
      toast.success("✓ Changes saved successfully!", {
        description: `${totalProducts} product(s) updated • ${nonZero} with stock • ${totalProducts - nonZero} zeroed out`,
        duration: 5000,
      });
      setSavedAllStock(true);
      setStockSavedAt(new Date());
    } catch (e: any) {
      toast.error(e.message || "Failed to save stock");
    }
  };

  const handleAddProductInline = async () => {
    const name = newProductName.trim();
    const rate = Number(newProductRate);
    if (!name) { toast.error("Product name is required."); return; }
    if (!rate || rate <= 0) { toast.error("Please enter a valid rate greater than 0."); return; }
    if (products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A product with this name already exists.");
      return;
    }

    setAddingProduct(true);
    try {
      const res = await apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, default_rate: rate }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Failed to create product"));
      const data = await res.json();
      const newProduct: Product = data.product;
      if (!newProduct) throw new Error("Invalid response from server");

      setProducts((prev) => [...prev, newProduct]);
      // Add a new stock row to the table so the user can enter its opening stock
      setAllStock((prev) => [
        ...prev,
        {
          productId: newProduct.id,
          productName: newProduct.name,
          bagWeight: 50,
          bags: 0,
          totalKg: 0,
        },
      ]);
      invalidateCache("products");
      setNewProductName("");
      setNewProductRate("");
      setShowAddProduct(false);
      setSavedAllStock(false);
      toast.success(`"${name}" added`, {
        description: "Ab is product ka opening stock neeche table me enter karein aur Save Stock Changes par click karein.",
        duration: 5000,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to add product");
    } finally {
      setAddingProduct(false);
    }
  };

  const resetForm = () => {
    setSupplierName("");
    setSelectedSupplier("");
    setSelectedProduct("");
    setSelectedCustomer("");
    setQuantity("");
    setBagWeight("50");
    setRate("");
    setCashPaid("");
    setNotes("");
  };

  const handleAddSupplierPurchase = async () => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    const cp = parseFloat(cashPaid) || 0;
    const bw = parseFloat(bagWeight) || 0;
    const product = products.find((p) => p.id === Number(selectedProduct));

    if (!product) {
      toast.error("Please select a product");
      return;
    }
    if (qty <= 0 || r <= 0) {
      toast.error("Quantity and rate must be greater than 0");
      return;
    }

    // Create supplier if new name entered
    let supplierId = selectedSupplier ? Number(selectedSupplier) : null;
    if (!supplierId && supplierName.trim()) {
      try {
        const res = await apiFetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: supplierName.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || err.error || "Failed to create supplier");
        }
        const data = await res.json();
        supplierId = data.supplier?.id;
        if (data.supplier) setSuppliers((prev) => [...prev, data.supplier]);
      } catch (e: any) {
        toast.error(e.message || "Failed to create supplier");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: today,
          product_id: product.id,
          quantity: qty,
          rate_per_bag: r,
          supplier_id: supplierId,
          settled_by_customer_id: null,
          cash_paid: cp,
          location_id: purchaseLocationId,
          notes: notes?.trim() || null,
          unit_type: purchaseUnit,
          bag_weight_kg: purchaseUnit === "bags" ? bw : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to record purchase");
      }
      resetForm();
      invalidateCache("stock");
      invalidateCache("suppliers");
      toast.success("Purchase recorded successfully!");
      await loadAllData();
    } catch (e: any) {
      toast.error(e.message || "Failed to record purchase");
    } finally {
      setSaving(false);
    }
  };

  const handleRecordSettlement = async () => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    const bw = parseFloat(bagWeight) || 0;
    const product = products.find((p) => p.id === Number(selectedProduct));
    const customer = customers.find((c) => c.id === Number(selectedCustomer));

    if (!product || !customer) {
      toast.error("Please select customer and product");
      return;
    }
    if (qty <= 0 || r <= 0) {
      toast.error("Quantity and rate must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: today,
          product_id: product.id,
          quantity: qty,
          rate_per_bag: r,
          supplier_id: null,
          settled_by_customer_id: customer.id,
          cash_paid: 0,
          location_id: purchaseLocationId,
          notes: notes?.trim() || null,
          unit_type: purchaseUnit,
          bag_weight_kg: purchaseUnit === "bags" ? bw : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to record settlement");
      }
      resetForm();
      toast.success("Settlement recorded successfully!");
      await loadAllData();
    } catch (e: any) {
      toast.error(e.message || "Failed to record settlement");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePurchase = async (id: number) => {
    try {
      const res = await apiFetch(`/api/purchases?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiError(res, "Failed to delete purchase"));
      setPurchases((prev) => prev.filter((p) => p.id !== id));
      toast.success("Purchase deleted.");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete purchase");
    }
  };

  // ── Location name lookup (for bill/receipt) ──
  const getLocationName = (locId: number | null): string => {
    if (!locId) return "Farmhouse";
    const loc = locations.find((l) => l.id === locId);
    return loc?.name ?? "Farmhouse";
  };

  // ── Download Bill PDF for a single purchase row ──
  const handleDownloadBill = async (p: Purchase) => {
    if (downloadingId !== null) return;
    setDownloadingId(p.id);
    try {
      // Resolve joined objects from local state (p.products/p.suppliers/p.customers
      // may be incomplete depending on the API select list).
      const product = products.find((pr) => pr.id === p.product_id) ?? null;
      const customer = p.settled_by_customer_id
        ? (customers.find((c) => c.id === p.settled_by_customer_id) ?? null)
        : null;
      // For supplier purchases, p.suppliers may have come from the API join;
      // fall back to local suppliers list.
      const supplier = !p.settled_by_customer_id
        ? (p.suppliers ?? suppliers.find((s) => s.id === p.supplier_id) ?? null)
        : null;

      const { generatePurchaseBillPDF } = await import("@/lib/generate-purchase-bill");
      const billResult = await generatePurchaseBillPDF({
        purchase: p,
        customer,
        supplier,
        product,
        locationName: getLocationName(p.location_id),
        generatedAt: new Date().toLocaleString("en-PK"),
      });
      toast.success("Bill downloaded.", {
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
    } catch (err: any) {
      console.error("Bill download error:", err);
      toast.error(err?.message || "Failed to generate bill.");
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Download Receipt PDF for a single purchase row ──
  const handleDownloadReceipt = async (p: Purchase) => {
    if (downloadingId !== null) return;
    setDownloadingId(p.id);
    try {
      const product = products.find((pr) => pr.id === p.product_id) ?? null;
      const customer = p.settled_by_customer_id
        ? (customers.find((c) => c.id === p.settled_by_customer_id) ?? null)
        : null;
      const supplier = !p.settled_by_customer_id
        ? (p.suppliers ?? suppliers.find((s) => s.id === p.supplier_id) ?? null)
        : null;

      const { generatePurchaseReceiptPDF } = await import("@/lib/generate-purchase-receipt");
      const receiptResult = await generatePurchaseReceiptPDF({
        purchase: p,
        customer,
        supplier,
        product,
        locationName: getLocationName(p.location_id),
        generatedAt: new Date().toLocaleString("en-PK"),
      });
      toast.success("Receipt downloaded.", {
        description: "Share on WhatsApp with the client?",
        action: {
          label: "Share on WhatsApp",
          onClick: () => {
            const result = shareBillOnWhatsApp(receiptResult);
            showWhatsAppShareToast(result);
          },
        },
        duration: 12000,
      });
    } catch (err: any) {
      console.error("Receipt download error:", err);
      toast.error(err?.message || "Failed to generate receipt.");
    } finally {
      setDownloadingId(null);
    }
  };

  const totalPurchaseValue = useMemo(
    () => purchases.reduce((sum, p) => sum + p.quantity * p.rate_per_bag, 0),
    [purchases]
  );

  const getPurchaseValue = (p: Purchase) => p.quantity * p.rate_per_bag;

  // ── Purchase History pagination (client-side, 10 per page) ──
  // Filter by search query first (across product / customer / supplier / notes / date)
  const filteredPurchases = useMemo(() => {
    if (!historySearchDebounced.trim()) return purchases;
    const q = historySearchDebounced.trim().toLowerCase();
    return purchases.filter((p) => {
      const source = p.settled_by_customer_id
        ? p.customers?.name ?? ""
        : p.suppliers?.name ?? "";
      return [
        p.products?.name ?? "",
        source,
        p.purchase_date ?? "",
        p.notes ?? "",
        String(p.id),
      ].some((s) => s.toLowerCase().includes(q));
    });
  }, [purchases, historySearchDebounced]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredPurchases.length / historyPageSize));

  // Clamp current page if filtered list shrank (e.g. after delete or new search)
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);

  const pagedPurchases = useMemo(() => {
    const from = (safeHistoryPage - 1) * historyPageSize;
    return filteredPurchases.slice(from, from + historyPageSize);
  }, [filteredPurchases, safeHistoryPage, historyPageSize]);

  // Debounce search input + reset to page 1 on new query
  useEffect(() => {
    const t = setTimeout(() => {
      setHistorySearchDebounced(historySearchInput);
      setHistoryPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [historySearchInput]);

  const handleDownloadExcel = async () => {
    try {
      toast.loading("Generating Excel…", { id: "excel-dl" });
      const XLSX = await import("xlsx");
      // Fetch all purchases (not just today)
      const res = await apiFetch("/api/purchases");
      if (!res.ok) throw new Error("Failed to fetch purchases");
      const { purchases: allPurchases } = await res.json();

      const rows = (allPurchases || []).map((p: any, idx: number) => ({
        "#": idx + 1,
        Date: p.purchase_date,
        Source: p.settled_by_customer_id
          ? `${p.customers?.name || "—"} (Settlement)`
          : p.suppliers?.name || "—",
        Type: p.settled_by_customer_id ? "Settlement" : "Supplier",
        Product: p.products?.name || "—",
        "Unit Type": p.unit_type === "bags" ? "Bags" : "KG (loose)",
        Quantity: p.quantity,
        "Rate (Rs.)": p.rate_per_bag,
        "Value (Rs.)": p.quantity * p.rate_per_bag,
        "Cash Paid (Rs.)": p.cash_paid,
        Notes: p.notes || "",
      }));

      // Add total row
      const totalVal = rows.reduce((s: number, r: any) => s + (r["Value (Rs.)"] || 0), 0);
      const totalCash = rows.reduce((s: number, r: any) => s + (r["Cash Paid (Rs.)"] || 0), 0);
      rows.push({
        "#": "",
        Date: "",
        Source: "",
        Type: "",
        Product: "",
        "Unit Type": "",
        Quantity: "",
        "Rate (Rs.)": "",
        "Value (Rs.)": totalVal,
        "Cash Paid (Rs.)": totalCash,
        Notes: "TOTAL",
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      ws["!cols"] = [
        { wch: 5 },  // #
        { wch: 12 }, // Date
        { wch: 25 }, // Source
        { wch: 12 }, // Type
        { wch: 20 }, // Product
        { wch: 12 }, // Unit Type
        { wch: 10 }, // Quantity
        { wch: 12 }, // Rate
        { wch: 14 }, // Value
        { wch: 14 }, // Cash Paid
        { wch: 25 }, // Notes
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "All Purchases");
      XLSX.writeFile(wb, `purchases_${today}.xlsx`);
      toast.success("Excel downloaded!", { id: "excel-dl" });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate Excel", { id: "excel-dl" });
    }
  };

  const getQuantityLabel = (p: Purchase) => {
    if (p.unit_type === "bags") {
      return `${p.quantity} bag${p.quantity !== 1 ? "s" : ""}`;
    }
    return `${p.quantity} kg`;
  };

  const renderStockTable = (stock: StockRow[]) => {
    const hasNegative = stock.some((row) => row.totalKg < 0);

    return (
      <div className="space-y-4">
        {/* Inline Add Product panel */}
        {showAddProduct ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="size-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-800">Add a new product</h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowAddProduct(false); setNewProductName(""); setNewProductRate(""); }}
                className="size-7 p-0 text-slate-500 hover:text-slate-900"
                title="Cancel"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</Label>
                <Input
                  autoFocus
                  placeholder="e.g. Barley (Jau)"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !addingProduct) handleAddProductInline(); }}
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-44 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Default Rate (Rs./bag)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 3000"
                  value={newProductRate}
                  onChange={(e) => { if (e.target.value === "" || /^\d*$/.test(e.target.value)) setNewProductRate(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !addingProduct) handleAddProductInline(); }}
                  className="h-9 font-mono tabular-nums"
                />
              </div>
              <Button
                onClick={handleAddProductInline}
                disabled={addingProduct}
                className="h-9 px-5 gap-2 font-semibold shrink-0"
              >
                {addingProduct ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
                Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddProduct(true)}
              className="gap-1.5 text-slate-700"
            >
              <PackagePlus className="size-4" /> Add Product
            </Button>
          </div>
        )}

        {hasNegative && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800">
            <AlertTriangle className="size-4 text-amber-600" />
            <AlertDescription>
              Some products show negative stock. Please verify and correct the values.
            </AlertDescription>
          </Alert>
        )}
        <div className="rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Bag Weight (kg)</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Bags</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Total KG</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((row) => (
                  <TableRow key={row.productId} className={cn(row.totalKg < 0 && "bg-red-50/60")}>
                    <TableCell className="font-medium text-sm text-slate-800">
                      {row.productName}
                      {row.totalKg < 0 && (
                        <span className="ml-2 inline-flex items-center text-xs text-red-600 font-medium">
                          <AlertTriangle className="size-3 mr-0.5" /> Negative
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.bagWeight} onChange={(e) => updateBagWeight(row.productId, parseFloat(e.target.value) || 0, row.bags)} className="w-20 h-8 text-center text-sm mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.bags} onChange={(e) => updateBags(row.productId, parseFloat(e.target.value) || 0, row.bagWeight)} className="w-20 h-8 text-center text-sm mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.totalKg} onChange={(e) => updateTotalKg(row.productId, parseFloat(e.target.value) || 0, row.bagWeight)} className={cn("w-24 h-8 text-center text-sm mx-auto", row.totalKg < 0 && "border-red-300 bg-red-50 text-red-700 focus-visible:border-red-400")} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {savedAllStock && stockSavedAt && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
              <span>
                <strong>Changes saved successfully</strong>
                <span className="text-green-600 ml-1.5">
                  at {stockSavedAt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </span>
            </div>
          )}
          <Button onClick={handleSaveStock} disabled={savedAllStock} className={cn("gap-2", savedAllStock && "bg-green-600 hover:bg-green-600")}>
            {savedAllStock ? <><Save className="size-4" /> Saved ✓</> : <><Save className="size-4" /> Save Stock Changes</>}
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
          {/* PageHeader skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          {/* Current Stock Levels card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-72" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 w-[180px]" />
                </div>
              </div>
              {/* Stock rows skeleton */}
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Add Purchase card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <PageHeader title="Purchases & Stock" subtitle="Danish Cattle Feed — Daily Register" />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-stock", label: "Current Stock", icon: Package, iconColor: "text-blue-600" },
            { id: "section-purchase", label: "Record a Purchase", icon: ShoppingBag },
            { id: "section-today-purchases", label: "Purchase History", icon: ShoppingBag, iconColor: "text-emerald-600" },
          ]}
        />

        {/* Error banner */}
        {loadErrors.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800 mb-6">
            <AlertTriangle className="size-4 text-amber-600" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-semibold text-sm">Some data failed to load:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 text-amber-700">
                  {loadErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5 text-amber-800 border-amber-400 hover:bg-amber-100"
                  onClick={async () => { setLoading(true); setLoadErrors([]); await loadAllData(); setLoading(false); }}
                >
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card id="section-stock" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Package className="size-5 text-slate-600" /> Current Stock Levels
                </CardTitle>
                <CardDescription>Edit bags or total KG — the other value auto-calculates. Filter by location below.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold text-slate-600">Location:</Label>
                <LocationSelect value={stockLocationId} onChange={(v) => { setStockLocationId(v); setSavedAllStock(false); }} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {renderStockTable(allStock)}
          </CardContent>
        </Card>

        <Card id="section-purchase" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="size-5 text-slate-600" /> Record a Purchase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200/60 bg-slate-50/40">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">Purchase Location:</Label>
              <LocationSelect value={purchaseLocationId} onChange={setPurchaseLocationId} />
              <span className="text-xs text-slate-500">Stock will be added to this location.</span>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Purchase Type</Label>
              <RadioGroup value={purchaseType} onValueChange={(v) => { setPurchaseType(v as "supplier" | "settlement"); resetForm(); }} className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-3 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-emerald-500 has-[[data-state=checked]]:bg-emerald-50/50 transition-colors">
                  <RadioGroupItem value="supplier" id="type-supplier" />
                  <Label htmlFor="type-supplier" className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <Truck className="size-4 text-slate-500" /> From a supplier (I pay cash)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-3 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-violet-500 has-[[data-state=checked]]:bg-violet-50/50 transition-colors">
                  <RadioGroupItem value="settlement" id="type-settlement" />
                  <Label htmlFor="type-settlement" className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <UserCheck className="size-4 text-slate-500" /> From a credit customer (paid in goods, reduces their debt)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Unit</Label>
                <RadioGroup value={purchaseUnit} onValueChange={(v) => setPurchaseUnit(v as "bags" | "kg")} className="flex gap-3">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-2.5 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-slate-500 has-[[data-state=checked]]:bg-slate-100/70 transition-colors">
                    <RadioGroupItem value="bags" id="punit-bags" />
                    <Label htmlFor="punit-bags" className="cursor-pointer text-sm font-medium">Bags</Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-2.5 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-slate-500 has-[[data-state=checked]]:bg-slate-100/70 transition-colors">
                    <RadioGroupItem value="kg" id="punit-kg" />
                    <Label htmlFor="punit-kg" className="cursor-pointer text-sm font-medium flex items-center gap-1.5">
                      <Scale className="size-4" /> KG (loose)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {purchaseType === "supplier" && (
              <div className="space-y-4 p-4 rounded-xl border border-emerald-200/60 bg-emerald-50/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Supplier</Label>
                    <Select value={selectedSupplier} onValueChange={(v) => setSelectedSupplier(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select supplier…" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.filter((s) => s.is_active).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Or New Supplier Name</Label>
                    <Input placeholder="Enter new supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</Label>
                    <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); const p = products.find((pr) => pr.id === Number(v)); if (p && !rate) setRate(String(p.default_rate)); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.is_active).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Quantity <span className="font-normal normal-case text-slate-400">({purchaseUnit === "bags" ? "bags" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" />
                  </div>
                  {purchaseUnit === "bags" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Bag Weight (kg)</Label>
                      <Input type="number" placeholder="50" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} min="0" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Rate <span className="font-normal normal-case text-slate-400">(per {purchaseUnit === "bags" ? "bag" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} min="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cash Paid (Rs.)</Label>
                    <Input type="number" placeholder="0" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} min="0" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-100/60 px-4 py-3 border border-emerald-200/60">
                  <span className="text-sm font-semibold text-emerald-800">Goods Value</span>
                  <span className="text-lg font-extrabold text-emerald-700">Rs. {fmt(goodsValue)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes (optional)</Label>
                  <Textarea placeholder="Any notes about this purchase…" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] resize-none" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleAddSupplierPurchase} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />} Add Purchase
                  </Button>
                </div>
              </div>
            )}

            {purchaseType === "settlement" && (
              <div className="space-y-4 p-4 rounded-xl border border-violet-200/60 bg-violet-50/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Credit Customer</Label>
                    <Select value={selectedCustomer} onValueChange={(v) => setSelectedCustomer(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select credit customer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {creditCustomers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</Label>
                    <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); const p = products.find((pr) => pr.id === Number(v)); if (p && !rate) setRate(String(p.default_rate)); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.is_active).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Quantity <span className="font-normal normal-case text-slate-400">({purchaseUnit === "bags" ? "bags" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Rate <span className="font-normal normal-case text-slate-400">(per {purchaseUnit === "bags" ? "bag" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} min="0" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-violet-100/60 px-4 py-3 border border-violet-200/60">
                  <span className="text-sm font-semibold text-violet-800">This reduces their debt by</span>
                  <span className="text-lg font-extrabold text-violet-700">Rs. {fmt(settlementValue)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes (optional)</Label>
                  <Textarea placeholder="Any notes about this settlement…" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] resize-none" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleRecordSettlement} className="gap-2 bg-violet-600 hover:bg-violet-700" disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />} Record Settlement
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="section-today-purchases" className="rounded-2xl border-slate-200/60 shadow-sm bg-white scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="size-5 text-slate-600" /> Purchase History
                </CardTitle>
                <CardDescription>
                  {historySearchDebounced.trim()
                    ? `${filteredPurchases.length} match${filteredPurchases.length !== 1 ? "es" : ""} for "${historySearchDebounced.trim()}" • Showing ${pagedPurchases.length} of ${filteredPurchases.length}`
                    : `${purchases.length} purchase${purchases.length !== 1 && "s"} recorded • Showing ${pagedPurchases.length} of ${purchases.length}`}
                </CardDescription>
              </div>
              <Button onClick={handleDownloadExcel} variant="outline" className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100" disabled={purchases.length === 0}>
                <Download className="size-4" /> Download Excel
              </Button>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  placeholder="Search by product / supplier / customer / date..."
                  className="pl-8 w-full sm:w-72 h-9"
                />
                {historySearchInput && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                    onClick={() => setHistorySearchInput("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {purchases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No purchases recorded yet.</div>
            ) : filteredPurchases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No record found for &quot;{historySearchDebounced.trim()}&quot;.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200/60 overflow-hidden">
                  <div className="max-h-[460px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold whitespace-nowrap">Date</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold">Source</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Value</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Cash Paid</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center whitespace-nowrap">Bill / Receipt</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center"><span className="sr-only">Delete</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedPurchases.map((p) => {
                          const source = p.settled_by_customer_id
                            ? p.customers?.name ?? "—"
                            : p.suppliers?.name ?? "—";
                          const isSettlement = !!p.settled_by_customer_id;
                          const value = getPurchaseValue(p);
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm text-slate-600 whitespace-nowrap">{p.purchase_date}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-slate-800">{source}</span>
                                  <span className={cn("text-[10px] font-semibold uppercase tracking-wide", isSettlement ? "text-violet-600" : "text-emerald-600")}>
                                    {isSettlement ? "Settlement" : "Supplier"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-700">{p.products?.name ?? "—"}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{getQuantityLabel(p)}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{fmt(p.rate_per_bag)}</TableCell>
                              <TableCell className="text-sm text-slate-900 text-right font-mono font-semibold">{fmt(value)}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{p.cash_paid > 0 ? fmt(p.cash_paid) : "—"}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownloadBill(p)}
                                    disabled={downloadingId !== null}
                                    title="Download Bill"
                                    aria-label="Download Bill"
                                    className="size-8 text-slate-500 hover:text-amber-700 hover:bg-amber-50"
                                  >
                                    {downloadingId === p.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <FileText className="size-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownloadReceipt(p)}
                                    disabled={downloadingId !== null}
                                    title="Download Receipt"
                                    aria-label="Download Receipt"
                                    className="size-8 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                  >
                                    {downloadingId === p.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <ReceiptIcon className="size-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePurchase(p.id)} className="size-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Pagination — Prev / Next + page indicator */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 px-1">
                    <span className="text-xs text-slate-500">
                      Page {safeHistoryPage} of {historyTotalPages} • {filteredPurchases.length} record{filteredPurchases.length !== 1 && "s"}{historySearchDebounced.trim() && " (filtered)"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={safeHistoryPage <= 1}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <ChevronLeft className="size-3.5" /> Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                        disabled={safeHistoryPage >= historyTotalPages}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        Next <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-5 py-3.5 border border-slate-200/60">
                      <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">Total Purchase Value</span>
                      <span className="text-xl font-extrabold text-slate-900">Rs. {fmt(totalPurchaseValue)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 px-5 py-3.5 border border-emerald-200/60">
                      <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Total Cash Paid</span>
                      <span className="text-xl font-extrabold text-emerald-800">Rs. {fmt(totalCashPaid)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
