import type { BillShareInfo } from "./share-whatsapp";
import { buildMixBillCaption } from "./share-whatsapp";

interface BillItem {
  product: string;
  weight_kg: number;
  rate_per_kg: number;
  amount: number;
  bags?: number | null;
  rate_per_bag?: number | null;
  bag_amount?: number | null;
}

interface BillData {
  orderId: string;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  location?: string | null;
  items: BillItem[];
  totalWeight: number;
  totalAmount: number;
  totalBagAmount?: number;
  cashReceived?: number;
  driverName?: string | null;
  driverRent?: number;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
// Two physical addresses — shown together on every bill.
const FARM_ADDRESS = "Farm: Dry port phatak Faisalabad";
const SHOP_ADDRESS = "Shop: Madni kholoni shamsabad jhumra road";
const FARM_PHONE = "0300-3966715";
const DEV_LINE1 = "Software By: Shahid ALI";
const DEV_LINE2 = "Contact: 03271487858";

/* Color palette — deep emerald + gold accent */
const C_GREEN: [number, number, number] = [8, 80, 57];
const C_GREEN_LIGHT: [number, number, number] = [240, 244, 240];
const C_GOLD: [number, number, number] = [245, 196, 56];
const C_GOLD_LIGHT: [number, number, number] = [252, 247, 232];
const C_DARK: [number, number, number] = [30, 40, 50];
const C_GRAY: [number, number, number] = [110, 120, 130];
const C_GRAY_LIGHT: [number, number, number] = [218, 222, 220];
const C_WHITE: [number, number, number] = [255, 255, 255];

export async function generateMixBillPDF(bill: BillData): Promise<BillShareInfo> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("./number-to-words");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  TOP GOLD LINE
   * ════════════════════════════════════════════════════════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ════════════════════════════════════════════════════════
   *  HEADER — Clean letterhead style (white bg, green text)
   * ════════════════════════════════════════════════════════ */
  // Header height increased from 36 → 42 to fit both Farm + Shop addresses.
  const headerH = 42;
  // Left: Farm name block
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

  // Right: INVOICE label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_GREEN);
  doc.text("INVOICE", pw - m, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text("Mix Order", pw - m, 19, { align: "right" });

  // Bill No + Date on right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Bill No: #${bill.orderId}`, pw - m, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text(`Date: ${bill.orderDate}`, pw - m, 29, { align: "right" });

  // Horizontal divider line (gold)
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  // Thin green line below gold
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 8;

  /* ════════════════════════════════════════════════════════
   *  TWO-COLUMN: Bill To (left) | Order Details (right)
   * ════════════════════════════════════════════════════════ */
  const colW = (pw - m * 2 - 6) / 2; // 6mm gap between columns
  const colH = 26;
  const leftX = m;
  const rightX = m + colW + 6;

  // Left box — Bill To
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, colW, colH, 1.5, 1.5, "FD");

