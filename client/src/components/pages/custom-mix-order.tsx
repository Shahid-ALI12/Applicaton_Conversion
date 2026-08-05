import { apiFetch } from "@/lib/api";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FlaskConical,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Search,
  Download,
  Scale,
  Receipt,
  Loader2,
  Printer,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMixStore, fetchCached, invalidateCache, apiError, extractApiError } from "@/store";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import type { MixIngredient, Product } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";
import { AvailableStock } from "@/components/shared/available-stock";
import { generateMixBillPDF } from "@/lib/generate-mix-bill";
import { numberToRupeeWords } from "@/lib/number-to-words";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { shareBillOnWhatsApp } from "@/lib/share-whatsapp";
import { showWhatsAppShareToast } from "@/components/share-whatsapp-toast";
import { pktToday } from "@/lib/pkt-date";
import { useMixOrdersPaginated, useInvalidateAfterMutation } from "@/hooks/queries";
import { downloadExcel } from "@/lib/download-excel";

const PAST_PAGE_SIZE = 10;

/* ─── Helpers ─── */
function fmtRs(n: number) {
  return n.toLocaleString("en-PK");
}

function printMixBill(order: { id: string | number; customer: string; date: string; driverName?: string; driverRent?: number }, items: { product: string; weight_kg: number; rate_per_kg: number; amount: number; bags?: number | null; rate_per_bag?: number | null; bag_amount?: number | null }[], totalWeight: number, totalAmount: number, totalBagAmount: number = 0) {
  const hasBagInfo = items.some((i) => (i.bags && i.bags > 0) || (i.rate_per_bag && i.rate_per_bag > 0));
  const rows = items.map((it, i) => hasBagInfo
    ? `<tr>
      <td>${i + 1}</td><td>${it.product}</td>
      <td style="text-align:right">${it.weight_kg}</td>
      <td style="text-align:right">${it.rate_per_kg}</td>
      <td style="text-align:right">${it.amount.toLocaleString("en-PK")}</td>
      <td style="text-align:right">${it.bags ?? "—"}</td>
      <td style="text-align:right">${it.rate_per_bag ?? "—"}</td>
      <td style="text-align:right">${it.bag_amount ? it.bag_amount.toLocaleString("en-PK") : "—"}</td>
    </tr>`
    : `<tr>
      <td>${i + 1}</td><td>${it.product}</td>
      <td style="text-align:right">${it.weight_kg}</td>
      <td style="text-align:right">${it.rate_per_kg}</td>
      <td style="text-align:right">${it.amount.toLocaleString("en-PK")}</td>
    </tr>`).join("");

  const driverLine = order.driverName
    ? `<div class="info-row"><span>Driver:</span><strong>${order.driverName}</strong></div>${order.driverRent && order.driverRent > 0 ? `<div class="info-row"><span>Driver Rent:</span><strong>Rs. ${order.driverRent.toLocaleString("en-PK")}</strong></div>` : ""}`
    : "";

  const bagHead = hasBagInfo ? `<th style="text-align:right">Bags</th><th style="text-align:right">Rate/Bag</th><th style="text-align:right">Bag Amt</th>` : "";
  const bagFoot = hasBagInfo ? `<td style="text-align:right">${totalBagAmount > 0 ? totalBagAmount.toLocaleString("en-PK") : ""}</td><td></td><td></td>` : "";

  const grandTotal = totalAmount + (order.driverRent && order.driverRent > 0 ? order.driverRent : 0);

  // As Rate/Bag — Subtotal (excluding driver rent) divided by total bags.
  // Total bags per ingredient: use explicit `bags` if entered, else
  // auto-derive from kg (40 kg = 1 bag).
  const BAG_KG = 40;
  const totalBagsCount = items.reduce(
    (sum, i) => sum + (i.bags && i.bags > 0 ? i.bags : i.weight_kg / BAG_KG),
    0,
  );
  const hasAsRatePerBag = totalBagsCount > 0;
  const asRatePerBag = hasAsRatePerBag ? totalAmount / totalBagsCount : 0;
  const asRatePerBagLine = hasAsRatePerBag
    ? `<div class="trow"><span>As Rate/Bag (${totalBagsCount.toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags):</span><strong>Rs. ${asRatePerBag.toLocaleString("en-PK", { maximumFractionDigits: 2 })}</strong></div>`
    : "";

  const html = `<!DOCTYPE html><html><head><style>
    @page{size:auto;margin:5mm}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;max-width:280px;margin:0 auto;padding:8px;color:#000;font-size:10px}
    .top-line{height:3px;background:#f5c438;margin-bottom:4px}
    .farm-banner{text-align:center;padding:6px 4px;border-bottom:2px solid #085039;margin-bottom:6px}
    .farm-banner h1{font-size:19px;font-weight:bold;letter-spacing:1.5px;color:#085039}
    .farm-banner .tag{font-size:9px;font-style:italic;color:#666;margin-top:1px}
    .farm-banner .addr{font-size:7.5px;color:#888;margin-top:1px}
    .inv-label{text-align:center;background:#085039;color:#f5c438;font-size:9px;font-weight:bold;letter-spacing:1px;padding:2px;margin-bottom:6px}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px}
    .meta-box{border:1px solid #085039;border-radius:2px;padding:4px;background:#fcfcfc}
    .meta-box .title{font-size:7px;color:#085039;font-weight:bold;letter-spacing:0.5px;border-bottom:1px solid #ccc;padding-bottom:2px;margin-bottom:2px}
    .meta-box .row{display:flex;justify-content:space-between;font-size:8.5px;margin-bottom:1px}
    .meta-box .row span:first-child{color:#666}
    .meta-box .row strong{font-weight:bold;color:#000}
    table{width:100%;border-collapse:collapse;margin:4px 0}
    th,td{padding:3px 4px;font-size:9px}
    th{background:#085039;color:#fff;text-align:left;border-bottom:1px solid #f5c438;font-weight:bold;font-size:8.5px}
    td{border-bottom:1px dotted #ddd}
    .total-row{font-weight:bold;border-top:2px solid #085039;border-bottom:none !important;background:#fcf7e8;color:#085039}
    .totals-box{margin-top:6px;border:1.5px solid #085039;border-radius:2px;background:#fcfcfc}
    .totals-box .trow{display:flex;justify-content:space-between;padding:3px 6px;font-size:9px;border-bottom:1px dotted #ddd}
    .totals-box .trow.grand{background:#085039;color:#fff;font-size:11px;font-weight:bold;border-bottom:none;padding:5px 6px}
    .totals-box .trow span:first-child{color:#666}
    .totals-box .trow.grand span:first-child{color:#fff}
    .words{font-size:7.5px;font-style:italic;color:#666;padding:2px 6px;text-align:left}
    .tc-box{margin-top:8px;border:1px solid #085039;border-radius:2px;background:#fcf7e8;padding:4px;position:relative}
    .tc-box::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:#085039;border-radius:2px 0 0 2px}
    .tc-title{font-size:7.5px;font-weight:bold;color:#085039;letter-spacing:0.5px;margin-bottom:2px;padding-left:4px}
    .tc-list{font-size:6.5px;color:#666;line-height:1.4;padding-left:4px}
    .sig{margin-top:12px;display:flex;justify-content:space-between;align-items:flex-end}
    .sig-line{border-top:1px solid #444;width:55%;text-align:center;padding-top:2px;font-size:8px;color:#444}
    .stamp{width:40px;height:40px;border:1.5px solid #085039;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:6px;font-weight:bold;color:#085039;text-align:center;line-height:1.2;position:relative}
    .stamp::after{content:'';position:absolute;inset:3px;border:0.5px solid #f5c438;border-radius:50%}
    .footer{margin-top:10px;border-top:2px solid #085039;padding-top:5px;text-align:center}
    .footer .dev{font-size:10px;font-weight:bold;color:#085039;letter-spacing:0.5px}
    .footer .contact{font-size:9px;color:#444;margin-top:1px}
    .footer .meta{font-size:6.5px;color:#aaa;margin-top:3px}
    .bottom-line{height:2px;background:#f5c438;margin-top:4px}
  </style></head><body>
    <div class="top-line"></div>
    <div class="farm-banner">
      <h1>DANISH CATTLE FEED</h1>
      <div class="tag">Cattle Feed Supplier</div>
      <div class="addr">Farm: Dry port phatak Faisalabad &nbsp;|&nbsp; Shop: Madni kholoni shamsabad jhumra road &nbsp;|&nbsp; 0300-3966715</div>
    </div>
    <div class="inv-label">MIX ORDER INVOICE</div>
    <div class="meta-grid">
      <div class="meta-box">
        <div class="title">BILL TO</div>
        <div class="row"><span>Customer:</span><strong>${order.customer?.slice(0, 16) || "N/A"}</strong></div>
        <div class="row"><span>Driver:</span><strong>${order.driverName?.slice(0, 16) || "—"}</strong></div>
      </div>
      <div class="meta-box">
        <div class="title">INVOICE</div>
        <div class="row"><span>Bill #</span><strong>${order.id}</strong></div>
        <div class="row"><span>Date</span><strong>${order.date}</strong></div>
      </div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th style="text-align:right">Wt(kg)</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th>${bagHead}</tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td colspan="2">TOTAL</td><td style="text-align:right">${fmtRs(totalWeight)} kg</td><td></td><td style="text-align:right">Rs. ${fmtRs(totalAmount)}</td>${bagFoot}</tr>
      </tbody>
    </table>
    <div class="totals-box">
      <div class="trow"><span>Subtotal:</span><strong>Rs. ${fmtRs(totalAmount)}</strong></div>
      ${asRatePerBagLine}
      ${order.driverRent && order.driverRent > 0 ? `<div class="trow"><span>Driver Rent:</span><strong>Rs. ${fmtRs(order.driverRent)}</strong></div>` : ""}
      <div class="trow grand"><span>GRAND TOTAL:</span><span>Rs. ${fmtRs(grandTotal)}</span></div>
      <div class="words">In words: ${numberToRupeeWords(grandTotal)}</div>
    </div>
    <div class="tc-box">
      <div class="tc-title">TERMS &amp; CONDITIONS</div>
      <div class="tc-list">
        1. Goods once sold will not be returned or exchanged.<br/>
        2. All disputes subject to Faisalabad jurisdiction.<br/>
        3. Please verify bill details at the time of delivery.
      </div>
    </div>
    <div class="sig">
      <div class="stamp"><span>DANISH</span><span>CATTLE FEED</span><span>★ FSD ★</span></div>
      <div class="sig-line">For Danish Cattle Feed<br/>Authorised Signatory</div>
    </div>
    <div class="footer">
      <div class="dev">Software By: Shahid ALI</div>
      <div class="contact">Contact: 03271487858</div>
      <div class="meta">Computer-generated invoice &nbsp;•&nbsp; ${new Date().toLocaleString("en-PK")}</div>
    </div>
    <div class="bottom-line"></div>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

const today = pktToday();

/* ─── Component ─── */
export default function CustomMixOrder() {
  const store = useMixStore();
  const isBuilding = store.targetWeight !== null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Bumped after every successful mix order save so the <AvailableStock>
  // panel knows to refetch stock automatically (mix orders decrement stock
  // just like regular sales).
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);

  /* ── State 1 form ── */
  const [s1Name, setS1Name] = useState("");
  const [s1Type, setS1Type] = useState<"credit" | "cash">("credit");
  const [s1Date, setS1Date] = useState(today);
  const [s1Target, setS1Target] = useState("");
  const [s1LocationId, setS1LocationId] = useState<number>(2); // default Shop
  // Driver fields (optional) — order level
  const [s1DriverName, setS1DriverName] = useState("");
  const [s1DriverRent, setS1DriverRent] = useState("");

  /* ── State 2 form ── */
  const [addProduct, setAddProduct] = useState<string>("");
  const [addWeight, setAddWeight] = useState("");
  const [addRate, setAddRate] = useState("");
  // Optional bag fields — if user enters Bags + Rate/Bag, we show a separate Bag Amount
  const [addBags, setAddBags] = useState("");
  const [addRatePerBag, setAddRatePerBag] = useState("");
  const [cashReceived, setCashReceived] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const failed: string[] = [];
      try { setProducts(await fetchCached<Product>("products", "/api/products?active=true", "rows")); }
      catch { failed.push("products"); }
      if (failed.length > 0) toast.error(`Failed to load: ${failed.join(", ")}`);
      setLoading(false);
    })();
  }, []);

  /* ── Past orders (paginated + server-side search) ── */
  const [pastSearchInput, setPastSearchInput] = useState("");
  const [pastSearchDebounced, setPastSearchDebounced] = useState("");
  const [pastPage, setPastPage] = useState(1);
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);

  // Debounce past-order search (350ms) + reset to page 1 on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setPastSearchDebounced(pastSearchInput);
      setPastPage(1);
      setSelectedPastId(null);
    }, 350);
    return () => clearTimeout(t);
  }, [pastSearchInput]);

  const pastQ = useMixOrdersPaginated(
    { search: pastSearchDebounced },
    pastPage,
    PAST_PAGE_SIZE,
  );
  const invalidate = useInvalidateAfterMutation();

  // Flatten paginated orders + attach sales lines from salesByMix
  const pastOrders: any[] = useMemo(() => {
    const orders = pastQ.data?.rows ?? [];
    const salesByMix: Record<number, any[]> = {};
    return orders.map((o: any) => ({
      ...o,
      customer: o.customer_name ?? "",
      date: o.order_date ?? "",
      driverName: o.driver_name ?? "",
      driverRent: o.driver_rent ?? 0,
      sales: salesByMix[o.id] ?? [],
    }));
  }, [pastQ.data]);

  const selectedPast = pastOrders.find((o) => o.id === selectedPastId) ?? null;

  // Refresh past orders after a new mix-order is saved
  const reloadPastOrders = useCallback(() => {
    invalidate.invalidateMixOrders();
  }, [invalidate]);

  // ── Download ALL past mix-orders as Excel ──
  // Walks paginated /api/mix-orders (no search filter = every record)
  // and produces a single .xlsx workbook with one row per mix order line.
  const [downloadingPastExcel, setDownloadingPastExcel] = useState(false);
  const handleDownloadPastExcel = async () => {
    setDownloadingPastExcel(true);
    try {
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          page: String(page),
          pageSize: "200",
        });
        const res = await apiFetch(`/api/mix-orders?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch mix orders");
        const body = await res.json();
        const orders: any[] = Array.isArray(body?.rows) ? body.rows : [];
        const salesByMix: Record<string, any[]> = {};
        // Flatten: one row per sale line inside each mix order
        for (const o of orders) {
          const lines = salesByMix[o.id] ?? [];
          if (lines.length === 0) {
            // Mix order with no sale lines (rare) — emit a single row
            all.push({
              order_id: o.id,
              order_date: o.order_date,
              customer: o.customer_name ?? "—",
              target_weight_kg: o.target_weight_kg ?? "",
              cash_received: o.cash_received ?? 0,
              driver_name: o.driver_name ?? "",
              driver_rent: o.driver_rent ?? 0,
              product: "—",
              quantity: "",
              rate_per_kg: "",
              line_amount: "",
            });
          } else {
            for (const line of lines) {
              all.push({
                order_id: o.id,
                order_date: o.order_date,
                customer: o.customer_name ?? "—",
                target_weight_kg: o.target_weight_kg ?? "",
                cash_received: o.cash_received ?? 0,
                driver_name: o.driver_name ?? "",
                driver_rent: o.driver_rent ?? 0,
                product: line.product_name ?? "—",
                quantity: line.quantity,
                rate_per_kg: line.rate_per_bag,
                line_amount: (Number(line.quantity) || 0) * (Number(line.rate_per_bag) || 0),
              });
            }
          }
        }
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (orders.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No mix orders to download");
        return;
      }
      await downloadExcel(all, [
        { key: "order_id", label: "Order ID" },
        { key: "order_date", label: "Date" },
        { key: "customer", label: "Customer" },
        { key: "target_weight_kg", label: "Target Weight (kg)", align: "right" },
        { key: "product", label: "Ingredient" },
        { key: "quantity", label: "Qty (kg)", align: "right" },
        { key: "rate_per_kg", label: "Rate/kg", align: "right" },
        { key: "line_amount", label: "Line Amount (Rs.)", align: "right" },
        { key: "cash_received", label: "Cash Received (Rs.)", align: "right" },
        { key: "driver_name", label: "Driver Name" },
        { key: "driver_rent", label: "Driver Rent (Rs.)", align: "right" },
      ], "all-mix-orders");
      toast.success(`Mix orders Excel downloaded (${all.length} line items)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Excel");
    } finally {
      setDownloadingPastExcel(false);
    }
  };

  const usedWeight = store.getUsedWeight();
  const totalAmount = store.getTotalAmount();
  const totalBagAmount = store.getTotalBagAmount();
  const remaining = (store.targetWeight ?? 0) - usedWeight;

  /* ── Handlers ── */
  const handleStartOrder = useCallback(() => {
    const target = Number(s1Target);
    if (!s1Name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!target || target <= 0) {
      toast.error("Enter a valid target weight");
      return;
    }
    const driverName = s1DriverName.trim();
    const driverRentNum = Number(s1DriverRent) || 0;
    store.startOrder(s1Name.trim(), s1Type, s1Date, target, {
      driverName,
      driverRent: driverRentNum,
      locationId: s1LocationId,
    });
    toast.success("Mix order started — add ingredients below");
  }, [s1Name, s1Type, s1Date, s1Target, s1DriverName, s1DriverRent, s1LocationId, store]);

  const handleAddIngredient = useCallback(() => {
    if (!addProduct) {
      toast.error("Select a product");
      return;
    }
    const weight = Number(addWeight);
    const rate = Number(addRate);
    if (!weight || weight <= 0) {
      toast.error("Enter a valid weight");
      return;
    }
    if (!rate || rate <= 0) {
      toast.error("Enter a valid rate per kg");
      return;
    }
    const product = products.find((p) => p.id === Number(addProduct));
    if (!product) return;

    // Bag fields:
    //   - bags: if user enters Bags manually, use that. Else auto-derive
    //     from kg (40 kg = 1 bag). This derived value is stored on the
    //     ingredient so the bill's "As Rate/Bag" calculation can use it.
    //   - rate_per_bag + bag_amount: only computed when BOTH bags > 0 AND
    //     rate_per_bag > 0. These drive the optional "Bag Amt" column.
    const BAG_KG = 40;
    const bagsNum = addBags ? Number(addBags) : 0;
    const ratePerBagNum = addRatePerBag ? Number(addRatePerBag) : 0;
    const derivedBags = weight > 0 ? weight / BAG_KG : 0;
    const finalBags = bagsNum > 0 ? bagsNum : derivedBags;
    const hasRatePerBag = ratePerBagNum > 0;
    const bagAmount = (finalBags > 0 && hasRatePerBag) ? finalBags * ratePerBagNum : null;

    const ing: MixIngredient = {
      product: product.name,
      product_id: product.id,
      weight_kg: weight,
      rate_per_kg: rate,
      amount: weight * rate,
      bags: finalBags > 0 ? finalBags : null,
      rate_per_bag: hasRatePerBag ? ratePerBagNum : null,
      bag_amount: bagAmount,
    };
    store.addIngredient(ing);
    setAddProduct("");
    setAddWeight("");
    setAddRate("");
    setAddBags("");
    setAddRatePerBag("");
    toast.success(`${product.name} added to mix`);
  }, [addProduct, addWeight, addRate, addBags, addRatePerBag, store, products]);

  const handleFinishOrder = useCallback(async () => {
    if (store.ingredients.length === 0) {
      toast.error("Add at least one ingredient before finishing");
      return;
    }
    if (store.customerType === "cash") {
      const cash = Number(cashReceived);
      if (!cash || cash < 0) {
        toast.error("Enter cash received amount");
        return;
      }
    }

    setSaving(true);
    try {
      // Find or create customer to get customer_id (same pattern as daily-entry)
      let customerId: number;
      const existingCustomer = await fetchCached<any>("customers", "/api/customers", "rows");
      const match = existingCustomer.find(
        (c: any) => c.name.toLowerCase() === store.customerName.trim().toLowerCase()
      );
      if (match) {
        customerId = match.id;
      } else {
        const custRes = await apiFetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: store.customerName.trim(), type: store.customerType }),
        });
        if (!custRes.ok) throw new Error(await apiError(custRes, "Failed to create customer"));
        const custData = await custRes.json();
        // Applicaton_Conversion backend returns the row directly: { id, name, ... }
        // (Testing_Project wraps it as { customer: {...} } — accept both for safety)
        customerId = custData?.id ?? custData?.customer?.id;
        if (!customerId) throw new Error("Customer creation returned no ID");
        invalidateCache("customers");
      }

      const res = await apiFetch("/api/mix-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          location_id: store.locationId,
          order_date: store.orderDate,
          target_weight_kg: store.targetWeight,
          items: store.ingredients.map((ing) => ({
            product_id: ing.product_id,
            quantity: ing.weight_kg,
            rate_per_kg: ing.rate_per_kg,
          })),
          cash_received: store.customerType === "cash" ? Number(cashReceived) || 0 : 0,
          driver_name: store.driverName || null,
          driver_rent: store.driverRent || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiError(err, "Failed to save mix order"));
      }
      // Generate PDF bill BEFORE resetting store
      const billData = {
        orderId: `mix-${Date.now()}`,
        customerName: store.customerName,
        customerType: store.customerType as "credit" | "cash",
        orderDate: store.orderDate,
        items: store.ingredients.map(i => ({
          product: i.product,
          weight_kg: i.weight_kg,
          rate_per_kg: i.rate_per_kg,
          amount: i.amount,
          bags: i.bags ?? null,
          rate_per_bag: i.rate_per_bag ?? null,
          bag_amount: i.bag_amount ?? null,
        })),
        totalWeight: store.targetWeight!,
        totalAmount: totalAmount,
        totalBagAmount: store.getTotalBagAmount(),
        cashReceived: store.customerType === "cash" ? Number(cashReceived) || 0 : undefined,
        driverName: store.driverName || null,
        driverRent: store.driverRent || 0,
      };
      store.reset();
      generateMixBillPDF(billData)
        .then((billResult) => {
          toast.success("Order finished! Bill PDF download ho rahi hai.", {
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
        })
        .catch(() => toast.error("PDF bill generate nahi ho saki"));
      setCashReceived("");
      setAddProduct("");
      setAddWeight("");
      setAddRate("");
      setAddBags("");
      setAddRatePerBag("");
      setS1Name("");
      setS1Type("credit");
      setS1Date(today);
      setS1Target("");
      setS1DriverName("");
      setS1DriverRent("");
      invalidateCache("stock");
      // Bump the trigger so the <AvailableStock> panel refetches stock
      // and the displayed values reflect the just-saved mix order.
      setStockRefreshTrigger((n) => n + 1);
      await reloadPastOrders();
    } catch (e: any) {
      toast.error(e.message || "Failed to save mix order");
    } finally {
      setSaving(false);
    }
  }, [store, cashReceived, reloadPastOrders, totalAmount]);

  const handleCancel = useCallback(() => {
    store.reset();
    setCashReceived("");
    setAddProduct("");
    setAddWeight("");
    setAddRate("");
    setAddBags("");
    setAddRatePerBag("");
    toast.info("Order cancelled");
  }, [store]);

  /* ─────────────────────────────── STATE 1 ─────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isBuilding) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          <PageHeader
            title="Custom Mix Order"
            subtitle="Build a custom cattle feed mix bill with multiple ingredients"
          />

          {/* Live stock panel — shown at the top so the user can see what's
              available before starting a mix order. Auto-refreshes when a
              mix order is saved (stockRefreshTrigger bumps). */}
          <AvailableStock refreshTrigger={stockRefreshTrigger} />

          <QuickNav
            title="Jump to"
            items={[
              { id: "section-new-order", label: "New Mix Order", icon: FlaskConical, iconColor: "text-emerald-600" },
              ...(store.targetWeight ? [
                { id: "section-metrics", label: "Mix Metrics", icon: Scale },
                { id: "section-ingredient", label: "Add Ingredient", icon: Plus },
                { id: "section-current-mix", label: "Current Mix", icon: Receipt },
              ] : []),
              { id: "section-past", label: "Past Mix Orders", icon: Receipt, iconColor: "text-slate-600" },
            ]}
          />

          {/* Start New Order Form */}
          <div id="section-new-order" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6 scroll-mt-24">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-slate-500" />
              <h2 className="text-base font-bold text-slate-800">
                Start a New Mix Order
              </h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-name" className="text-slate-600">
                Customer Name
              </Label>
              <Input
                id="customer-name"
                placeholder="e.g. Chaudhry Feed Farm"
                value={s1Name}
                onChange={(e) => setS1Name(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-slate-600">Customer Type</Label>
              <RadioGroup
                value={s1Type}
                onValueChange={(v) => setS1Type(v as "credit" | "cash")}
                className="flex flex-row gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="credit" id="type-credit" />
                  <Label htmlFor="type-credit" className="font-normal cursor-pointer">
                    Credit (Udhaar)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="type-cash" />
                  <Label htmlFor="type-cash" className="font-normal cursor-pointer">
                    Cash (Nagad)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order-date" className="text-slate-600">
                  Order Date
                </Label>
                <Input
                  id="order-date"
                  type="date"
                  value={s1Date}
                  onChange={(e) => setS1Date(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-weight" className="text-slate-600">
                  Target Total Weight (kg)
                </Label>
                <Input
                  id="target-weight"
                  type="number"
                  min={1}
                  placeholder="e.g. 1000"
                  value={s1Target}
                  onChange={(e) => setS1Target(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </div>

            {/* ── Optional Driver fields (order-level) ── */}
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-slate-700 font-semibold text-sm">
                  Driver Details <span className="text-slate-400 font-normal">(optional)</span>
                </Label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="driver-name" className="text-xs font-semibold uppercase text-slate-500">
                    Driver Name
                  </Label>
                  <Input
                    id="driver-name"
                    placeholder="e.g. Rana"
                    value={s1DriverName}
                    onChange={(e) => setS1DriverName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-rent" className="text-xs font-semibold uppercase text-slate-500">
                    Driver Rent (Rs.)
                  </Label>
                  <Input
                    id="driver-rent"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="0"
                    value={s1DriverRent}
                    onChange={(e) => setS1DriverRent(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Location selector ── */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200/60 bg-slate-50/40">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">Sale Location:</Label>
              <LocationSelect value={s1LocationId} onChange={setS1LocationId} />
              <span className="text-xs text-slate-500">Stock will be deducted from this location.</span>
            </div>

            <Separator />

            <Button
              onClick={handleStartOrder}
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              <FlaskConical className="w-4 h-4 mr-1" />
              Start Order
            </Button>
          </div>

          {/* ── Past Mix Orders ── */}
          <div id="section-past" className="scroll-mt-24">
          <PastMixOrdersSection
            pastSearchInput={pastSearchInput}
            setPastSearchInput={setPastSearchInput}
            pastOrders={pastOrders}
            selectedPastId={selectedPastId}
            setSelectedPastId={setSelectedPastId}
            selectedPast={selectedPast}
            page={pastQ.data?.page ?? 1}
            totalPages={pastQ.data?.totalPages ?? 1}
            total={pastQ.data?.total ?? 0}
            isFetching={pastQ.isFetching}
            isLoading={pastQ.isLoading && !pastQ.data}
            onPrev={() => setPastPage((p) => Math.max(1, p - 1))}
            onNext={() => setPastPage((p) => p + 1)}
            onDownloadExcel={handleDownloadPastExcel}
            downloadingExcel={downloadingPastExcel}
            isSearchActive={pastSearchDebounced.trim().length > 0}
            searchQuery={pastSearchDebounced}
          />
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────── STATE 2 ─────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <PageHeader
          title="Custom Mix Order"
          subtitle={`Building mix for ${store.customerName} — ${store.orderDate}`}
        />

        {/* Live stock panel — visible while building the mix order so the
            user can see stock depleting in real time as they add ingredients.
            Use hideSummary to avoid duplicating the metric cards already shown
            in the Metrics Row below. */}
        <AvailableStock refreshTrigger={stockRefreshTrigger} hideSummary />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-metrics", label: "Mix Metrics", icon: Scale },
            { id: "section-ingredient", label: "Add Ingredient", icon: Plus },
            { id: "section-current-mix", label: "Current Mix", icon: Receipt },
          ]}
        />

        {/* ── Metrics Row ── */}
        <div id="section-metrics" className="grid grid-cols-1 sm:grid-cols-3 gap-4 scroll-mt-24">
          <MetricCard label="Target Weight" value={`${fmtRs(store.targetWeight!)} kg`} color="blue" />
          <MetricCard label="Weight Used So Far" value={`${fmtRs(usedWeight)} kg`} color="purple" />
          <MetricCard label="Remaining to Fill" value={`${fmtRs(Math.max(0, remaining))} kg`} color={remaining <= 0 ? "green" : "orange"} />
        </div>

        {/* ── Add Ingredient Form ── */}
        <div id="section-ingredient" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4 scroll-mt-24">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Plus className="w-4 h-4 text-slate-400" />
            Add an Ingredient
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">Product</Label>
              <Select value={addProduct} onValueChange={setAddProduct}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">Weight (kg)</Label>
              <Input type="number" min={0} step="any" placeholder="0" value={addWeight} onChange={(e) => setAddWeight(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">Rate / kg</Label>
              <Input type="number" min={0} step="any" placeholder="0" value={addRate} onChange={(e) => setAddRate(e.target.value)} />
            </div>
          </div>

          {/* ── Optional bag fields (collapsible-style row) ── */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Bag details <span className="font-normal normal-case text-slate-400">(Bags auto-derived from kg at 40 kg/bag — override by typing here. Fill Rate/Bag to compute Bag Amount.)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-slate-500">Bags</Label>
                <Input type="number" min={0} step="any" placeholder="0" value={addBags} onChange={(e) => setAddBags(e.target.value)} />
                {(!addBags || Number(addBags) <= 0) && Number(addWeight) > 0 && (
                  <div className="text-[10px] text-slate-500 font-medium">
                    Auto from kg: <span className="text-slate-700 font-semibold">{(Number(addWeight) / 40).toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-slate-500">Rate / Bag</Label>
                <Input type="number" min={0} step="any" placeholder="0" value={addRatePerBag} onChange={(e) => setAddRatePerBag(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-slate-500">Effective Bags (auto)</Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-white text-sm font-semibold tabular-nums text-slate-700">
                  {(() => {
                    const manualBags = Number(addBags);
                    const effective = manualBags > 0 ? manualBags : (Number(addWeight) > 0 ? Number(addWeight) / 40 : 0);
                    return effective > 0 ? `${effective.toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags` : "—";
                  })()}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-slate-500">Bag Amount (auto)</Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-white text-sm font-semibold tabular-nums text-slate-700">
                  {(() => {
                    const manualBags = Number(addBags);
                    const effective = manualBags > 0 ? manualBags : (Number(addWeight) > 0 ? Number(addWeight) / 40 : 0);
                    const ratePerBag = Number(addRatePerBag);
                    return (effective > 0 && ratePerBag > 0)
                      ? `Rs. ${(effective * ratePerBag).toLocaleString("en-PK")}`
                      : "—";
                  })()}
                </div>
              </div>
            </div>
          </div>

          <Button onClick={handleAddIngredient} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />
            Add to Mix
          </Button>
        </div>

        {/* ── Current Mix Table ── */}
        <div id="section-current-mix" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4 scroll-mt-24">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-400" />
            Current Mix
            {store.ingredients.length > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({store.ingredients.length} item{store.ingredients.length > 1 ? "s" : ""})
              </span>
            )}
          </h3>

          {store.ingredients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No ingredients added yet. Use the form above to start building your mix.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold">#</TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Weight (kg)</TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Bags</TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate/kg</TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount</TableHead>
                    {totalBagAmount > 0 && <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Bag Amt</TableHead>}
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold w-16">Del</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {store.ingredients.map((ing, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-slate-800 text-sm">{ing.product}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtRs(ing.weight_kg)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-slate-600">
                        {ing.bags ? ing.bags.toLocaleString("en-PK", { maximumFractionDigits: 2 }) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtRs(ing.rate_per_kg)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-slate-800">Rs. {fmtRs(ing.amount)}</TableCell>
                      {totalBagAmount > 0 && (
                        <TableCell className="text-right tabular-nums text-sm text-slate-600">
                          {ing.bag_amount ? `Rs. ${fmtRs(ing.bag_amount)}` : "—"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => store.removeIngredient(idx)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50/60 font-semibold">
                    <TableCell colSpan={2} className="text-slate-600 text-sm">Total</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">{fmtRs(usedWeight)} kg</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">
                      {store.ingredients.reduce((s, i) => s + (i.bags ?? 0), 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">Rs. {fmtRs(totalAmount)}</TableCell>
                    {totalBagAmount > 0 && (
                      <TableCell className="text-right tabular-nums text-sm text-slate-800">Rs. {fmtRs(totalBagAmount)}</TableCell>
                    )}
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Bill Summary & Actions ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <Receipt className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-bold uppercase text-slate-500">💰 Bill So Far</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-0.5">Rs. {fmtRs(totalAmount)}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-medium text-slate-500 mt-1">
                <span>
                  Total Bags: <span className="font-semibold text-slate-700">{store.ingredients.reduce((s, i) => s + (i.bags ?? 0), 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>
                </span>
                {totalAmount > 0 && store.ingredients.reduce((s, i) => s + (i.bags ?? 0), 0) > 0 && (
                  <span>
                    As Rate/Bag: <span className="font-semibold text-slate-700">Rs. {(totalAmount / store.ingredients.reduce((s, i) => s + (i.bags ?? 0), 0)).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>
                  </span>
                )}
                {totalBagAmount > 0 && (
                  <span>
                    Bag Amount total: <span className="font-semibold text-slate-700">Rs. {fmtRs(totalBagAmount)}</span>
                  </span>
                )}
              </div>
            </div>
            {store.customerType === "credit" && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                Credit (Udhaar)
              </span>
            )}
            {store.customerType === "cash" && (
              <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                Cash (Nagad)
              </span>
            )}
          </div>

          {/* Driver info readout (if entered) */}
          {(store.driverName || store.driverRent > 0) && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
              <div className="text-xs font-bold uppercase text-blue-600">🚚 Driver</div>
              <div className="flex-1 text-sm">
                {store.driverName && <span className="text-slate-700 font-medium">{store.driverName}</span>}
                {store.driverRent > 0 && (
                  <span className="text-slate-500 ml-3">Rent: <span className="font-semibold text-slate-700">Rs. {fmtRs(store.driverRent)}</span></span>
                )}
              </div>
            </div>
          )}

          {store.customerType === "cash" && (
            <div className="space-y-2">
              <Label htmlFor="cash-received" className="text-slate-600">Cash Received</Label>
              <div className="flex items-center gap-3 max-w-sm">
                <span className="text-sm font-medium text-slate-500">Rs.</span>
                <Input id="cash-received" type="number" min={0} step="any" placeholder="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
              </div>
              {Number(cashReceived) > 0 && (
                <p className={cn("text-xs font-medium", Number(cashReceived) >= totalAmount ? "text-green-600" : "text-red-500")}>
                  {Number(cashReceived) >= totalAmount
                    ? `Change: Rs. ${fmtRs(Number(cashReceived) - totalAmount)}`
                    : `Remaining: Rs. ${fmtRs(totalAmount - Number(cashReceived))}`}
                </p>
              )}
            </div>
          )}

          <Separator />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleCancel} className="flex-1 sm:flex-none border-slate-300 hover:bg-slate-100">
              <RotateCcw className="w-4 h-4 mr-1" />
              🔄 Cancel / Start Over
            </Button>
            <Button onClick={handleFinishOrder} disabled={saving} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-semibold">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              {saving ? "Saving..." : "✅ Finish Order & Download Bill (PDF)"}
            </Button>
          </div>
        </div>

        {/* ── Past Mix Orders ── */}
        <PastMixOrdersSection
          pastSearchInput={pastSearchInput}
          setPastSearchInput={setPastSearchInput}
          pastOrders={pastOrders}
          selectedPastId={selectedPastId}
          setSelectedPastId={setSelectedPastId}
          selectedPast={selectedPast}
          page={pastQ.data?.page ?? 1}
          totalPages={pastQ.data?.totalPages ?? 1}
          total={pastQ.data?.total ?? 0}
          isFetching={pastQ.isFetching}
          isLoading={pastQ.isLoading && !pastQ.data}
          onPrev={() => setPastPage((p) => Math.max(1, p - 1))}
          onNext={() => setPastPage((p) => p + 1)}
          onDownloadExcel={handleDownloadPastExcel}
          downloadingExcel={downloadingPastExcel}
          isSearchActive={pastSearchDebounced.trim().length > 0}
          searchQuery={pastSearchDebounced}
        />
      </div>
    </div>
  );
}

/* ─── Past Mix Orders Sub-Section ─── */
function PastMixOrdersSection({
  pastSearchInput,
  setPastSearchInput,
  pastOrders,
  selectedPastId,
  setSelectedPastId,
  selectedPast,
  page,
  totalPages,
  total,
  isFetching,
  isLoading,
  onPrev,
  onNext,
  onDownloadExcel,
  downloadingExcel,
  isSearchActive,
  searchQuery,
}: {
  pastSearchInput: string;
  setPastSearchInput: (v: string) => void;
  pastOrders: any[];
  selectedPastId: string | null;
  setSelectedPastId: (v: string | null) => void;
  selectedPast: any | null;
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDownloadExcel: () => void;
  downloadingExcel: boolean;
  isSearchActive: boolean;
  searchQuery: string;
}) {
  return (
    <section className="space-y-4">
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-800">Past Mix Orders</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadExcel}
          disabled={downloadingExcel || total === 0}
          className="border-slate-300 hover:bg-slate-100"
        >
          {downloadingExcel ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 mr-1" />
          )}
          {downloadingExcel ? "Downloading..." : "Download Excel (All)"}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by customer name… (server-side)"
          value={pastSearchInput}
          onChange={(e) => {
            setPastSearchInput(e.target.value);
          }}
          className="pl-9"
        />
        {pastSearchInput && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
            onClick={() => setPastSearchInput("")}
          >
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
          Loading past orders...
        </div>
      ) : pastOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center text-slate-500 text-sm">
          {isSearchActive ? (
            <>
              <Search className="size-8 mx-auto mb-2 opacity-30" />
              No record for the customer &quot;{searchQuery}&quot;.
            </>
          ) : (
            "No past mix orders recorded yet."
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Order ID</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Date</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Driver</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className={cn("cursor-pointer", selectedPastId === order.id && "bg-slate-50")}
                    onClick={() => setSelectedPastId(selectedPastId === order.id ? null : order.id)}
                  >
                    <TableCell className="font-mono text-xs text-slate-600">{order.id}</TableCell>
                    <TableCell className="font-medium text-slate-800 text-sm">{order.customer}</TableCell>
                    <TableCell className="text-sm text-slate-600">{order.date}</TableCell>
                    <TableCell className="text-sm text-slate-600">{order.driverName || "—"}{order.driverRent > 0 ? <span className="block text-xs text-slate-400">Rs. {fmtRs(order.driverRent)}</span> : null}</TableCell>
                    <TableCell className="text-right text-sm text-slate-600">{order.sales?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="border-t border-slate-100 bg-slate-50/50 p-3 flex items-center justify-end gap-3">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
              {" · "}
              {total} orders
              {isFetching ? " · loading…" : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={onPrev}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={onNext}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {selectedPast && (() => {
            const billItems = (selectedPast.sales ?? []).map((s: any) => ({
              product: s.product_name ?? "Unknown",
              weight_kg: s.quantity,
              rate_per_kg: s.rate_per_bag,
              amount: s.quantity * s.rate_per_bag,
            }));
            const billTotalWeight = billItems.reduce((s, i) => s + i.weight_kg, 0);
            const billTotalAmount = billItems.reduce((s, i) => s + i.amount, 0);

            return (<>
              {/* Screen: order detail */}
              <div className="border-t border-slate-200/60 bg-slate-50/50 p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="text-sm font-bold text-slate-700">
                    📋 {selectedPast.id} — {selectedPast.customer}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-300 hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      generateMixBillPDF({
                        orderId: selectedPast.id,
                        customerName: selectedPast.customer,
                        customerType: "credit",
                        orderDate: selectedPast.date,
                        items: billItems,
                        totalWeight: billTotalWeight,
                        totalAmount: billTotalAmount,
                        driverName: selectedPast.driverName || null,
                        driverRent: selectedPast.driverRent || 0,
                      }).then((billResult) => {
                        toast.success("Bill PDF download ho rahi hai!", {
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
                      })
                      .catch(() => toast.error("PDF bill generate nahi ho saki"));
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download Bill (PDF)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-300 hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      printMixBill(
                        { id: selectedPast.id, customer: selectedPast.customer, date: selectedPast.date, driverName: selectedPast.driverName, driverRent: selectedPast.driverRent },
                        billItems,
                        billTotalWeight,
                        billTotalAmount,
                      );
                    }}
                  >
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    Print Bill
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">#</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Weight (kg)</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate/kg</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-slate-800 text-sm">{item.product}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmtRs(item.weight_kg)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmtRs(item.rate_per_kg)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-slate-800">Rs. {fmtRs(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-100/60 font-semibold">
                        <TableCell colSpan={2} className="text-slate-600 text-sm">Total</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-slate-800">
                          {fmtRs(billTotalWeight)} kg
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums text-sm text-slate-800">
                          Rs. {fmtRs(billTotalAmount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>);
          })()}
        </div>
      )}
    </section>
  );
}
