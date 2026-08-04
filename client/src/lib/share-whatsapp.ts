/**
 * WhatsApp Bill Sharing Helper
 * ─────────────────────────────────────────────────────────────
 * After a bill PDF downloads, the user may optionally share it
 * with the shop owner (client) on WhatsApp. The client's number
 * is hard-coded below.
 *
 * Behavior (simplified — Option A):
 *   Always opens https://wa.me/<number>?text=<caption> in a new
 *   tab. The caption message (customer name, amount, date, etc.)
 *   is pre-filled; the user must manually attach the just-downloaded
 *   PDF (which is already in their Downloads folder).
 *
 * Why no Web Share API:
 *   We previously tried navigator.share() with the PDF attached.
 *   On Android Chrome this was unreliable — the promise would
 *   silently resolve WITHOUT the share sheet ever appearing
 *   visually (silent file-share failure). Some browsers also
 *   require HTTPS (secure context), throwing AbortError on HTTP.
 *   The wa.me link approach is 100% reliable across all browsers
 *   and OS versions; the only trade-off is that the user must
 *   attach the PDF manually (one extra tap).
 *
 * The toast helper (share-whatsapp-toast.tsx) shows clear
 * step-by-step instructions for the manual attachment.
 */

/** Client's WhatsApp number in international format (no "+", no spaces). */
// Local number 03003966715 → drop leading 0, prepend Pakistan country code 92.
export const CLIENT_WHATSAPP_NUMBER = "923003966715";

/** Client's local number (for display only). */
export const CLIENT_WHATSAPP_DISPLAY = "0300-3966715";

export interface BillShareInfo {
  /** PDF blob returned by jsPDF.output("blob"). */
  blob: Blob;
  /** Filename (without path) — used when constructing the File. */
  fileName: string;
  /** Short human-readable caption for the WhatsApp message. */
  caption: string;
}

/**
 * Open WhatsApp chat with the client's number pre-filled with
 * the caption text. Used as a desktop fallback (user must
 * manually attach the downloaded PDF).
 *
 * MUST be called synchronously from a user-gesture event handler
 * (e.g. onClick) — otherwise the browser's popup blocker will
 * silently swallow the new-tab open.
 *
 * Strategy (most reliable first):
 *   1. Create a real <a href="..." target="_blank"> element, append
 *      to DOM, call .click(), then remove. Browsers treat anchor
 *      clicks as "navigation" (not popups) and allow them much more
 *      reliably than window.open. This is the standard pattern used
 *      by download libraries (jsPDF, file-saver, etc.).
 *   2. If that somehow fails (returns false / throws), fall back to
 *      window.open(url, "_blank").
 *   3. If window.open returns null (popup blocker engaged), fall
 *      back to window.location.href = url so the chat opens in the
 *      same tab.
 *
 * Returns the URL that was attempted, so callers can show a manual
 * "click here" fallback link in case everything failed.
 */
function openWhatsAppChat(caption: string): { url: string; opened: boolean } {
  const url = `https://wa.me/${CLIENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    caption,
  )}`;

  console.log("[share-whatsapp] openWhatsAppChat called with URL:", url);

  // Strategy 1: anchor element click (most reliable)
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    // Some browsers require the anchor to be in the DOM for .click() to fire.
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "0";
    a.setAttribute("aria-hidden", "true");
    document.body.appendChild(a);
    a.click();
    // Cleanup — small delay so the click event has time to register
    setTimeout(() => {
      try { document.body.removeChild(a); } catch { /* already removed */ }
    }, 100);
    console.log("[share-whatsapp] anchor click fired");
    return { url, opened: true };
  } catch (err) {
    console.warn("[share-whatsapp] anchor click failed:", err);
  }

  // Strategy 2: window.open
  try {
    const win = window.open(url, "_blank");
    if (win) {
      console.log("[share-whatsapp] window.open succeeded");
      return { url, opened: true };
    }
    console.warn("[share-whatsapp] window.open returned null (popup blocked)");
  } catch (err) {
    console.warn("[share-whatsapp] window.open threw:", err);
  }

  // Strategy 3: same-tab navigation (last resort)
  try {
    window.location.href = url;
    console.log("[share-whatsapp] falling back to location.href");
    return { url, opened: true };
  } catch (err) {
    console.error("[share-whatsapp] location.href failed:", err);
  }

  // All strategies failed — return the URL so caller can show a link
  return { url, opened: false };
}

/**
 * Result of shareBillOnWhatsApp.
 *
 * As of the simplification (Option A), we ALWAYS use the wa.me link
 * path — no Web Share API. The PDF must be attached manually by the
 * user from their Downloads folder. This is less magical than the
 * native share sheet, but it is 100% reliable across all browsers
 * and OS versions, which the Web Share API never was (silent
 * resolves, AbortError bugs, insecure-context requirements, etc.).
 */
export interface ShareBillResult {
  /** true if the wa.me link was opened. */
  triggered: boolean;
  /** The wa.me URL — caller can render it as a clickable link
   *  in case the auto-open was blocked. */
  url: string;
  /** Always "link" now (we no longer use the native path). */
  method: "link" | "failed";
  /** Always false — wa.me URLs cannot carry files. The PDF must
   *  be attached manually by the user. */
  fileAttached: boolean;
}

