import type { Purchase, Customer, Supplier, Product } from "../types";
import type { BillShareInfo } from "./share-whatsapp";
import { buildPurchaseBillCaption } from "./share-whatsapp";

/* ─── Farm branding constants (matches generate-customer-bill.ts) ─── */
const FARM_NAME = "DANISH FARMHOUSE";
const FARM_TAGLINE = "Cattle Feed Supplier";
const FARM_ADDRESS = "Main Road, Tehsil & District Kasur, Punjab";
const FARM_PHONE = "0300-0000000";
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
const C_AMBER: [number, number, number] = [180, 120, 30];

/**
 * Generate a PDF BILL for a single purchase record.
 *
 * Works for BOTH types of purchases:
 *   1. Supplier purchase (settled_by_customer_id IS NULL) — we bought
 *      goods from a supplier and paid them cash.
 *   2. Buy-from-customer (settled_by_customer_id IS NOT NULL) — we
 *      bought goods from a customer and owe them money.
 *
 * The header label and the "purchased from" box adapt based on which
 * counterparty is present.
 *
 * Layout (single-page A4 portrait):
 *   ┌────────────────────────────────────────────────────────┐
 *   │  DANISH FARMHOUSE       (gold top line)                │
 *   │  Cattle Feed Supplier                                  │
 *   │  Address / Phone                PURCHASE BILL          │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Purchased From  |  Bill Summary                       │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Item table (single row: product, qty, rate, total)    │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Total Amount / Cash Paid / Pending                    │
 *   │  Notes                                                 │
 *   │  Signature line                                        │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Dev credit footer                                     │
 *   └────────────────────────────────────────────────────────┘
 */
