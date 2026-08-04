import type { Sale, Customer } from "../types";
import type { BillShareInfo } from "./share-whatsapp";
import { buildCustomerBillCaption } from "./share-whatsapp";

export interface CustomerBillResult extends BillShareInfo {
  /** Computed total bill (includes mix-order driver rents). */
  totalBill: number;
  /** Computed total cash paid. */
  totalCashPaid: number;
  /** Computed balance due. */
  balanceDue: number;
}

interface CustomerBillData {
  customer: Pick<Customer, "id" | "name" | "type" | "phone">;
  sales: Sale[];
  openingBalance: number;
  totalBill: number;
  totalCashPaid: number;
  balanceDue: number;
  generatedAt: string;
  // Customer's current advance balance (paid without buying anything).
  // Subtracted from Balance Due so the bill shows the true net payable.
  // Defaults to 0 when not provided (migration not yet applied).
  advancePayment?: number;
  // Optional mix-order driver info lookup — keyed by mix_order_id.
  // Mix orders store driver_name/driver_rent on the mix_orders table
  // (NOT on individual sale rows, where rickshaw_fare = 0).
  // Without this lookup, mix-order rows in the bill would show Rs. 0 rent
  // and miss the driver name.
  mixMeta?: Record<number, { driver_name: string | null; driver_rent: number }>;
  // Optional total of goods-settlement value (paid in goods by customer).
  // Used to recompute the correct Balance Due after we recompute Total Bill
  // from the displayed rows (which include mix-order driver rents the
  // database's total_bill field may not include).
  totalGoodsValue?: number;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
// Two physical addresses — shown together on every bill.
// Farm (where cattle feed is produced/stored) + Shop (where retail sale happens).
const FARM_ADDRESS = "Farm: Dry port phatak Faisalabad";
const SHOP_ADDRESS = "Shop: Madni kholoni shamsabad jhumra road";
const FARM_PHONE = "0300-3966715";
const DEV_LINE1 = "Software By: Shahid ALI";
const DEV_LINE2 = "Contact: 03271487858";

/* Color palette */
const C_GREEN: [number, number, number] = [8, 80, 57];
const C_GREEN_LIGHT: [number, number, number] = [240, 244, 240];
const C_GOLD: [number, number, number] = [245, 196, 56];
const C_GOLD_LIGHT: [number, number, number] = [252, 247, 232];
const C_DARK: [number, number, number] = [30, 40, 50];
const C_GRAY: [number, number, number] = [110, 120, 130];
const C_GRAY_LIGHT: [number, number, number] = [218, 222, 220];
const C_WHITE: [number, number, number] = [255, 255, 255];

export async function generateCustomerBillPDF(bill: CustomerBillData): Promise<CustomerBillResult> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("./number-to-words");