/**
 * Open WhatsApp chat with the client's number, pre-filled with the
 * bill caption text. Synchronous so the browser's popup blocker
 * doesn't swallow the new-tab open.
 *
 * The PDF file CANNOT be attached via wa.me — WhatsApp's URL scheme
 * only supports text. The user must manually attach the PDF from
 * their Downloads folder after the chat opens. The toast helper
 * shows step-by-step instructions for this.
 *
 * Strategy (most reliable first):
 *   1. Create a real <a href="..." target="_blank"> element, append
 *      to DOM, call .click(), then remove. Browsers treat anchor
 *      clicks as "navigation" (not popups) and allow them much more
 *      reliably than window.open. This is the standard pattern used
 *      by download libraries (jsPDF, file-saver, etc.).
 *   2. If that somehow fails (returns false / throws), fall back to
 *      window.open(url, "_blank").
 *   3. If window.open returns null (popup blocker engaged), fall
 *      back to window.location.href = url so the chat opens in the
 *      same tab.
 */
export function shareBillOnWhatsApp(info: BillShareInfo): ShareBillResult {
  console.log("[share-whatsapp] shareBillOnWhatsApp called", {
    hasBlob: !!info.blob,
    fileName: info.fileName,
    captionLength: info.caption?.length ?? 0,
  });

  const result = openWhatsAppChat(info.caption);
  return {
    triggered: result.opened,
    url: result.url,
    method: result.opened ? "link" : "failed",
    fileAttached: false,
  };
}

/* ── Caption builders ──────────────────────────────────────
 * Each bill type has its own caption format. All captions are
 * short enough to fit in a WhatsApp text bubble and include the
 * key numbers so the recipient can identify the bill without
 * opening the PDF.
 */

export function buildCustomerBillCaption(params: {
  customerName: string;
  generatedAt: string;
  totalBill: number;
  cashPaid: number;
  balanceDue: number;
  advancePayment?: number;
}): string {
  const { customerName, generatedAt, totalBill, cashPaid, balanceDue, advancePayment } = params;
  const lines = [
    "🧾 *Bill from DANISH CATTLE FEED*",
    `Customer: ${customerName || "—"}`,
    `Date: ${generatedAt}`,
    `Total Bill: Rs. ${totalBill.toLocaleString("en-PK")}`,
    `Cash Paid: Rs. ${cashPaid.toLocaleString("en-PK")}`,
  ];
  if (advancePayment && advancePayment > 0) {
    lines.push(`Advance Paid: Rs. ${advancePayment.toLocaleString("en-PK")}`);
  }
  lines.push(`*Balance Due: Rs. ${balanceDue.toLocaleString("en-PK")}*`);
  lines.push("\n(PDF bill neeche attach karni hai 👆)");
  return lines.join("\n");
}

export function buildMixBillCaption(params: {
  orderId: string;
  customerName: string;
  orderDate: string;
  grandTotal: number;
  cashReceived?: number;
  driverName?: string | null;
}): string {
  const { orderId, customerName, orderDate, grandTotal, cashReceived, driverName } = params;
  const lines = [
    "🧾 *Mix Order Bill from DANISH CATTLE FEED*",
    `Order #: ${orderId}`,
    `Customer: ${customerName || "—"}`,
    `Date: ${orderDate}`,
  ];
  if (driverName) lines.push(`Driver: ${driverName}`);
  lines.push(`*Grand Total: Rs. ${grandTotal.toLocaleString("en-PK")}*`);
  if (cashReceived !== undefined) {
    const change = cashReceived - grandTotal;
    lines.push(`Cash Received: Rs. ${cashReceived.toLocaleString("en-PK")}`);
    if (change >= 0) {
      lines.push(`Change: Rs. ${change.toLocaleString("en-PK")}`);
    }
  }
  lines.push("\n(PDF bill neeche attach karni hai 👆)");
  return lines.join("\n");
}

export function buildPurchaseBillCaption(params: {
  billId: number | string;
  counterpartyName: string;
  counterpartyType: string; // "Supplier" | "Credit Customer" | "Cash Customer"
  date: string;
  totalAmount: number;
  cashPaid: number;
  pending: number;
  status: string;
  productName?: string;
}): string {
  const { billId, counterpartyName, counterpartyType, date, totalAmount, cashPaid, pending, status, productName } = params;
  const lines = [
    "🧾 *Purchase Bill from DANISH CATTLE FEED*",
    `Bill #: ${billId}`,
    `${counterpartyType}: ${counterpartyName || "—"}`,
    `Date: ${date}`,
  ];
  if (productName) lines.push(`Product: ${productName}`);
  lines.push(`Total Amount: Rs. ${totalAmount.toLocaleString("en-PK")}`);
  lines.push(`Cash Paid: Rs. ${cashPaid.toLocaleString("en-PK")}`);
  lines.push(`Pending: Rs. ${pending.toLocaleString("en-PK")}`);
  lines.push(`Status: *${status}*`);
  lines.push("\n(PDF bill neeche attach karni hai 👆)");
  return lines.join("\n");
}

export function buildPurchaseReceiptCaption(params: {
  receiptId: number | string;
  counterpartyName: string;
  counterpartyType: string;
  date: string;
  cashPaid: number;
  pending: number;
  status: string;
  productName?: string;
}): string {
  const { receiptId, counterpartyName, counterpartyType, date, cashPaid, pending, status, productName } = params;
  const lines = [
    "🧾 *Payment Receipt from DANISH CATTLE FEED*",
    `Receipt #: ${receiptId}`,
    `Paid To (${counterpartyType}): ${counterpartyName || "—"}`,
    `Date: ${date}`,
  ];
  if (productName) lines.push(`Product: ${productName}`);
  lines.push(`*Amount Paid: Rs. ${cashPaid.toLocaleString("en-PK")}*`);
  lines.push(`Pending: Rs. ${pending.toLocaleString("en-PK")}`);
  lines.push(`Status: *${status}*`);
  lines.push("\n(PDF bill neeche attach karni hai 👆)");
  return lines.join("\n");
}