export async function generatePurchaseBillPDF(params: {
  purchase: Purchase;
  customer?: Customer | null;
  supplier?: Supplier | null;
  product?: Product | null;
  locationName?: string | null;
  generatedAt: string;
}): Promise<BillShareInfo> {
  const { purchase, customer, supplier, product, locationName, generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("./number-to-words");

  // Determine counterparty
  const isBuyFromCustomer = !!purchase.settled_by_customer_id;
  const counterpartyName = isBuyFromCustomer
    ? customer?.name ?? "N/A"
    : supplier?.name ?? "N/A";
  const counterpartyPhone = isBuyFromCustomer ? customer?.phone ?? "—" : "—";
  const counterpartyType = isBuyFromCustomer
    ? (customer?.type === "credit" ? "Credit Customer" : "Cash Customer")
    : "Supplier";

  // Computed amounts
  const qty = Number(purchase.quantity ?? 0);
  const rate = Number(purchase.rate_per_bag ?? 0);
  const totalAmount = qty * rate;
  const cashPaid = Number(purchase.cash_paid ?? 0);
  const pending = Math.max(0, totalAmount - cashPaid);
  const status: "Fully Paid" | "Partially Paid" | "Unpaid" =
    cashPaid >= totalAmount && totalAmount > 0
      ? "Fully Paid"
      : cashPaid > 0
        ? "Partially Paid"
        : "Unpaid";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ═══════ TOP GOLD LINE ═══════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ═══════ HEADER ═══════ */
  const headerH = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C_GREEN);
  doc.text(FARM_NAME, m, 14);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GRAY);
  doc.text(FARM_TAGLINE, m, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 130, 140);
  doc.text(FARM_ADDRESS, m, 26);
  doc.text(`Phone: ${FARM_PHONE}`, m, 30);

  // Right: BILL label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_AMBER);
  doc.text("PURCHASE", pw - m, 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text(
    isBuyFromCustomer ? "Goods Bought From Customer" : "Goods Bought From Supplier",
    pw - m,
    20,
    { align: "right" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Bill #${purchase.id}`, pw - m, 27, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_GRAY);
  doc.text(`Generated: ${generatedAt}`, pw - m, 31, { align: "right" });

  // Gold + green divider
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 8;

  /* ═══════ TWO-COLUMN: Counterparty Info | Bill Summary ═══════ */
  const colW = (pw - m * 2 - 6) / 2;
  const colH = 26;
  const leftX = m;
  const rightX = m + colW + 6;

  // Left box — Purchased From / Bought From
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_AMBER);
  doc.rect(leftX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_AMBER);
  doc.text(isBuyFromCustomer ? "BOUGHT FROM" : "PURCHASED FROM", leftX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Name", leftX + 5, y + 11);
  doc.text("Phone", leftX + 5, y + 17);
  doc.text("Type", leftX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(counterpartyName.slice(0, 24), leftX + 28, y + 11);
  doc.setFontSize(8.5);
  doc.text(counterpartyPhone, leftX + 28, y + 17);
  doc.text(counterpartyType, leftX + 28, y + 23);

  // Right box — Bill Summary
  doc.setFillColor(...C_GREEN_LIGHT);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.roundedRect(rightX, y, colW, colH, 1.5, 1.5, "FD");
  doc.setFillColor(...C_AMBER);
  doc.rect(rightX, y, 1.5, colH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_AMBER);
  doc.text("SUMMARY", rightX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text("Date", rightX + 5, y + 11);
  doc.text("Location", rightX + 5, y + 17);
  doc.text("Bill #", rightX + 5, y + 23);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_DARK);
  doc.text(purchase.purchase_date || "—", rightX + 32, y + 11);
  doc.setFontSize(8.5);
  doc.text(locationName || "Farmhouse", rightX + 32, y + 17);
  doc.text(`#${purchase.id}`, rightX + 32, y + 23);

  y += colH + 8;

  /* ═══════ ITEM TABLE ═══════ */
  const unitLabel = purchase.unit_type === "kg" ? "kg" : "bags";
  const bagWeight = purchase.bag_weight_kg ?? 50;
  const totalKg = purchase.unit_type === "kg"
    ? qty
    : qty * bagWeight;

  const tData = [[
    "1",
    product?.name ?? `Product #${purchase.product_id}`,
    `${qty.toLocaleString("en-PK")} ${unitLabel}`,
    `${totalKg.toLocaleString("en-PK")} kg`,
    `Rs. ${rate.toLocaleString("en-PK")}`,
    `Rs. ${totalAmount.toLocaleString("en-PK")}`,
  ]];

  autoTable(doc, {
    startY: y,
    head: [["#", "Product", "Qty (bags/kg)", "Total kg", "Rate / bag", "Amount"]],
    body: tData,
    foot: [["", "", "", "", "TOTAL", `Rs. ${totalAmount.toLocaleString("en-PK")}`]],
    theme: "grid",
    headStyles: {
      fillColor: C_AMBER,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      lineColor: C_AMBER,
      lineWidth: 0.1,
      cellPadding: 3,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_AMBER,
      fontStyle: "bold",
      fontSize: 10,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 3,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: m, right: m },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  /* ═══════ PAYMENT BREAKDOWN BOX (Total / Cash Paid / Pending / Status) ═══════ */
  const boxH = 26;
  doc.setFillColor(...C_GOLD_LIGHT);
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(m, y, pw - m * 2, boxH, 1.5, 1.5, "FD");

  // Column dividers — 4 columns
  const colWidth = (pw - m * 2) / 4;
  const col1X = m + colWidth;
  const col2X = m + colWidth * 2;
  const col3X = m + colWidth * 3;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.2);
  doc.line(col1X, y + 4, col1X, y + boxH - 4);
  doc.line(col2X, y + 4, col2X, y + boxH - 4);
  doc.line(col3X, y + 4, col3X, y + boxH - 4);

  const labelY = y + 9;
  const valueY = y + 17;
  const subY = y + 22;

  // Total Amount
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("TOTAL AMOUNT", m + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text(`Rs. ${totalAmount.toLocaleString("en-PK")}`, m + colWidth / 2, valueY, { align: "center" });

  // Cash Paid
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("CASH PAID", col1X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  const cashPaidColor: [number, number, number] = cashPaid > 0 ? [20, 100, 60] : C_GRAY;
  doc.setTextColor(...cashPaidColor);
  doc.text(`Rs. ${cashPaid.toLocaleString("en-PK")}`, col1X + colWidth / 2, valueY, { align: "center" });

  // Pending
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("PENDING", col2X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  const pendingColor: [number, number, number] = pending > 0 ? [200, 80, 30] : C_GRAY;
  doc.setTextColor(...pendingColor);
  doc.text(`Rs. ${pending.toLocaleString("en-PK")}`, col2X + colWidth / 2, valueY, { align: "center" });

  // Status
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("STATUS", col3X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(10);
  const statusColor: [number, number, number] =
    status === "Fully Paid" ? [20, 100, 60] : status === "Partially Paid" ? [200, 80, 30] : [180, 60, 60];
  doc.setTextColor(...statusColor);
  doc.text(status, col3X + colWidth / 2, valueY, { align: "center" });

  // In-words sub-line
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_GRAY);
  doc.text(
    `Total in words: ${numberToRupeeWords(totalAmount)}`,
    m + 4,
    subY,
  );

  y += boxH + 6;

  /* ═══════ NOTES (optional) ═══════ */
  if (purchase.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREEN);
    doc.text("NOTES", m, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    const wrappedNotes = doc.splitTextToSize(purchase.notes, pw - m * 2);
    doc.text(wrappedNotes, m, y);
    y += wrappedNotes.length * 4 + 4;
  }

  /* ═══════ SIGNATURE LINE ═══════ */
  y = Math.max(y + 15, ph - 50);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, y, m + 60, y);
  doc.line(pw - m - 60, y, pw - m, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text(
    isBuyFromCustomer ? "Customer Signature" : "Supplier Signature",
    m,
    y + 5,
  );
  doc.text("Authorized Signature", pw - m - 60, y + 5);

  /* ═══════ DEV CREDIT FOOTER ═══════ */
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.5);
  doc.line(m, ph - 16, pw - m, ph - 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C_GRAY);
  doc.text(DEV_LINE1, m, ph - 11);
  doc.text(DEV_LINE2, m, ph - 7.5);
  doc.text("This is a computer-generated bill.", pw - m, ph - 7.5, { align: "right" });

  // Save
  const safeName = counterpartyName.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
  const fileName = `purchase-bill-${purchase.id}-${safeName}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  const caption = buildPurchaseBillCaption({
    billId: purchase.id,
    counterpartyName,
    counterpartyType: counterpartyType,
    date: purchase.purchase_date || generatedAt,
    totalAmount,
    cashPaid,
    pending,
    status,
    productName: product?.name,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
  };
}