  // ── Pre-compute ACTUAL totals from displayed sales rows ──
  // These are the source of truth for ALL totals shown in the bill
  // (summary box at top + footer at bottom). They include mix-order
  // driver_rents (which the database's total_bill field may NOT include,
  // since driver_rent lives on the mix_orders table, not on sale rows).
  // Solo sale bill amount = qty * rate + rickshaw_fare (rickshaw_fare IS the driver rent).
  // Mix order bill amount = sum(ingredient qty * rate) + driver_rent (looked up via mixMeta).
  let actualTotalBill = 0;
  let actualTotalCash = 0;
  // Subtotal EXCLUDING driver rents / rickshaw fares — used for the
  // "As Rate/Bag" calculation (per-bag rate based on goods value only).
  let actualSubtotal = 0;
  // Total bag count across all sales — used for "As Rate/Bag".
  // Mix order ingredient rows are stored in kg with no bag_weight_kg, so
  // we derive bags as qty / 40 (40 kg = 1 bag, per business convention).
  // Solo sale rows in 'bags' use quantity directly; solo rows in 'kg'
  // use quantity / (bag_weight_kg ?? 40).
  let actualTotalBags = 0;
  const BAG_KG = 40;
  const seenMixOrderIds = new Set<number | string>();
  for (const sale of bill.sales) {
    if (sale.mix_order_id) {
      // Only count each mix order once (its row in the table is collapsed)
      if (seenMixOrderIds.has(sale.mix_order_id)) continue;
      seenMixOrderIds.add(sale.mix_order_id);
      const ingredients = bill.sales.filter((s) => s.mix_order_id === sale.mix_order_id);
      const ingredientsTotal = ingredients.reduce(
        (sum, s) => sum + s.quantity * s.rate_per_bag,
        0,
      );
      const mixMetaEntry = bill.mixMeta?.[Number(sale.mix_order_id)];
      const driverRent = mixMetaEntry?.driver_rent ?? 0;
      actualTotalBill += ingredientsTotal + driverRent;
      actualSubtotal += ingredientsTotal; // NO driver rent in subtotal
      actualTotalCash += ingredients.reduce((sum, s) => sum + s.cash_received, 0);
      // Each mix order ingredient row is in kg — derive bags = qty / 40
      actualTotalBags += ingredients.reduce(
        (sum, s) => sum + (s.quantity > 0 ? s.quantity / BAG_KG : 0),
        0,
      );
    } else {
      actualTotalBill += sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
      actualSubtotal += sale.quantity * sale.rate_per_bag; // NO rickshaw_fare in subtotal
      actualTotalCash += sale.cash_received;
      // Solo sale: bags = quantity if unit_type='bags' else quantity / (bag_weight_kg ?? 40)
      if (sale.unit_type === "bags") {
        actualTotalBags += sale.quantity;
      } else {
        const bw = sale.bag_weight_kg ?? BAG_KG;
        actualTotalBags += bw > 0 ? sale.quantity / bw : sale.quantity;
      }
    }
  }

  // As Rate/Bag = Subtotal (excluding rents) / Total Bags
  const hasAsRatePerBag = actualTotalBags > 0 && actualSubtotal > 0;
  const asRatePerBag = hasAsRatePerBag ? actualSubtotal / actualTotalBags : 0;
  const asRatePerBagStr = hasAsRatePerBag
    ? `Rs. ${asRatePerBag.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`
    : "";

