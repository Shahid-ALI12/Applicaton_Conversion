import { apiFetch } from "@/lib/api";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCartStore, fetchCached, invalidateCache, apiError } from "@/store";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import type { CartItem, Sale, Expense, Product, Customer, ProductStock, Location, CustomerPayment } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Package,
  ChevronDown,
  Receipt,
  TrendingDown,
  Loader2,
  Beaker,
  Truck,
  ChevronLeft,
  ChevronRight,
  Download,
  CalendarDays,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmAction from "@/components/shared/confirm-action";
import { AvailableStock } from "@/components/shared/available-stock";
import { pktToday } from "@/lib/pkt-date";
import { downloadExcel } from "@/lib/download-excel";
import { Checkbox } from "@/components/ui/checkbox";

const fmt = (n: number) => n.toLocaleString("en-PK");

export default function DailyEntryPage() {
  const today = pktToday();

  const { items: cartItems, addItem, removeItem, clearCart, getTotal: getCartTotal } = useCartStore();

  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState<number>(2); // default to Shop
  const [unitChoice, setUnitChoice] = useState<"bags" | "kg">("bags");
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [bagWeight, setBagWeight] = useState<string>("50");
  const [rate, setRate] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState<"credit" | "cash">("credit");
  const [rickshawFare, setRickshawFare] = useState<string>("0");
  const [rickshawDriver, setRickshawDriver] = useState("");
  const [cashReceived, setCashReceived] = useState<string>("0");
  // Opening balance — one-time previous balance the user enters manually
  // for the selected customer (instead of re-entering all historical sales).
  // Auto-fills with the customer's existing opening_balance when a known
  // customer is selected; editable so the user can update it on the fly.
  // Saved back to the customer record when the sale is completed.
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");

  // ── Customer Payment panel state ──
  // Tracks: which customer is paying, how much, optional notes, saving state.
  const [cpCustomerId, setCpCustomerId] = useState<string>("");
  const [cpCustomerSearch, setCpCustomerSearch] = useState("");
  const [cpAmount, setCpAmount] = useState<string>("");
  const [cpNotes, setCpNotes] = useState("");
  const [savingCustomerPayment, setSavingCustomerPayment] = useState(false);

  // ── Today's Customer Payments: server-side pagination + customer-name search ──
  // Declared UP HERE (before loadCustomerPayments + the useEffect that uses them)
  // so we don't hit "used before declaration" TS errors.
  const CP_PAGE_SIZE = 10;
  const [cpSearchInput, setCpSearchInput] = useState("");
  const [cpSearchDebounced, setCpSearchDebounced] = useState("");
  const [cpPage, setCpPage] = useState(1);
  const [cpTotal, setCpTotal] = useState(0);
  const [cpTotalPages, setCpTotalPages] = useState(1);
  const [downloadingCpExcel, setDownloadingCpExcel] = useState(false);

  // ── Use Advance checkbox state (Complete Sale panel) ──
  // When true AND the selected customer has advance_payment > 0,
  // the sale's effective cash_received is bumped by min(advance, grandTotal)
  // and the customer's advance_payment is decremented after the sale.
  const [useAdvance, setUseAdvance] = useState(false);

  // Data from API
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);

  // ── Today's Sales: server-side customer-name search + pagination ──
  const [salesSearchInput, setSalesSearchInput] = useState("");
  const [salesSearchDebounced, setSalesSearchDebounced] = useState("");
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [downloadingSalesExcel, setDownloadingSalesExcel] = useState(false);

  // Debounce search input by 350ms + reset to page 1 on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setSalesSearchDebounced(salesSearchInput);
      setSalesPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [salesSearchInput]);

  // Bumped after every successful sale / mix-order / expense delete so the
  // <AvailableStock> panel knows to refetch stock automatically.
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingSale, setSavingSale] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const askConfirm = (t: string, d: string, a: () => void) => { setConfirmTitle(t); setConfirmDesc(d); setConfirmAction(() => a); setConfirmOpen(true); };

  const loadMasterData = useCallback(async () => {
    const errors: string[] = [];
    try { setProducts(await fetchCached<Product>("products", "/api/products?active=true", "rows")); }
    catch (e: any) { errors.push("Products"); }
    try { setCustomers(await fetchCached<Customer>("customers", "/api/customers?active=true", "rows")); }
    catch (e: any) { errors.push("Customers"); }
    try { setStockData(await fetchCached<ProductStock>("stock", "/api/stock", "rows")); }
    catch (e: any) { errors.push("Stock"); }
    if (errors.length > 0) toast.error(`Failed to load: ${errors.join(", ")}`);
  }, []);

  const loadDayData = useCallback(async (d: string, customerName = "", page = 1) => {
    const bust = `_t=${Date.now()}`;
    try {
      const params = new URLSearchParams({ sale_date: d, _t: bust });
      if (customerName.trim()) params.set("customer_name", customerName.trim());
      params.set("page", String(page));
      params.set("pageSize", "10");
      const sRes = await apiFetch(`/api/sales?${params.toString()}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSales(sData.rows ?? []);
        setSalesTotal(sData.total ?? 0);
        setSalesTotalPages(sData.totalPages ?? 1);
      }
      else toast.error("Failed to load sales");
    } catch { toast.error("Failed to load sales"); }
    try {
      const eRes = await apiFetch(`/api/expenses?expense_date=${d}&${bust}`);
      if (eRes.ok) { const eData = await eRes.json(); setExpenses(eData.rows ?? []); }
      else toast.error("Failed to load expenses");
    } catch { toast.error("Failed to load expenses"); }
  }, []);

  // Separate loader for customer payments (server-side paginated).
  // Kept separate from loadDayData so it can be re-triggered independently
  // when only the payments list needs to refresh (e.g. after adding a payment).
  const loadCustomerPayments = useCallback(async (d: string, customerName = "", page = 1) => {
    try {
      const params = new URLSearchParams({ payment_date: d });
      if (customerName.trim()) params.set("customer_name", customerName.trim());
      params.set("page", String(page));
      params.set("pageSize", String(CP_PAGE_SIZE));
      const res = await apiFetch(`/api/customer-payments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerPayments(data.rows ?? []);
        setCpTotal(data.total ?? 0);
        setCpTotalPages(data.totalPages ?? 1);
      } else {
        // Silent fail — table not deployed yet (migration not run).
        // Show empty list so UI doesn't crash.
        setCustomerPayments([]);
        setCpTotal(0);
        setCpTotalPages(1);
      }
    } catch {
      setCustomerPayments([]);
      setCpTotal(0);
      setCpTotalPages(1);
    }
  }, [CP_PAGE_SIZE]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.allSettled([
        loadMasterData(),
        loadDayData(date),
        loadCustomerPayments(date),
      ]);
      setLoading(false);
    })();
  }, []);

  // Refetch sales when date, search, or page changes
  useEffect(() => {
    loadDayData(date, salesSearchDebounced, salesPage);
  }, [date, salesSearchDebounced, salesPage, loadDayData]);

  // Refetch customer payments when date, search, or page changes
  useEffect(() => {
    loadCustomerPayments(date, cpSearchDebounced, cpPage);
  }, [date, cpSearchDebounced, cpPage, loadCustomerPayments]);

  // ── Download ALL sales for the current date as Excel ──
  // Walks pages server-side so we get every sale record for the date,
  // regardless of the current search filter (search filter is for finding
  // records, not for limiting the export).
  const handleDownloadSalesExcel = async () => {
    setDownloadingSalesExcel(true);
    try {
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          sale_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await apiFetch(`/api/sales?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch sales");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No sales to download for this date");
        return;
      }
      await downloadExcel(all, [
        { key: "sale_date", label: "Date" },
        {
          key: "customers",
          label: "Customer",
          fmt: (v: any) => v?.name ?? "—",
        },
        {
          key: "products",
          label: "Product",
          fmt: (v: any) => v?.name ?? "—",
        },
        { key: "quantity", label: "Qty", align: "right" },
        { key: "unit_type", label: "Unit" },
        { key: "rate_per_bag", label: "Rate", align: "right" },
        { key: "rickshaw_fare", label: "Rickshaw", align: "right" },
        {
          key: "_bill",
          label: "Bill",
          align: "right",
          fmt: (_v: any, row: any) =>
            String(
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) +
                (Number(row.rickshaw_fare) || 0),
            ),
        },
        { key: "cash_received", label: "Cash", align: "right" },
        {
          key: "_remaining",
          label: "Remaining",
          align: "right",
          fmt: (_v: any, row: any) =>
            String(
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) +
                (Number(row.rickshaw_fare) || 0) -
                (Number(row.cash_received) || 0),
            ),
        },
        { key: "rickshaw_driver_name", label: "Rickshaw Driver" },
        { key: "entered_by", label: "Entered By" },
        { key: "mix_order_id", label: "Mix Order ID" },
      ], `sales-${date}`);
      toast.success(`Sales Excel downloaded (${all.length} records)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Excel");
    } finally {
      setDownloadingSalesExcel(false);
    }
  };

  const selectedProduct = products.find((p) => String(p.id) === productId);

  // Find stock for the selected product AT THE SELECTED LOCATION.
  // Falls back to 0 if no stock row exists at that location.
  const stockEntry = stockData.find(
    (s) => s.product_id === Number(productId) && s.location_id === locationId
  );
  const stockBags = stockEntry?.stock_quantity ?? 0;

  const defaultRate = selectedProduct?.default_rate ?? 0;
  const quantityNum = parseFloat(quantity) || 0;
  const bagWeightNum = parseFloat(bagWeight) || 50;
  const rateNum = parseFloat(rate) || 0;
  const lineAmount = quantityNum * rateNum;

  const cartTotal = getCartTotal();
  const rickshawNum = parseFloat(rickshawFare) || 0;
  const grandTotal = cartTotal + rickshawNum;

  const unitType = unitChoice;

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.filter((c) => c.is_active);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.is_active && c.name.toLowerCase().includes(q));
  }, [customerSearch, customers]);

  // ── Track whether the OB input differs from the customer's saved value ──
  // Used to show a "Modified" badge + confirm to the user that the saved
  // opening_balance will be overwritten when the sale is completed.
  const savedOpeningBalance = useMemo(() => {
    if (!selectedCustomerId) return null;
    const c = customers.find((x) => String(x.id) === selectedCustomerId);
    return c ? c.opening_balance ?? 0 : null;
  }, [selectedCustomerId, customers]);

  // ── Selected customer's advance_payment (for the "Use advance" checkbox) ──
  // Used to:
  //   1. Show the customer's current advance balance next to the sale form
  //   2. Decide whether to display the "Use advance" checkbox
  //   3. Compute how much of the advance will actually be applied
  //      (= min(advance_payment, grandTotal))
  const selectedCustomerAdvance = useMemo(() => {
    if (!selectedCustomerId) return 0;
    const c = customers.find((x) => String(x.id) === selectedCustomerId);
    return c ? Number(c.advance_payment ?? 0) : 0;
  }, [selectedCustomerId, customers]);

  // Effective advance to apply when "Use advance" is checked.
  // Capped at the sale's grand total — can't apply more advance than the bill.
  const appliedAdvance = useMemo(() => {
    if (!useAdvance) return 0;
    return Math.min(selectedCustomerAdvance, grandTotal);
  }, [useAdvance, selectedCustomerAdvance, grandTotal]);

  const obModified = useMemo(() => {
    if (savedOpeningBalance === null) return false;
    const current = parseFloat(openingBalance) || 0;
    return Math.abs(current - savedOpeningBalance) > 0.001;
  }, [openingBalance, savedOpeningBalance]);

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerType(c.type as "credit" | "cash");
      // Auto-fill opening balance from the customer's existing record
      // (defaults to 0 if they don't have one set yet).
      setOpeningBalance(String(c.opening_balance ?? 0));
      // Reset "Use advance" — new customer may not have advance balance.
      setUseAdvance(false);
    }
  };

  const handleProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((x) => String(x.id) === id);
    if (p) setRate(String(p.default_rate));
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if (quantityNum <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }
    if (unitChoice === "bags" && bagWeightNum <= 0) {
      toast.error("Please enter a valid bag weight.");
      return;
    }
    const item: CartItem = {
      product: selectedProduct.name,
      product_id: selectedProduct.id,
      location: null,
      location_id: locationId,
      quantity: quantityNum,
      unit_type: unitChoice,
      bag_weight_kg: unitChoice === "bags" ? bagWeightNum : null,
      rate: rateNum,
      amount: lineAmount,
    };
    addItem(item);
    setQuantity("");
    setRate(String(selectedProduct.default_rate));
    toast.success(`Added ${fmt(quantityNum)} ${unitChoice === "bags" ? "bag(s)" : "kg"} of ${selectedProduct.name}`);
  };

  const handleCompleteSale = async () => {
    if (!customerName.trim()) {
      toast.error("Please enter a customer name.");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Cart is empty — add at least one product first.");
      return;
    }

    setSavingSale(true);
    try {
      // Parse opening balance — defaults to 0 if blank/invalid
      const obNum = Math.max(0, parseFloat(openingBalance) || 0);

      // Find or create customer
      let customerId: number;
      const existing = customers.find(
        (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
      );
      // Track whether OB was actually changed so we can toast about it
      // after the sale completes.
      let obWasUpdated = false;
      let obOldValue = 0;
      let obNewValue = 0;
      if (existing) {
        customerId = existing.id;
        obOldValue = existing.opening_balance ?? 0;
        obNewValue = obNum;
        // Persist opening balance update — only send PUT if the value
        // actually changed, to avoid unnecessary writes. We do this BEFORE
        // creating the sale so the balance_due calc on the next reload
        // reflects the latest opening balance.
        if (Math.abs(obNum - obOldValue) > 0.001) {
          try {
            const upRes = await apiFetch(`/api/customers/${customerId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opening_balance: obNum }),
            });
            if (upRes.ok) {
              obWasUpdated = true;
              // Update local state so the customer dropdown reflects the new OB
              setCustomers((prev) =>
                prev.map((c) => (c.id === customerId ? { ...c, opening_balance: obNum } : c))
              );
            }
          } catch {
            // Non-fatal — sale should still go through even if OB update fails
            console.warn("Failed to update opening balance for customer", customerId);
          }
        }
      } else {
        const res = await apiFetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName.trim(),
            type: customerType,
            opening_balance: obNum,
          }),
        });
        if (!res.ok) throw new Error(await apiError(res, "Failed to create customer"));
        const data = await res.json();
        customerId = data?.id;
        if (data) setCustomers((prev) => [...prev, data]);
      }

      const items = cartItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        rate_per_bag: item.rate,
        unit_type: item.unit_type,
        bag_weight_kg: item.bag_weight_kg,
      }));

      // ── If "Use advance" is checked, bump cash_received by the applied ──
      // amount so the sale's balance math reflects the offset. The API route
      // will then decrement customer.advance_payment by the same amount.
      const cashReceivedNum = Number(cashReceived) || 0;
      const effectiveCashReceived = cashReceivedNum + appliedAdvance;

      const res = await apiFetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer_id: customerId,
          location_id: locationId,
          sale_date: date,
          cash_received: effectiveCashReceived,
          rickshaw_fare: rickshawNum,
          rickshaw_driver: rickshawDriver || null,
          // Tell the API to decrement customer.advance_payment by this much
          // AFTER the sale is recorded. 0 when "Use advance" is unchecked.
          apply_advance: appliedAdvance,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to complete sale");
      }
      const saleResp = await res.json().catch(() => ({}));
      const advanceConsumed = Number(saleResp?.advance_consumed ?? appliedAdvance);

      clearCart();
      setRickshawFare("0");
      setRickshawDriver("");
      setCashReceived("0");
      setOpeningBalance("0");
      setCustomerName("");
      setSelectedCustomerId("");
      setUseAdvance(false);

      // ── Compose the success toast ──
      // If the OB was changed for an existing customer, mention the overwrite
      // explicitly so the user knows the saved opening_balance was updated.
      const advanceDesc = advanceConsumed > 0
        ? ` · Advance used: Rs. ${fmt(advanceConsumed)}`
        : "";
      if (obWasUpdated) {
        toast.success(`Sale completed for ${customerName} — Rs. ${fmt(grandTotal)} total bill.`, {
          description: `Opening balance OVERWRITTEN: Rs. ${fmt(obOldValue)} → Rs. ${fmt(obNewValue)} for ${existing?.name ?? customerName}.${advanceDesc}`,
          duration: 6000,
        });
      } else {
        toast.success(`Sale completed for ${customerName} — Rs. ${fmt(grandTotal)} total bill.${advanceDesc}`);
      }
      invalidateCache("stock");
      invalidateCache("customers");
      await Promise.all([loadDayData(date), loadMasterData(), loadCustomerPayments(date)]);
      // Bump the trigger so the <AvailableStock> panel refetches stock
      // and the displayed values reflect the just-completed sale.
      setStockRefreshTrigger((n) => n + 1);
    } catch (e: any) {
      toast.error(e.message || "Failed to complete sale");
    } finally {
      setSavingSale(false);
    }
  };

  const handleDeleteSale = (saleId: number) => {
    askConfirm("Delete Sale", `Sale #${saleId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await apiFetch(`/api/sales/${saleId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setSales((prev) => prev.filter((s) => s.id !== saleId));
        toast.success("Sale #" + saleId + " delete ho gaya");
        // Stock is restored when a sale is deleted — refresh the panel.
        invalidateCache("stock");
        setStockRefreshTrigger((n) => n + 1);
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleDeleteMixOrder = (mixOrderId: string) => {
    // mixOrderId is now String(mix_order_id) from the group key
    const dbMixOrderId = Number(mixOrderId);

    askConfirm("Delete Mix Order", `Mix Order #${mixOrderId} ko database se delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        // Use /api/mix-orders DELETE — cleans BOTH sales + mix_orders tables
        const res = await apiFetch(`/api/mix-orders/${dbMixOrderId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        // Remove only this mix order's sales from local state
        setSales((prev) => prev.filter((s) => String(s.mix_order_id) !== mixOrderId));
        toast.success("Mix Order #" + mixOrderId + " delete ho gaya");
        // Stock is restored when a mix order is deleted — refresh the panel.
        invalidateCache("stock");
        setStockRefreshTrigger((n) => n + 1);
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleAddExpense = async () => {
    if (!expenseDesc.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }
    setSavingExpense(true);
    try {
      const res = await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: expenseDesc.trim(),
          amount: amt,
          expense_date: date,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to add expense");
      }
      setExpenseDesc("");
      setExpenseAmount("");
      toast.success(`Added expense: ${expenseDesc} — Rs. ${fmt(amt)}`);
      await loadDayData(date);
    } catch (e: any) {
      toast.error(e.message || "Failed to add expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expId: number) => {
    askConfirm("Delete Expense", `Expense #${expId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await apiFetch(`/api/expenses/${expId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setExpenses((prev) => prev.filter((e) => e.id !== expId));
        toast.success("Expense #" + expId + " delete ho gaya");
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  // ──────────────────────────────────────────────────────────
  // CUSTOMER PAYMENT handlers
  //
  // A "customer payment" = money a customer hands over WITHOUT buying
  // anything (e.g. a farmhouse customer comes, gives cash, and leaves).
  //
  // Logic (server-side, atomic via record_customer_payment RPC):
  //   1. If the customer has outstanding debt (balance_due > 0), the
  //      payment first reduces the debt (lowers customer.opening_balance).
  //   2. Any excess over the debt becomes customer.advance_payment.
  //      If the customer has NO debt at all, the FULL amount becomes
  //      advance_payment (this is the "cash customer gives money and
  //      leaves without buying" case).
  //   3. A history row is inserted into customer_payments with full
  //      before/after snapshot.
  //
  // The advance_payment can later be auto-consumed when the customer
  // buys something (Complete Sale panel → "Use advance payment" checkbox).
  // ──────────────────────────────────────────────────────────

  const handleSaveCustomerPayment = async () => {
    // Validate customer + amount
    if (!cpCustomerId) {
      toast.error("Pehle customer select karein.");
      return;
    }
    const amt = parseFloat(cpAmount) || 0;
    if (amt <= 0) {
      toast.error("Amount 0 se zyada hona chahiye.");
      return;
    }
    setSavingCustomerPayment(true);
    try {
      const res = await apiFetch("/api/customer-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: Number(cpCustomerId),
          amount: amt,
          payment_date: date,
          notes: cpNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to save payment");
      }
      const data = await res.json().catch(() => ({}));
      const newId = data?.id;

      // Clear the form
      setCpCustomerId("");
      setCpCustomerSearch("");
      setCpAmount("");
      setCpNotes("");

      // Refresh customers list (advance_payment / opening_balance changed)
      // + customer payments history + master data
      invalidateCache("customers");
      await Promise.all([
        loadMasterData(),
        loadCustomerPayments(date, cpSearchDebounced, cpPage),
      ]);

      // Compose a helpful toast — tell the user how the payment was split
      // (we don't get the split back from the API directly, but we can
      // re-derive it client-side from the customer's NEW values vs. what
      // we know was the previous state). For simplicity we just toast the
      // amount + customer name.
      const cust = customers.find((c) => String(c.id) === String(cpCustomerId));
      toast.success(
        `Rs. ${fmt(amt)} payment saved for ${cust?.name ?? "customer"}.`,
        {
          description:
            "Agar customer ka udhaar tha to pehle us se minus hua, bacha hua amount advance payment me chala gaya.",
          duration: 6000,
        },
      );
      void newId;
    } catch (e: any) {
      toast.error(e.message || "Failed to save payment");
    } finally {
      setSavingCustomerPayment(false);
    }
  };

  const handleDeleteCustomerPayment = (paymentId: number) => {
    askConfirm(
      "Delete Payment",
      `Payment #${paymentId} ko delete karna hai? Customer ka opening_balance aur advance_payment dono reverse ho jayenge.`,
      async () => {
        setConfirmLoading(true);
        try {
          const res = await apiFetch(`/api/customer-payments/${paymentId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await apiError(res, "Failed"));
          // Refresh customer payments history + customers list
          invalidateCache("customers");
          await Promise.all([
            loadMasterData(),
            loadCustomerPayments(date, cpSearchDebounced, cpPage),
          ]);
          toast.success("Payment #" + paymentId + " delete ho gaya");
        } catch (e: any) {
          toast.error(e.message || "Database me delete nahi hua");
        } finally {
          setConfirmLoading(false);
          setConfirmOpen(false);
        }
      },
    );
  };

  // Download ALL customer payments for the current date as Excel.
  // Walks pages server-side so we get every payment record for the date,
  // regardless of the current search filter.
  const handleDownloadCpExcel = async () => {
    setDownloadingCpExcel(true);
    try {
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          payment_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await apiFetch(`/api/customer-payments?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch customer payments");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No customer payments to download for this date");
        return;
      }
      await downloadExcel(all, [
        { key: "payment_date", label: "Date" },
        {
          key: "customers",
          label: "Customer",
          fmt: (v: any) => v?.name ?? "—",
        },
        {
          key: "customers",
          label: "Type",
          fmt: (v: any) => v?.type ?? "—",
        },
        { key: "amount", label: "Amount Paid", align: "right" },
        { key: "applied_to_opening", label: "Applied to Debt", align: "right" },
        { key: "applied_to_advance", label: "Added to Advance", align: "right" },
        { key: "opening_balance_before", label: "OB Before", align: "right" },
        { key: "opening_balance_after", label: "OB After", align: "right" },
        { key: "advance_before", label: "Advance Before", align: "right" },
        { key: "advance_after", label: "Advance After", align: "right" },
        { key: "notes", label: "Notes" },
        { key: "entered_by", label: "Entered By" },
      ], `customer-payments-${date}`);
      toast.success(`Customer payments Excel downloaded (${all.length} records)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Excel");
    } finally {
      setDownloadingCpExcel(false);
    }
  };

  const regularSales = sales.filter((s) => !s.mix_order_id);
  const mixSales = sales.filter((s) => !!s.mix_order_id);

  const mixGroups = useMemo(() => {
    // Group by mix_order_id (DB foreign key — unique per mix order)
    // NOT by transaction_group_id which can be shared across different orders
    const map = new Map<string, Sale[]>();
    for (const s of mixSales) {
      const key = s.mix_order_id != null ? String(s.mix_order_id) : `mix-${s.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [mixSales]);

  const totalCashIn = sales.reduce((sum, s) => sum + s.cash_received, 0);
  const totalExpensesAmt = expenses.reduce((sum, e) => sum + e.amount, 0);

  // ── Today's Expenses: client-side pagination + description search ──
  // (Expenses for a single date are bounded — client-side is the simplest
  //  approach with no API changes needed.)
  const [expenseSearchInput, setExpenseSearchInput] = useState("");
  const [expenseSearchDebounced, setExpenseSearchDebounced] = useState("");
  const [expensePage, setExpensePage] = useState(1);
  const [downloadingExpensesExcel, setDownloadingExpensesExcel] = useState(false);
  const EXPENSE_PAGE_SIZE = 10;

  // ── Today's Customer Payments: server-side pagination + customer-name search ──
  // State declarations moved up (see "Customer Payment panel state" block).

  // Debounce customer-payment search + reset page on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setCpSearchDebounced(cpSearchInput);
      setCpPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [cpSearchInput]);

  // Reset page when date changes (customer payments array is reloaded)
  useEffect(() => {
    setCpPage(1);
    setCpSearchInput("");
    setCpSearchDebounced("");
  }, [date]);

  // Debounce expense search + reset page on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setExpenseSearchDebounced(expenseSearchInput);
      setExpensePage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [expenseSearchInput]);

  // Reset page when date changes (expenses array is reloaded)
  useEffect(() => { setExpensePage(1); setExpenseSearchInput(""); setExpenseSearchDebounced(""); }, [date]);

  const filteredExpenses = useMemo(() => {
    if (!expenseSearchDebounced.trim()) return expenses;
    const q = expenseSearchDebounced.trim().toLowerCase();
    return expenses.filter((e) => (e.description || "").toLowerCase().includes(q));
  }, [expenses, expenseSearchDebounced]);

  const expenseTotal = filteredExpenses.length;
  const expenseTotalPages = Math.max(1, Math.ceil(expenseTotal / EXPENSE_PAGE_SIZE));
  const expensePageSafe = Math.min(expensePage, expenseTotalPages);
  const pagedExpenses = useMemo(() => {
    const from = (expensePageSafe - 1) * EXPENSE_PAGE_SIZE;
    return filteredExpenses.slice(from, from + EXPENSE_PAGE_SIZE);
  }, [filteredExpenses, expensePageSafe]);

  // Download ALL expenses for the date as Excel (not just visible / filtered)
  const handleDownloadExpensesExcel = async () => {
    setDownloadingExpensesExcel(true);
    try {
      const { downloadExcel } = await import("@/lib/download-excel");
      // intentionally use the full `expenses` array — user wants every record
      // for the date in the workbook, not the current search filter.
      await downloadExcel(
        expenses as unknown as Record<string, any>[],
        [
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount (Rs.)", align: "right" },
        ],
        `expenses-${date}`,
      );
      toast.success("Expenses Excel downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Excel download failed");
    } finally {
      setDownloadingExpensesExcel(false);
    }
  };

  const [expandedMix, setExpandedMix] = useState<Set<string>>(new Set());
  const toggleMix = (id: string) => {
    setExpandedMix((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* PageHeader skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
          {/* Filter card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-9 w-[200px]" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-[200px]" />
            </div>
          </div>
          {/* Available stock panel skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-100">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </div>
          {/* Add a Sale card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="p-6 space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-96" />
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ConfirmAction open={confirmOpen} onOpenChange={setConfirmOpen} title={confirmTitle} description={confirmDesc} confirmLabel="Haan, Delete Karo" variant="danger" onConfirm={confirmAction ?? (() => {})} loading={confirmLoading} />
        <PageHeader title="Daily Entry" subtitle="Add today's sales and expenses, and see the live cash summary." />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-filter", label: "Date / Location", icon: CalendarDays },
            { id: "section-add-sale", label: "Add a Sale", icon: Plus },
            { id: "section-cart", label: "Current Cart", icon: ShoppingCart },
            { id: "section-search-customer", label: "Search Customer", icon: Search },
            { id: "section-complete-sale", label: "Complete Sale", icon: CheckCircle2 },
            { id: "section-today-sales", label: "Today's Sales", icon: Receipt },
            { id: "section-add-expense", label: "Add Expense", icon: TrendingDown },
            { id: "section-today-expenses", label: "Today's Expenses", icon: TrendingDown, iconColor: "text-orange-500" },
            { id: "section-add-customer-payment", label: "Add Payment", icon: Wallet, iconColor: "text-emerald-600" },
            { id: "section-customer-payment-history", label: "Payment History", icon: Wallet },
          ]}
        />

        <Card id="section-filter" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Location</Label>
              <LocationSelect value={locationId} onChange={setLocationId} />
            </div>
          </CardContent>
        </Card>

        {/* ── Available Stock panel (top) ──
            Shown at the very top so the user can see what stock is on hand
            BEFORE entering any sales. Auto-refreshes when stockRefreshTrigger
            is bumped (after sale complete / sale delete / mix order delete). */}
        <AvailableStock refreshTrigger={stockRefreshTrigger} />

        <Card id="section-add-sale" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="size-5 text-slate-600" />
              Add a Sale
            </CardTitle>
            <CardDescription>
              Add every product the customer is buying into the cart below, then
              click <strong>Complete Sale</strong> once — this saves it all as one bill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Selling in</Label>
              <RadioGroup value={unitChoice} onValueChange={(v) => setUnitChoice(v as "bags" | "kg")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="bags" id="unit-bags" />
                  <Label htmlFor="unit-bags" className="font-normal cursor-pointer">Bags</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="kg" id="unit-kg" />
                  <Label htmlFor="unit-kg" className="font-normal cursor-pointer">KG (loose)</Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Product</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProduct && (() => {
                  // Calculate how many bags this sale will consume
                  const bw = bagWeightNum || (stockEntry?.last_bag_weight_kg ?? 50);
                  const saleBags = unitChoice === "kg"
                    ? (bw > 0 ? quantityNum / bw : quantityNum)
                    : quantityNum;
                  const remainingBags = stockBags - saleBags;
                  const stockKg = stockBags * bw;
                  const remainingKg = remainingBags * bw;
                  const isShort = remainingBags < 0;
                  return (
                    <div className={`rounded-md border px-3 py-2 text-xs space-y-1 ${isShort ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Package className="size-3" /> Current Stock
                        </span>
                        <span className="font-semibold text-slate-700">{fmt(stockBags)} bags <span className="text-slate-400">({fmt(stockKg)} kg)</span></span>
                      </div>
                      {quantityNum > 0 && (
                        <div className="flex items-center justify-between">
                          <span className={isShort ? "text-red-600 font-medium" : "text-slate-500"}>After this sale</span>
                          <span className={`font-semibold ${isShort ? "text-red-600" : "text-emerald-700"}`}>
                            {fmt(remainingBags)} bags <span className="text-slate-400">({fmt(remainingKg)} kg)</span>
                            {isShort && <span className="ml-1 text-red-600 font-bold">⚠ Short</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Quantity (bags)" : "Quantity (kg)"}
                </Label>
                <Input type="number" min="0" step={unitChoice === "bags" ? "1" : "5"} placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {unitChoice === "bags" && (
                  <div className="mt-2">
                    <Label className="text-xs text-slate-400 mb-1 block">Bag Weight (kg)</Label>
                    <Input type="number" min="0" step="5" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Rate per Bag (Rs.)" : "Rate per KG (Rs.)"}
                </Label>
                <Input type="number" min="0" step="10" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-sm text-amber-800">This line: {fmt(quantityNum)} x Rs. {fmt(rateNum)}</span>
              <span className="text-sm font-bold text-amber-900">Rs. {fmt(lineAmount)}</span>
            </div>

            <Button onClick={handleAddToCart} className="w-full" size="lg" disabled={!selectedProduct}>
              <Plus className="size-4" /> Add to Cart
            </Button>
          </CardContent>
        </Card>

        <Card id="section-cart" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="size-5 text-slate-600" />
              Current Cart
              {cartItems.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold size-5">{cartItems.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cartItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Cart is empty — add products above.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Stock After</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item, idx) => {
                        // Compute remaining stock for THIS product AT THE SELECTED LOCATION.
                        const entry = stockData.find(
                          (s) => s.product_id === item.product_id && s.location_id === locationId
                        );
                        const currentBags = entry?.stock_quantity ?? 0;
                        const bw = item.bag_weight_kg ?? (entry?.last_bag_weight_kg ?? 50);
                        const totalCartBags = cartItems
                          .filter((c) => c.product_id === item.product_id)
                          .reduce((sum, c) => {
                            const cbw = c.bag_weight_kg ?? bw;
                            return sum + (c.unit_type === "kg"
                              ? (cbw > 0 ? c.quantity / cbw : c.quantity)
                              : c.quantity);
                          }, 0);
                        const remaining = currentBags - totalCartBags;
                        const isShort = remaining < 0;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-sm">{item.product}</TableCell>
                            <TableCell className="text-sm text-right">{fmt(item.quantity)}{item.unit_type === "kg" ? " kg" : ""}</TableCell>
                            <TableCell className="text-sm text-right">{fmt(item.rate)}</TableCell>
                            <TableCell className="text-sm text-right font-semibold">Rs. {fmt(item.amount)}</TableCell>
                            <TableCell className={`text-sm text-right font-semibold ${isShort ? "text-red-600" : "text-emerald-700"}`}>
                              {fmt(remaining)} bags
                              {isShort && <span className="ml-1 text-red-600">⚠</span>}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => removeItem(idx)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 px-2">
                  <span className="text-xs uppercase text-slate-500 font-semibold">Cart Subtotal</span>
                  <span className="text-lg font-extrabold text-slate-900">Rs. {fmt(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card id="section-search-customer" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="size-5 text-slate-600" /> Search Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Type to search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input placeholder="Start typing a customer name..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Select customer</Label>
                <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Click to fill name" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="section-complete-sale" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" /> Complete Sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Customer Type</Label>
              <RadioGroup value={customerType} onValueChange={(v) => setCustomerType(v as "credit" | "cash")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="credit" id="ctype-credit" />
                  <Label htmlFor="ctype-credit" className="font-normal cursor-pointer">Credit (ادھار کھاتہ)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="ctype-cash" />
                  <Label htmlFor="ctype-cash" className="font-normal cursor-pointer">Cash (نقد)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Customer Name</Label>
                <Input placeholder="Type name — existing customer is matched automatically" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Freight (Rs.)</Label>
                <Input type="number" min="0" step="50" value={rickshawFare} onChange={(e) => setRickshawFare(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Driver Name</Label>
                <Input placeholder="Leave blank if not applicable" value={rickshawDriver} onChange={(e) => setRickshawDriver(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Cash Received Now (Rs.)</Label>
                <Input type="number" min="0" step="100" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
              </div>
            </div>

            {/* Opening Balance — one-time previous balance the user can enter */}
            <div className={`rounded-lg border px-4 py-3 space-y-2 transition-colors ${obModified ? "border-blue-300 bg-blue-50/60" : "border-amber-200 bg-amber-50/60"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <Label className="text-xs uppercase text-amber-700 font-semibold flex items-center gap-1.5 flex-wrap">
                    Opening Balance (Rs.) — purana balance
                    {obModified && savedOpeningBalance !== null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2 py-0.5 text-[10px] font-bold tracking-normal normal-case">
                        Modified · will overwrite Rs. {fmt(savedOpeningBalance)}
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="bg-white"
                  />
                  <p className="text-[11px] text-amber-800/80 leading-tight">
                    Agar customer ka koi purana balance hai jo aap ko pata hai (system se pehle ke sales),
                    wo yahan likh dein. Ye customer ki Khata me <strong>opening balance</strong> ke roop me
                    save ho jayega aur har bill me total ke saath add hoga. Existing customer select karne par
                    purani value auto-fill ho jati hai.{" "}
                    <strong className="text-blue-700">Agar value change ki to sale complete karte hi
                    database me overwrite ho jayega.</strong>
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-amber-700/80 font-semibold">Total Receivable</span>
                  <span className="text-lg font-extrabold text-amber-900 tabular-nums">
                    Rs. {fmt((parseFloat(openingBalance) || 0) + grandTotal)}
                  </span>
                  <span className="text-[10px] text-amber-700/70">
                    (Opening + Grand Total)
                  </span>
                </div>
              </div>
            </div>

            {/* ── Use Advance Payment block ──
                Visible ONLY when the selected customer has an existing
                advance_payment balance (> 0). Lets the user decide whether
                to auto-consume part of that advance against this sale.

                Behaviour:
                  • Checkbox unchecked (default) → sale proceeds normally,
                    advance_payment is left untouched.
                  • Checkbox checked → appliedAdvance = min(advance, grandTotal)
                    is added to effective cash_received, and the API decrements
                    customer.advance_payment by that same amount after the sale.
                  • If advance > grandTotal, only grandTotal is consumed
                    (can't apply more advance than the bill).
                  • The customer's remaining advance after this sale is shown
                    live so the user knows what will be left.
            */}
            {selectedCustomerAdvance > 0 && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 px-4 py-3 space-y-2">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex items-start gap-2 flex-1 min-w-[200px]">
                    <Checkbox
                      id="use-advance"
                      checked={useAdvance}
                      onCheckedChange={(v) => setUseAdvance(v === true)}
                      className="mt-0.5 border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="use-advance" className="text-sm font-semibold text-emerald-800 cursor-pointer flex items-center gap-1.5 flex-wrap">
                        <Wallet className="size-4" /> Use advance payment for this sale
                      </Label>
                      <p className="text-[11px] text-emerald-700/90 leading-tight">
                        Is customer ke paas <strong>Rs. {fmt(selectedCustomerAdvance)}</strong> advance
                        payment hai. Agar ye checkbox tick karen to sale ke total me se utna amount
                        (max Rs. {fmt(Math.min(selectedCustomerAdvance, grandTotal))}) auto minus ho
                        jayega aur customer ka advance_payment balance kam ho jayega.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Live math — show how the sale + advance interact */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-200/70">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">Sale Total</div>
                    <div className="text-sm font-bold text-slate-900 tabular-nums">Rs. {fmt(grandTotal)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">
                      {useAdvance ? "Advance Applied" : "Advance Available"}
                    </div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">
                      Rs. {fmt(useAdvance ? appliedAdvance : selectedCustomerAdvance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">
                      {useAdvance ? "Customer Pays Cash" : "Customer Pays Cash"}
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${useAdvance ? "text-emerald-800" : "text-slate-700"}`}>
                      Rs. {fmt(Math.max(0, grandTotal - appliedAdvance))}
                    </div>
                  </div>
                </div>

                {/* When checked AND there's leftover advance, show what will remain */}
                {useAdvance && (selectedCustomerAdvance - appliedAdvance) > 0 && (
                  <div className="text-[11px] text-emerald-700/80">
                    Sale ke baad customer ke advance balance me <strong>Rs. {fmt(selectedCustomerAdvance - appliedAdvance)}</strong> bacha jayega.
                  </div>
                )}
                {useAdvance && (selectedCustomerAdvance - appliedAdvance) === 0 && (
                  <div className="text-[11px] text-emerald-700/80">
                    Sale ke baad customer ka advance balance <strong>0</strong> ho jayega (poora consume ho gaya).
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3">
              <span className="text-sm font-medium">Grand Total (incl. freight)</span>
              <span className="text-xl font-extrabold">Rs. {fmt(grandTotal)}</span>
            </div>

            <Button onClick={handleCompleteSale} className="w-full" size="lg" disabled={cartItems.length === 0 || savingSale}>
              {savingSale ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              {savingSale ? "Saving..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>

        <Card id="section-today-sales" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="size-5 text-slate-600" /> Today&apos;s Sales
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={salesSearchInput}
                    onChange={(e) => setSalesSearchInput(e.target.value)}
                    placeholder="Search by customer name..."
                    className="pl-8 w-full sm:w-64 h-9"
                  />
                  {salesSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => setSalesSearchInput("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSalesExcel}
                  disabled={downloadingSalesExcel || salesTotal === 0}
                  className="shrink-0"
                >
                  {downloadingSalesExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingSalesExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                {salesSearchDebounced.trim()
                  ? `No record for the customer "${salesSearchDebounced}".`
                  : "No sales entered yet for this date."}
              </p>
            ) : (
              <div className="space-y-6">
                {regularSales.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">Regular Sales</h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Type</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden lg:table-cell">Product</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Rate</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Rickshaw</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">Remaining</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {regularSales.map((s) => {
                            const bill = s.quantity * s.rate_per_bag + s.rickshaw_fare;
                            const remaining = bill - s.cash_received;
                            const unitSuffix = s.unit_type === "kg" ? " kg" : "";
                            return (
                              <TableRow key={s.id}>
                                <TableCell className="text-sm font-medium">{s.customer_name ?? "—"}</TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", customers.find(c => c.id === s.customer_id)?.type === "credit" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{customers.find(c => c.id === s.customer_id)?.type ?? "—"}</span>
                                </TableCell>
                                <TableCell className="text-sm hidden lg:table-cell">{s.product_name ?? "—"}</TableCell>
                                <TableCell className="text-sm text-right">{fmt(s.quantity)}{unitSuffix}</TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">{fmt(s.rate_per_bag)}</TableCell>
                                <TableCell className="text-sm text-right hidden md:table-cell">{s.rickshaw_fare > 0 ? fmt(s.rickshaw_fare) : "—"}{s.rickshaw_driver_name && <span className="block text-xs text-slate-400"><Truck className="inline size-3" /> {s.rickshaw_driver_name}</span>}</TableCell>
                                <TableCell className="text-sm text-right font-semibold">{fmt(bill)}</TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">{s.cash_received > 0 ? fmt(s.cash_received) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right font-semibold hidden lg:table-cell", remaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(remaining)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteSale(s.id)}>
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
                )}

                {mixGroups.size > 0 && (
                  <div>
                    <Separator className="my-2" />
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Beaker className="size-4 text-purple-500" /> Mix Orders
                    </h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Order</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Total Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Total Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Remaining</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(mixGroups.entries()).map(([mixOrderId, lines]) => {
                            const custName = lines[0].customer_name ?? "—";
                            const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
                            const totalMixBill = lines.reduce((sum, l) => sum + l.quantity * l.rate_per_bag, 0);
                            const totalMixCash = lines.reduce((sum, l) => sum + l.cash_received, 0);
                            const mixRemaining = totalMixBill - totalMixCash;
                            const isExpanded = expandedMix.has(mixOrderId);
                            const groupId = mixOrderId;

                            return (
                              <TableRow key={mixOrderId}>
                                <TableCell className="font-medium text-sm">
                                  <Collapsible open={isExpanded} onOpenChange={() => toggleMix(mixOrderId)}>
                                    <CollapsibleTrigger className="flex items-center gap-1 text-left hover:underline">
                                      {custName}
                                      <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="mt-2 ml-2 rounded-lg border border-purple-100 bg-purple-50/50 p-2">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="bg-transparent hover:bg-transparent border-0">
                                              <TableHead className="text-xs text-slate-500 py-1">Ingredient</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Qty (kg)</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Rate/kg</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Amount</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {lines.map((l) => (
                                              <TableRow key={l.id} className="bg-transparent hover:bg-purple-100/50 border-0">
                                                <TableCell className="py-1 text-sm">{l.product_name}</TableCell>
                                                <TableCell className="py-1 text-sm text-right">{fmt(l.quantity)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right">{fmt(l.rate_per_bag)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right font-medium">{fmt(l.quantity * l.rate_per_bag)}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-semibold">
                                    <Beaker className="size-3" /> Mix Order
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-right">{fmt(totalQty)} kg</TableCell>
                                <TableCell className="text-sm text-right font-semibold hidden md:table-cell">{fmt(totalMixBill)}</TableCell>
                                <TableCell className="text-sm text-right hidden md:table-cell">{totalMixCash > 0 ? fmt(totalMixCash) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right font-semibold", mixRemaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(mixRemaining)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteMixOrder(groupId)}>
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
                )}

                {sales.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Items On Page</div>
                      <div className="text-lg font-extrabold text-slate-900">{fmt(sales.length)}</div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Total Records</div>
                      <div className="text-lg font-extrabold text-slate-900">{fmt(salesTotal)}</div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Total Billed (page)</div>
                      <div className="text-lg font-extrabold text-slate-900">Rs. {fmt(sales.reduce((sum, s) => sum + s.quantity * s.rate_per_bag + s.rickshaw_fare, 0))}</div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Cash Collected (page)</div>
                      <div className="text-lg font-extrabold text-green-600">Rs. {fmt(totalCashIn)}</div>
                    </div>
                  </div>
                )}

                {/* Pagination controls for Today's Sales */}
                {salesTotal > 0 && (
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <span className="text-xs text-slate-500">
                      Page {salesPage} of {salesTotalPages}
                      {" · "}
                      {salesTotal} records
                      {salesSearchDebounced.trim() ? ` matching "${salesSearchDebounced}"` : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={salesPage <= 1}
                        onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="size-4" />
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={salesPage >= salesTotalPages}
                        onClick={() => setSalesPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="section-add-expense" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-red-500" /> Add an Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Description</Label>
                <Input placeholder="e.g. Rickshaw, Tea, Labour" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Amount (Rs.)</Label>
                <Input type="number" min="0" step="50" placeholder="0" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAddExpense} className="w-full mt-3" variant="outline" disabled={savingExpense}>
              {savingExpense ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              {savingExpense ? "Adding..." : "Add Expense"}
            </Button>
          </CardContent>
        </Card>

        <Card id="section-today-expenses" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="size-5 text-slate-600" /> Today&apos;s Expenses
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={expenseSearchInput}
                    onChange={(e) => setExpenseSearchInput(e.target.value)}
                    placeholder="Search by description..."
                    className="pl-8 w-full sm:w-56 h-9"
                  />
                  {expenseSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => setExpenseSearchInput("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadExpensesExcel}
                  disabled={downloadingExpensesExcel || expenses.length === 0}
                  className="shrink-0"
                >
                  {downloadingExpensesExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingExpensesExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No expenses recorded for this date.</p>
            ) : filteredExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No record found for &quot;{expenseSearchDebounced.trim()}&quot;.
              </p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Description</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount (Rs.)</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedExpenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">Rs. {fmt(e.amount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteExpense(e.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination controls */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    Page {expensePageSafe} of {expenseTotalPages}
                    {" · "}
                    {expenseTotal} record{expenseTotal === 1 ? "" : "s"}
                    {expenseSearchDebounced.trim() ? ` matching "${expenseSearchDebounced.trim()}"` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={expensePageSafe <= 1}
                      onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={expensePageSafe >= expenseTotalPages}
                      onClick={() => setExpensePage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                  <span className="text-sm font-semibold text-red-700">Total Expenses Today</span>
                  <span className="text-lg font-extrabold text-red-700">Rs. {fmt(totalExpensesAmt)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ──────────────────────────────────────────────────────────
            CUSTOMER PAYMENT PANEL
            A "customer payment" is money a customer hands over WITHOUT
            buying anything. Common at the farmhouse — a customer comes,
            gives cash, and leaves.

            Server-side logic (record_customer_payment RPC):
              1. If customer has debt (balance_due > 0), payment first
                 reduces the debt (lowers customer.opening_balance).
              2. Any excess → customer.advance_payment.
                 If customer has NO debt, the FULL amount becomes advance.
              3. A history row is inserted into customer_payments.

            The advance_payment can later be consumed during a sale
            (Complete Sale panel → "Use advance payment" checkbox).
           ────────────────────────────────────────────────────────── */}
        <Card id="section-add-customer-payment" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="size-5 text-emerald-600" /> Add a Customer Payment
            </CardTitle>
            <CardDescription>
              Jab customer paise de kar jata hai aur kuch buy nahi karta — yahan
              entry karein. Agar customer ka udhaar hai to pehle us se minus hoga,
              bacha hua amount <strong>advance payment</strong> ban jayega jo
              baad me kisi sale me use ho sakta hai.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer search + select — same pattern as the sale form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Search Customer</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Type a customer name..."
                    value={cpCustomerSearch}
                    onChange={(e) => setCpCustomerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Select Customer</Label>
                <Select
                  value={cpCustomerId}
                  onValueChange={(id) => {
                    setCpCustomerId(id);
                    const c = customers.find((x) => String(x.id) === id);
                    if (c) setCpCustomerSearch("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Click to select" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers
                      .filter((c) => c.is_active)
                      .filter((c) => {
                        if (!cpCustomerSearch.trim()) return true;
                        return c.name.toLowerCase().includes(cpCustomerSearch.toLowerCase());
                      })
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} ({c.type})
                          {Number(c.advance_payment ?? 0) > 0 && (
                            <span className="text-emerald-600"> · Adv Rs. {fmt(Number(c.advance_payment))}</span>
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show selected customer's current debt + advance so the user
                knows what to expect before recording the payment */}
            {cpCustomerId && (() => {
              const c = customers.find((x) => String(x.id) === cpCustomerId);
              if (!c) return null;
              const adv = Number(c.advance_payment ?? 0);
              const ob = Number(c.opening_balance ?? 0);
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Customer</div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Opening Balance</div>
                    <div className={`font-semibold tabular-nums ${ob > 0 ? "text-amber-700" : "text-slate-500"}`}>
                      Rs. {fmt(ob)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Advance Payment</div>
                    <div className={`font-semibold tabular-nums ${adv > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                      Rs. {fmt(adv)}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Amount (Rs.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={cpAmount}
                  onChange={(e) => setCpAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Notes (optional)</Label>
                <Input
                  placeholder="e.g. cash received at farmhouse"
                  value={cpNotes}
                  onChange={(e) => setCpNotes(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSaveCustomerPayment}
              className="w-full"
              size="lg"
              disabled={savingCustomerPayment || !cpCustomerId}
            >
              {savingCustomerPayment ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="size-4 mr-2" />
              )}
              {savingCustomerPayment ? "Saving..." : "Save Customer Payment"}
            </Button>
          </CardContent>
        </Card>

        {/* ──────────────────────────────────────────────────────────
            CUSTOMER PAYMENTS HISTORY (today)
            Server-side paginated, customer-name search, Excel download.
            Mirrors the Today's Sales / Today's Expenses pattern.
           ────────────────────────────────────────────────────────── */}
        <Card id="section-customer-payment-history" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="size-5 text-slate-600" /> Today&apos;s Customer Payments
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={cpSearchInput}
                    onChange={(e) => setCpSearchInput(e.target.value)}
                    placeholder="Search by customer name..."
                    className="pl-8 w-full sm:w-64 h-9"
                  />
                  {cpSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => setCpSearchInput("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCpExcel}
                  disabled={downloadingCpExcel || cpTotal === 0}
                  className="shrink-0"
                >
                  {downloadingCpExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingCpExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {customerPayments.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                {cpSearchDebounced.trim()
                  ? `No record for the customer "${cpSearchDebounced}".`
                  : "No customer payments recorded for this date."}
              </p>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Type</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount Paid</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Applied to Debt</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Added to Advance</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">OB After</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">Adv After</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden md:table-cell">Notes</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm font-medium">
                            {p.customer_name ?? `#${p.customer_id}`}
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                              customers.find(c => c.id === p.customer_id)?.type === "credit" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800",
                            )}>
                              {customers.find(c => c.id === p.customer_id)?.type ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-right font-bold tabular-nums text-emerald-700">
                            Rs. {fmt(Number(p.amount))}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden sm:table-cell tabular-nums">
                            {Number(p.applied_to_opening) > 0 ? (
                              <span className="text-amber-700">Rs. {fmt(Number(p.applied_to_opening))}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden sm:table-cell tabular-nums">
                            {Number(p.applied_to_advance) > 0 ? (
                              <span className="text-emerald-700">Rs. {fmt(Number(p.applied_to_advance))}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden lg:table-cell tabular-nums text-slate-600">
                            Rs. {fmt(Number(p.opening_balance_after ?? 0))}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden lg:table-cell tabular-nums text-slate-600">
                            Rs. {fmt(Number(p.advance_after ?? 0))}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 hidden md:table-cell max-w-[200px] truncate">
                            {p.notes ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-400 hover:text-red-600"
                              onClick={() => handleDeleteCustomerPayment(p.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination controls — same shape as Today's Sales */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    Page {cpPage} of {cpTotalPages}
                    {" · "}
                    {cpTotal} record{cpTotal === 1 ? "" : "s"}
                    {cpSearchDebounced.trim() ? ` matching "${cpSearchDebounced}"` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cpPage <= 1}
                      onClick={() => setCpPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cpPage >= cpTotalPages}
                      onClick={() => setCpPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Summary line — total amount + total advance added today */}
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[140px] rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-emerald-700 font-semibold tracking-wider">Total Received Today</div>
                    <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.amount), 0))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[140px] rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-blue-700 font-semibold tracking-wider">Added to Advance</div>
                    <div className="text-lg font-extrabold text-blue-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.applied_to_advance), 0))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[140px] rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-amber-700 font-semibold tracking-wider">Applied to Debt</div>
                    <div className="text-lg font-extrabold text-amber-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.applied_to_opening), 0))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Cash Summary</div>
                <div className="text-sm text-slate-600 mt-1">
                  Cash In: Rs. {fmt(totalCashIn)} | Expenses: Rs. {fmt(totalExpensesAmt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Expected Cash</div>
                <div className={cn("text-2xl font-extrabold", (totalCashIn - totalExpensesAmt) >= 0 ? "text-green-600" : "text-red-600")}>
                  Rs. {fmt(totalCashIn - totalExpensesAmt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