  // Left accent bar
  doc.setFillColor(...C_GREEN);
  doc.rect(leftX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("BILL TO", leftX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Customer Name", leftX + 5, y + 11);
  doc.text("Order Type", leftX + 5, y + 17);
  doc.text("Driver", leftX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(bill.customerName?.slice(0, 24) || "N/A", leftX + 32, y + 11);
  doc.setFontSize(8.5);
  doc.text(bill.customerType === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", leftX + 32, y + 17);
  doc.text(bill.driverName?.slice(0, 20) || "—", leftX + 32, y + 23);

  // Right box — Order Details
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.roundedRect(rightX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_GREEN);
  doc.rect(rightX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("ORDER DETAILS", rightX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Bill No.", rightX + 5, y + 11);
  doc.text("Order Date", rightX + 5, y + 17);
  doc.text("Target Weight", rightX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(`#${bill.orderId}`, rightX + 32, y + 11);
  doc.setFontSize(8.5);
  doc.text(bill.orderDate, rightX + 32, y + 17);
  doc.text(`${bill.totalWeight.toLocaleString("en-PK")} kg`, rightX + 32, y + 23);

  y += colH + 8;

  /* ════════════════════════════════════════════════════════
   *  INGREDIENTS TABLE
   * ════════════════════════════════════════════════════════ */
  const hasBagInfo = bill.items.some(
    (i) => (i.bags && i.bags > 0) || (i.rate_per_bag && i.rate_per_bag > 0)
  );

  let head: string[];
  let tData: string[][];
  let columnStyles: Record<number, any>;

  if (hasBagInfo) {
    head = ["#", "Product", "Wt (kg)", "Rate/kg", "Amount", "Bags", "Rate/Bag", "Bag Amt"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
      ing.bags ? String(ing.bags) : "—",
      ing.rate_per_bag ? `Rs. ${ing.rate_per_bag.toLocaleString("en-PK")}` : "—",
      ing.bag_amount ? `Rs. ${ing.bag_amount.toLocaleString("en-PK")}` : "—",
    ]);
    columnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 22, halign: "right" },
    };
  } else {
    head = ["#", "Product Name", "Weight (kg)", "Rate / kg", "Amount"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
    ]);
    columnStyles = {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 40, halign: "right" },
    };
  }

  const tw = bill.items.reduce((s, i) => s + i.weight_kg, 0).toLocaleString("en-PK");
  const ta = `Rs. ${bill.totalAmount.toLocaleString("en-PK")}`;

  const foot: string[] = hasBagInfo
    ? ["", "TOTAL", `${tw} kg`, "", ta, "", "", (bill.totalBagAmount ?? 0) > 0 ? `Rs. ${(bill.totalBagAmount ?? 0).toLocaleString("en-PK")}` : ""]
    : ["", "TOTAL", `${tw} kg`, "", ta];

  autoTable(doc, {
    startY: y,
    head: [head],
    body: tData,
    foot: [foot],
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
    alternateRowStyles: { fillColor: [249, 251, 249] },
    columnStyles,
    margin: { left: m, right: m },
  });

  /* ════════════════════════════════════════════════════════
   *  TOTALS BOX (right-aligned) + Amount in words (left)
   *  Subtotal = sum of all ingredient amounts (excluding driver rent)
   *  As Rate/Bag = Subtotal / Total Bags  (shown below Subtotal)
   *  Grand Total = Subtotal + Driver Rent (if any)
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const hasDriverRent = bill.driverRent && bill.driverRent > 0;
  const isCash = bill.customerType === "cash" && bill.cashReceived !== undefined;
  // Subtotal = bill.totalAmount (sum of ingredient amounts, NO driver rent)
  const subtotal = bill.totalAmount;
  const subtotalStr = `Rs. ${subtotal.toLocaleString("en-PK")}`;
  // Grand Total = subtotal + driver rent (this is what customer actually pays)
  const grandTotal = subtotal + (hasDriverRent ? bill.driverRent! : 0);
  const grandTotalStr = `Rs. ${grandTotal.toLocaleString("en-PK")}`;

  // As Rate/Bag — Subtotal divided by total bags in the order.
  // Total bags per ingredient: use explicit `bags` if entered, else
  // auto-derive from kg (40 kg = 1 bag).
  const BAG_KG = 40;
  const totalBags = bill.items.reduce(
    (sum, i) => sum + (i.bags && i.bags > 0 ? i.bags : i.weight_kg / BAG_KG),
    0,
  );
  const hasAsRatePerBag = totalBags > 0;
  const asRatePerBag = hasAsRatePerBag ? subtotal / totalBags : 0;
  const asRatePerBagStr = hasAsRatePerBag
    ? `Rs. ${asRatePerBag.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`
    : "";

  // Totals box on right side
  const tBoxW = 80;
  const tBoxX = pw - m - tBoxW;
  // Calculate height based on rows
  let totalRows = 1; // subtotal
  if (hasAsRatePerBag) totalRows++; // As Rate/Bag (below subtotal)
  if (hasDriverRent) totalRows++;
  if (isCash) totalRows += 2; // cash + change
  const tBoxH = 8 + totalRows * 7 + 10; // grand total row is taller

  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.roundedRect(tBoxX, fy, tBoxW, tBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  let ty = fy + 7;
  const labelX = tBoxX + 6;
  const valX = tBoxX + tBoxW - 6;

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text("Subtotal:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(subtotalStr, valX, ty, { align: "right" });

  // As Rate/Bag (= Subtotal / Total Bags) — shown BELOW Subtotal
  if (hasAsRatePerBag) {
    ty += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GRAY);
    doc.text(`As Rate/Bag (${totalBags.toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags):`, labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(asRatePerBagStr, valX, ty, { align: "right" });
  }

  // Driver Rent
  if (hasDriverRent) {
    ty += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GRAY);
    doc.text("Driver Rent:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${bill.driverRent!.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
  }

  // Gold divider line
  ty += 5;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.5);
  doc.line(tBoxX + 4, ty, tBoxX + tBoxW - 4, ty);
  doc.setLineWidth(0.2);

  // Grand Total (= Subtotal + Driver Rent)
  ty += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_GREEN);
  doc.text("GRAND TOTAL", labelX, ty);
  doc.text(grandTotalStr, valX, ty, { align: "right" });

  // Cash received + change (change is calculated from grand total, not subtotal)
  if (isCash) {
    const cash = bill.cashReceived as number;
    ty += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GRAY);
    doc.text("Cash Received:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${cash.toLocaleString("en-PK")}`, valX, ty, { align: "right" });

    ty += 6;
    const change = cash - grandTotal;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_GRAY);
    doc.text("Change:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(change >= 0 ? 8 : 180, change >= 0 ? 120 : 30, change >= 0 ? 60 : 30);
    doc.text(`Rs. ${change.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
  }

  // Amount in words — left side, below table (reflects GRAND TOTAL)
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text("Amount in words:", m, fy + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  const wordsText = numberToRupeeWords(grandTotal);
  // Wrap if too long
  const wordsLines = doc.splitTextToSize(wordsText, tBoxX - m - 6);
  doc.text(wordsLines, m, fy + 12);

  /* ════════════════════════════════════════════════════════
   *  TERMS & CONDITIONS — boxed badge
   * ════════════════════════════════════════════════════════ */
  const tcY = Math.max(fy + tBoxH + 8, fy + 22);
  const tcBoxH = 22;

  // Box background (light cream)
  doc.setFillColor(...C_GOLD_LIGHT);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(m, tcY, pw - m * 2, tcBoxH, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  // Left accent bar
  doc.setFillColor(...C_GREEN);
  doc.rect(m, tcY, 1.5, tcBoxH, "F");

  // Title badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_GREEN);
  doc.text("TERMS & CONDITIONS", m + 5, tcY + 5);

  // Terms list
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 90, 100);
  doc.text("1. Goods once sold will not be returned or exchanged.", m + 5, tcY + 10);
  doc.text("2. All disputes are subject to Faisalabad jurisdiction.", m + 5, tcY + 14);
  doc.text("3. Please verify bill details at the time of delivery.", m + 5, tcY + 18);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE SECTION
   * ════════════════════════════════════════════════════════ */
  let sigY = tcY + tcBoxH + 14;
  if (sigY > ph - 30) sigY = ph - 30;

  // Signature line on right
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
   *  FOOTER BAND — Software By credit
   * ════════════════════════════════════════════════════════ */
  const footBandH = 13;
  const footY = ph - footBandH - 3;

  // Top divider (gold + green)
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.6);
  doc.line(m, footY - 2, pw - m, footY - 2);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY - 0.8, pw - m, footY - 0.8);

  // Footer text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREEN);
  doc.text(DEV_LINE1, pw / 2, footY + 3.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text(DEV_LINE2, pw / 2, footY + 8, { align: "center" });

  // Bottom gold line
  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 1.5, pw, 1.5, "F");

  const fileName = `Mix-Bill-${bill.orderId}-${bill.customerName.replace(/\s+/g, "-")}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  // grandTotal was computed above (subtotal + driver rent).
  const caption = buildMixBillCaption({
    orderId: bill.orderId,
    customerName: bill.customerName,
    orderDate: bill.orderDate,
    grandTotal,
    cashReceived: bill.cashReceived,
    driverName: bill.driverName ?? null,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
  };
}