  const totalGoodsValue = bill.totalGoodsValue ?? 0;
  const advancePayment = bill.advancePayment ?? 0;
  const effectiveTotalBill = actualTotalBill;
  const effectiveTotalCash = actualTotalCash;
  const effectiveBalanceDue =
    bill.openingBalance + effectiveTotalBill - effectiveTotalCash - totalGoodsValue - advancePayment;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  TOP GOLD LINE
   * ════════════════════════════════════════════════════════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ════════════════════════════════════════════════════════
   *  HEADER — Clean letterhead style
   * ════════════════════════════════════════════════════════ */
  // Header height increased from 36 → 42 to fit both Farm + Shop addresses
  // (previously only one address line + phone).
  const headerH = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C_GREEN);
  doc.text(FARM_NAME, m, 13);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GRAY);
  doc.text(FARM_TAGLINE, m, 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 130, 140);
  doc.text(FARM_ADDRESS, m, 25);
  doc.text(SHOP_ADDRESS, m, 29);
  doc.text(`Phone: ${FARM_PHONE}`, m, 33);

  // Right: LEDGER STATEMENT label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_GREEN);
  doc.text("LEDGER", pw - m, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text("Customer Statement", pw - m, 19, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Customer #${bill.customer.id}`, pw - m, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text(`Generated: ${bill.generatedAt}`, pw - m, 29, { align: "right" });

  // Gold + green divider
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 8;

  /* ════════════════════════════════════════════════════════
   *  TWO-COLUMN: Customer Info (left) | Summary (right)
   * ════════════════════════════════════════════════════════ */
  const colW = (pw - m * 2 - 6) / 2;
  const colH = 26;
  const leftX = m;
  const rightX = m + colW + 6;

  // Left box — Customer Info
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_GREEN);
  doc.rect(leftX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("CUSTOMER INFO", leftX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Name", leftX + 5, y + 11);
  doc.text("Phone", leftX + 5, y + 17);
  doc.text("Type", leftX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(bill.customer.name?.slice(0, 24) || "N/A", leftX + 28, y + 11);
  doc.setFontSize(8.5);
  doc.text(bill.customer.phone || "—", leftX + 28, y + 17);
  doc.text(bill.customer.type === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", leftX + 28, y + 23);

  // Right box — Statement Summary
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.roundedRect(rightX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_GREEN);
  doc.rect(rightX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("SUMMARY", rightX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Opening Bal.", rightX + 5, y + 11);
  doc.text("Total Sales", rightX + 5, y + 17);
  doc.text("Cash Paid", rightX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.setFontSize(8.5);
  // Use ACTUAL totals computed from displayed rows (include mix-order driver rents).
  doc.text(`Rs. ${bill.openingBalance.toLocaleString("en-PK")}`, rightX + 32, y + 11);
  doc.text(`Rs. ${effectiveTotalBill.toLocaleString("en-PK")}`, rightX + 32, y + 17);
  doc.text(`Rs. ${effectiveTotalCash.toLocaleString("en-PK")}`, rightX + 32, y + 23);

  // Advance Payment row — shown only when customer has advance balance > 0
  if (advancePayment > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C_GRAY);
    doc.text("Advance Paid", rightX + 5, y + 29);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GREEN);
    doc.text(`Rs. ${advancePayment.toLocaleString("en-PK")}`, rightX + 32, y + 29);
  }

  y += colH + 8;

  /* ════════════════════════════════════════════════════════
   *  TRANSACTION TABLE
   *  Row 1 (if opening balance > 0): highlighted "Opening Balance" row
   *  Then sales rows indexed 1..N
   * ════════════════════════════════════════════════════════ */
  type TableRow = { data: string[]; opening?: boolean };

  const rows: TableRow[] = [];

  // Opening Balance row — only when there is a previous balance
  if (bill.openingBalance > 0) {
    rows.push({
      opening: true,
      data: [
        "—",
        bill.customer.name ? "" : "", // (no date for opening balance)
        "Opening Balance (purana balance)",
        "—",
        "—",
        "—",
        `Rs. ${bill.openingBalance.toLocaleString("en-PK")}`,
        "—",
      ],
    });
  }

  let rowNum = 1;
  // actualTotalBill / actualTotalCash are computed upfront at the top of
  // this function so the summary box at the top of the bill can also use
  // them. We don't accumulate again here.

  bill.sales.forEach((sale, i) => {
    // ─── Mix Order rows are collapsed into a single "Mix Order" row ───
    // All ingredients share the same mix_order_id, sale_date, and cash_received.
    // We aggregate the bill amount and rickshaw, and show "Mix Order" as the product.
    if (sale.mix_order_id) {
      // Skip if we've already processed this mix order (first ingredient emits the row)
      // We detect this by checking if this is the first occurrence of this mix_order_id
      const mixOrderId = sale.mix_order_id;
      const firstOccurrenceIndex = bill.sales.findIndex((s) => s.mix_order_id === mixOrderId);
      if (firstOccurrenceIndex !== i) return; // already emitted, skip

      // Gather all ingredients of this mix order
      const ingredients = bill.sales.filter((s) => s.mix_order_id === mixOrderId);
      // Driver rent for mix orders lives on the mix_orders table — look it up via mixMeta.
      // Sale rows themselves have rickshaw_fare=0 for mix-order ingredients.
      const mixMetaEntry = bill.mixMeta?.[Number(mixOrderId)];
      const driverName = mixMetaEntry?.driver_name ?? sale.rickshaw_driver_name ?? null;
      const driverRent = mixMetaEntry?.driver_rent ?? 0;
      const ingredientsTotal = ingredients.reduce(
        (sum, s) => sum + s.quantity * s.rate_per_bag,
        0,
      );
      const totalBillAmount = ingredientsTotal + driverRent;
      const totalCashReceived = ingredients.reduce((sum, s) => sum + s.cash_received, 0);

      // Show driver name on a second line in the Product cell so the table
      // layout doesn't break (autoTable handles \n as a line break).
      const productCell = driverName
        ? `Mix Order\n(Driver: ${driverName})`
        : "Mix Order";

      rows.push({
        data: [
          String(rowNum),
          sale.sale_date || "",
          productCell,
          "—", // qty varies per ingredient, not meaningful as a single value
          "—", // rate varies per ingredient
          driverRent > 0 ? `Rs. ${driverRent.toLocaleString("en-PK")}` : "—",
          `Rs. ${totalBillAmount.toLocaleString("en-PK")}`,
          totalCashReceived > 0 ? `Rs. ${totalCashReceived.toLocaleString("en-PK")}` : "—",
        ],
      });
      rowNum++;
      return;
    }

    // ─── Solo sale — render normally ───
    const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
    const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
    // Show driver name on a second line in the Product cell (if present)
    const productName = sale.products?.name || `Product #${sale.product_id}`;
    const productCell = sale.rickshaw_driver_name
      ? `${productName}\n(Driver: ${sale.rickshaw_driver_name})`
      : productName;
    rows.push({
      data: [
        String(rowNum),
        sale.sale_date || "",
        productCell,
        `${sale.quantity.toLocaleString("en-PK")} ${unitLabel}`,
        `Rs. ${sale.rate_per_bag.toLocaleString("en-PK")}`,
        sale.rickshaw_fare > 0 ? `Rs. ${sale.rickshaw_fare.toLocaleString("en-PK")}` : "—",
        `Rs. ${billAmount.toLocaleString("en-PK")}`,
        sale.cash_received > 0 ? `Rs. ${sale.cash_received.toLocaleString("en-PK")}` : "—",
      ],
    });
    rowNum++;
  });

  // The opening-balance row spans the date column visually using empty string,
  // we leave the date column empty for it.
  // (autoTable doesn't natively support rowSpan; using a "—" marker is fine.)
  if (bill.openingBalance > 0 && rows[0].opening) {
    rows[0].data[1] = "Prev. Bal.";
  }

  const tData = rows.map((r) => r.data);
  const openingRowIndices = rows
    .map((r, i) => (r.opening ? i : -1))
    .filter((i) => i >= 0);

  // effectiveTotalBill / effectiveTotalCash / effectiveBalanceDue are
  // computed upfront at the top of this function (so the summary box at
  // the top of the bill can use the same values). Reuse them here for
  // the totals box at the bottom of the bill.
  const totalBillStr = `Rs. ${effectiveTotalBill.toLocaleString("en-PK")}`;
  const totalCashStr = `Rs. ${effectiveTotalCash.toLocaleString("en-PK")}`;
  const balanceStr = `Rs. ${effectiveBalanceDue.toLocaleString("en-PK")}`;

  autoTable(doc, {
    startY: y,
    head: [["#", "Date", "Product", "Qty", "Rate", "Driver Rent", "Bill Amt", "Cash Paid"]],
    body: tData,
    foot: [["", "", "", "", "", "TOTAL", totalBillStr, totalCashStr]],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      lineColor: C_GREEN,
      lineWidth: 0.1,
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2.5,
    },
    // Highlight the opening-balance row(s) in amber
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        openingRowIndices.includes(hookData.row.index)
      ) {
        hookData.cell.styles.fillColor = C_GOLD_LIGHT;
        hookData.cell.styles.textColor = C_GREEN;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    alternateRowStyles: { fillColor: [249, 251, 249] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 35 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 28, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  /* ════════════════════════════════════════════════════════
   *  TOTALS BOX (right) + Amount in words (left)
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const tBoxW = 80;
  const tBoxX = pw - m - tBoxW;
  // 4 rows when opening balance > 0, else 3 rows. Add 1 more row when advance > 0.
  // Add 1 more row when As Rate/Bag is shown (below Total Bill).
  const hasOpening = bill.openingBalance > 0;
  const hasAdvance = advancePayment > 0;
  const rowCount = (hasOpening ? 4 : 3) + (hasAdvance ? 1 : 0) + (hasAsRatePerBag ? 1 : 0);
  const tBoxH = 8 + rowCount * 7 + 10;

  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.roundedRect(tBoxX, fy, tBoxW, tBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  let ty = fy + 7;
  const labelX = tBoxX + 6;
  const valX = tBoxX + tBoxW - 6;

  // Opening Balance (only when > 0)
  if (hasOpening) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GRAY);
    doc.text("Opening Bal:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${bill.openingBalance.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
    ty += 7;
  }

  // Total Bill
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text("Total Bill:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalBillStr, valX, ty, { align: "right" });

  // As Rate/Bag (= Subtotal excluding rents / Total Bags) — below Total Bill
  if (hasAsRatePerBag) {
    ty += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GRAY);
    doc.text(`As Rate/Bag (${actualTotalBags.toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags):`, labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(asRatePerBagStr, valX, ty, { align: "right" });
  }

  // Cash Paid
  ty += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text("Cash Paid:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalCashStr, valX, ty, { align: "right" });

  // Advance Payment (only when > 0)
  if (hasAdvance) {
    ty += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GRAY);
    doc.text("Advance Paid:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_GREEN);
    doc.text(`Rs. ${advancePayment.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
  }

  // Divider
  ty += 5;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.5);
  doc.line(tBoxX + 4, ty, tBoxX + tBoxW - 4, ty);
  doc.setLineWidth(0.2);

  // Balance Due
  ty += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_GREEN);
  doc.text("BALANCE DUE", labelX, ty);
  doc.text(balanceStr, valX, ty, { align: "right" });

  // Amount in words — left side
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text("Balance in words:", m, fy + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  const wordsText = numberToRupeeWords(bill.balanceDue);
  const wordsLines = doc.splitTextToSize(wordsText, tBoxX - m - 6);
  doc.text(wordsLines, m, fy + 12);

  /* ════════════════════════════════════════════════════════
   *  TERMS & CONDITIONS
   * ════════════════════════════════════════════════════════ */
  const tcY = fy + tBoxH + 8;
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, tcY, pw - m, tcY);
  doc.setLineWidth(0.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_GREEN);
  doc.text("TERMS & CONDITIONS", m, tcY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("1. This is a computer-generated statement based on recorded transactions.", m, tcY + 8);
  doc.text("2. Please verify balances and report discrepancies within 7 days.", m, tcY + 11.5);
  doc.text("3. All disputes are subject to Faisalabad jurisdiction.", m, tcY + 15);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE SECTION
   * ════════════════════════════════════════════════════════ */
  let sigY = tcY + 22;
  if (sigY > ph - 30) sigY = ph - 30;

  doc.setDrawColor(...C_DARK);
  doc.setLineWidth(0.3);
  doc.line(pw - m - 65, sigY, pw - m, sigY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text("For Danish Cattle Feed", pw - m - 32.5, sigY + 4, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text("Authorised Signatory", pw - m - 32.5, sigY + 8, { align: "center" });

  // Stamp circle on left
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.circle(m + 14, sigY - 3, 11, "S");
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GOLD);
  doc.circle(m + 14, sigY - 3, 9, "S");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_GREEN);
  doc.text("DANISH", m + 14, sigY - 5, { align: "center" });
  doc.text("CATTLE FEED", m + 14, sigY - 1.5, { align: "center" });
  doc.setFontSize(4.5);
  doc.setTextColor(...C_GOLD);
  doc.text("★ FSD ★", m + 14, sigY + 2, { align: "center" });

  /* ════════════════════════════════════════════════════════
   *  FOOTER BAND
   * ════════════════════════════════════════════════════════ */
  const footBandH = 13;
  const footY = ph - footBandH - 3;

  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.6);
  doc.line(m, footY - 2, pw - m, footY - 2);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY - 0.8, pw - m, footY - 0.8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREEN);
  doc.text(DEV_LINE1, pw / 2, footY + 3.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text(DEV_LINE2, pw / 2, footY + 8, { align: "center" });

  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 1.5, pw, 1.5, "F");

  const fileName = `Khata-Bill-${bill.customer.name.replace(/\s+/g, "-")}-${bill.customer.id}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  const caption = buildCustomerBillCaption({
    customerName: bill.customer.name ?? "N/A",
    generatedAt: bill.generatedAt,
    totalBill: effectiveTotalBill,
    cashPaid: effectiveTotalCash,
    balanceDue: effectiveBalanceDue,
    advancePayment,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
    totalBill: effectiveTotalBill,
    totalCashPaid: effectiveTotalCash,
    balanceDue: effectiveBalanceDue,
  };
}
